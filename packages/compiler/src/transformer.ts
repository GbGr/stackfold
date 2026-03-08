/**
 * AST transformer: the main ts.TransformerFactory entry point that
 * orchestrates layout discovery, eligibility checking, escape analysis,
 * and lowering passes.
 *
 * This transformer processes source files and replaces:
 * - Stack<T> type declarations → (erased, types only)
 * - stack.make<T>({...}) → scalar local declarations
 * - stack.zero<T>() → zero-initialized scalar locals
 * - v.x reads → v_x
 * - v.x = expr writes → v_x = expr
 * - stack.materialize(v) → { x: v_x, y: v_y, z: v_z }
 * - Functions with stack params/returns → flattened ABI
 * - Call sites → flattened arguments
 */

import type ts from 'typescript'
import type { Diagnostic } from './diagnostics.js'
import type { StructLayout } from './layout.js'
import type { StackConfig } from './config.js'
import type { FunctionABI, LoweredParam } from './lowering/functions.js'
import { LayoutEngine } from './layout.js'
import { checkEligibility } from './eligibility.js'
import { analyzeEscapes, type TransformedFunctionSet } from './escape-analysis.js'
import { spanFromNode, STK1012, STK1013, STK1014, STK3001, createDiagnostic } from './diagnostics.js'
import {
  lowerStackMake, lowerStackZero, lowerPropertyRead,
  lowerPropertyWrite, lowerMaterialize,
  generateFlattenedParams, generateDPSWrite,
  generateArenaScope, generateTempAlloc, canForwardReturn,
} from './lowering/index.js'
import { generatePublicWrapper } from './lowering/boundary.js'

export interface TransformResult {
  /** The transformed source text. */
  outputText: string
  /** Diagnostics collected during transformation. */
  diagnostics: Diagnostic[]
  /** Source map, if generated. */
  sourceMap?: string
}

export interface TransformerOptions {
  config: StackConfig
  /** Additional diagnostics sink. */
  onDiagnostic?: (d: Diagnostic) => void
}

/**
 * Creates a TypeScript transformer factory for stackfold lowering.
 */
export function createStackTransformerFactory(
  program: ts.Program,
  typescript: typeof ts,
  options: TransformerOptions,
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker()
  const layoutEngine = new LayoutEngine(checker, typescript)
  const diagnostics: Diagnostic[] = []
  const config = options.config

  // Track which functions are transformed (for escape analysis)
  const transformedFunctions: TransformedFunctionSet = new Set()
  // Track function ABIs for call site rewriting
  const functionABIs = new Map<string, FunctionABI>()

  function addDiagnostic(d: Diagnostic): void {
    diagnostics.push(d)
    options.onDiagnostic?.(d)
  }

  return (context: ts.TransformationContext) => {
    const factory = context.factory

    // Map of local variable names → their stack layouts (within current scope)
    const scopeStackLocals = new Map<string, StructLayout>()

    return (sourceFile: ts.SourceFile): ts.SourceFile => {
      // Phase 1: Discover all functions with stack value params/returns
      discoverTransformedFunctions(sourceFile)

      // Phase 2: Transform statements (handling multi-node returns)
      const newStatements: ts.Statement[] = []
      for (const stmt of sourceFile.statements) {
        const result = visitNode(stmt)
        if (Array.isArray(result)) {
          newStatements.push(...(result as ts.Statement[]))
        } else {
          newStatements.push(result as ts.Statement)
        }
      }

      return factory.updateSourceFile(sourceFile, newStatements)
    }

    function discoverTransformedFunctions(node: ts.Node): void {
      if (typescript.isFunctionDeclaration(node) && node.name) {
        const fnName = node.name.text
        const abi = computeFunctionABI(node)
        if (abi) {
          transformedFunctions.add(fnName)
          functionABIs.set(fnName, abi)
        }
      }
      typescript.forEachChild(node, discoverTransformedFunctions)
    }

    function computeFunctionABI(
      node: ts.FunctionDeclaration,
    ): FunctionABI | null {
      if (!node.name) return null

      const params: LoweredParam[] = []
      let hasStackParam = false

      for (const param of node.parameters) {
        if (!typescript.isIdentifier(param.name)) continue
        const paramName = param.name.text
        const paramType = checker.getTypeAtLocation(param)
        const layout = layoutEngine.getLayout(paramType)

        if (layout) {
          // Validate eligibility
          const inner = layoutEngine.resolveStackInner(paramType)
          if (inner) {
            const eligibility = checkEligibility(
              inner, layout.typeName, spanFromNode(param), checker, typescript,
            )
            if (!eligibility.eligible) {
              eligibility.diagnostics.forEach(addDiagnostic)
              return null
            }
          }
          params.push({ originalName: paramName, isStackValue: true, layout })
          hasStackParam = true
        } else {
          params.push({ originalName: paramName, isStackValue: false })
        }
      }

      // Check return type
      let returnsStackValue = false
      let returnLayout: StructLayout | undefined

      if (node.type) {
        const returnType = checker.getTypeFromTypeNode(node.type)
        const rLayout = layoutEngine.getLayout(returnType)
        if (rLayout) {
          returnsStackValue = true
          returnLayout = rLayout
        }
      }

      if (!hasStackParam && !returnsStackValue) return null

      return {
        originalName: node.name.text,
        mangledName: LayoutEngine.mangledFunctionName(node.name.text),
        params,
        returnsStackValue,
        returnLayout,
      }
    }

    function visitNode(node: ts.Node): ts.Node | ts.Node[] {
      // Handle function declarations with stack value ABI
      if (typescript.isFunctionDeclaration(node) && node.name) {
        const abi = functionABIs.get(node.name.text)
        if (abi) {
          return transformFunction(node, abi)
        }
      }

      // Handle variable statements (stack.make, stack.zero)
      if (typescript.isVariableStatement(node)) {
        const result = tryTransformVariableStatement(node)
        if (result) return result
      }

      // Handle expression statements (v.x = expr)
      if (typescript.isExpressionStatement(node)) {
        const result = tryTransformExpressionStatement(node)
        if (result) return result
      }

      return typescript.visitEachChild(node, child => {
        const r = visitNode(child)
        // visitEachChild visitor must return a single node;
        // arrays are only valid at the statement level via visitNodes
        if (Array.isArray(r)) return r[0]
        return r
      }, context)
    }

    function tryTransformVariableStatement(
      node: ts.VariableStatement,
    ): ts.Node | ts.Node[] | undefined {
      const decls = node.declarationList.declarations
      if (decls.length !== 1) return undefined

      const decl = decls[0]
      if (!typescript.isIdentifier(decl.name) || !decl.initializer) return undefined

      const varName = decl.name.text
      const init = decl.initializer

      // Check for stack.make<T>({...})
      if (typescript.isCallExpression(init)) {
        const callInfo = parseStackIntrinsicCall(init)
        if (!callInfo) return undefined

        if (callInfo.kind === 'make') {
          return handleStackMake(varName, init, callInfo)
        }
        if (callInfo.kind === 'zero') {
          return handleStackZero(varName, init, callInfo)
        }
      }

      return undefined
    }

    function handleStackMake(
      varName: string,
      callExpr: ts.CallExpression,
      callInfo: StackIntrinsicCall,
    ): ts.Node[] | undefined {
      const layout = callInfo.layout
      if (!layout) return undefined

      // Validate the argument is an object literal
      if (callExpr.arguments.length !== 1) {
        addDiagnostic(createDiagnostic(STK1014, spanFromNode(callExpr), {
          type: layout.typeName,
        }, 'Pass an object literal with all fields to stack.make().'))
        return undefined
      }

      const arg = callExpr.arguments[0]
      if (!typescript.isObjectLiteralExpression(arg)) {
        addDiagnostic(createDiagnostic(STK1014, spanFromNode(arg), {
          type: layout.typeName,
        }, 'stack.make() requires an object literal argument.'))
        return undefined
      }

      // Extract property values
      const initProps = new Map<string, ts.Expression>()
      for (const prop of arg.properties) {
        if (!typescript.isPropertyAssignment(prop)) continue
        if (!typescript.isIdentifier(prop.name)) continue
        initProps.set(prop.name.text, prop.initializer)
      }

      // Validate all fields present
      const fieldNames = new Set(layout.fields.map(f => f.name))
      const missingFields = layout.fields
        .filter(f => !initProps.has(f.name))
        .map(f => f.name)
      if (missingFields.length > 0) {
        addDiagnostic(createDiagnostic(STK1012, spanFromNode(arg), {
          type: layout.typeName,
          fields: missingFields.join(', '),
        }))
      }

      // Check for extra fields
      const extraFields = [...initProps.keys()].filter(k => !fieldNames.has(k))
      if (extraFields.length > 0) {
        addDiagnostic(createDiagnostic(STK1013, spanFromNode(arg), {
          type: layout.typeName,
          fields: extraFields.join(', '),
        }))
      }

      // Register as stack local
      scopeStackLocals.set(varName, layout)

      // Transform init values through visitor
      const transformedProps = new Map<string, ts.Expression>()
      for (const [key, value] of initProps) {
        transformedProps.set(key, visitExpression(value))
      }

      const ctx = { stackLocals: scopeStackLocals, factory, typescript }
      return lowerStackMake(varName, layout, transformedProps, ctx)
    }

    function handleStackZero(
      varName: string,
      _callExpr: ts.CallExpression,
      callInfo: StackIntrinsicCall,
    ): ts.Node[] | undefined {
      const layout = callInfo.layout
      if (!layout) return undefined

      scopeStackLocals.set(varName, layout)

      const ctx = { stackLocals: scopeStackLocals, factory, typescript }
      return lowerStackZero(varName, layout, ctx)
    }

    function tryTransformExpressionStatement(
      node: ts.ExpressionStatement,
    ): ts.Node | undefined {
      const expr = node.expression

      // Handle: v.x = expr → v_x = expr
      if (
        typescript.isBinaryExpression(expr) &&
        expr.operatorToken.kind === typescript.SyntaxKind.EqualsToken
      ) {
        if (typescript.isPropertyAccessExpression(expr.left)) {
          const objName = typescript.isIdentifier(expr.left.expression)
            ? expr.left.expression.text
            : null
          if (objName && scopeStackLocals.has(objName)) {
            const fieldName = expr.left.name.text
            const ctx = { stackLocals: scopeStackLocals, factory, typescript }
            const lowered = lowerPropertyWrite(
              objName, fieldName, visitExpression(expr.right), ctx,
            )
            return factory.createExpressionStatement(lowered)
          }
        }
      }

      return undefined
    }

    function visitExpression(node: ts.Expression): ts.Expression {
      // Handle: v.x → v_x
      if (typescript.isPropertyAccessExpression(node)) {
        const objName = typescript.isIdentifier(node.expression)
          ? node.expression.text
          : null
        if (objName && scopeStackLocals.has(objName)) {
          const ctx = { stackLocals: scopeStackLocals, factory, typescript }
          return lowerPropertyRead(objName, node.name.text, ctx)
        }
      }

      // Handle: stack.materialize(v)
      if (typescript.isCallExpression(node)) {
        const callInfo = parseStackIntrinsicCall(node)
        if (callInfo?.kind === 'materialize' && callInfo.argName) {
          const layout = scopeStackLocals.get(callInfo.argName)
          if (layout) {
            const ctx = { stackLocals: scopeStackLocals, factory, typescript }
            return lowerMaterialize(callInfo.argName, layout, ctx)
          }
        }

        // Handle calls to transformed functions
        if (typescript.isIdentifier(node.expression)) {
          const calleeName = node.expression.text
          const calleeABI = functionABIs.get(calleeName)
          if (calleeABI) {
            return transformCallExpression(node, calleeABI)
          }
        }
      }

      return typescript.visitEachChild(node, n => {
        if (typescript.isExpression(n)) return visitExpression(n)
        return visitNode(n)
      }, context) as ts.Expression
    }

    function transformFunction(
      node: ts.FunctionDeclaration,
      abi: FunctionABI,
    ): ts.Node | ts.Node[] {
      // Clear scope for new function
      const outerLocals = new Map(scopeStackLocals)
      scopeStackLocals.clear()

      // Register flattened params as stack locals
      for (const param of abi.params) {
        if (param.isStackValue && param.layout) {
          scopeStackLocals.set(param.originalName, param.layout)
        }
      }

      // Generate flattened parameters
      const newParams = generateFlattenedParams(abi, factory)

      // Transform the body
      let newBody: ts.Block | undefined
      if (node.body) {
        // Run escape analysis
        const stackLocalNames = new Set(
          abi.params.filter(p => p.isStackValue).map(p => p.originalName),
        )
        const escapeInfo = analyzeEscapes(
          node.body, new Set(), stackLocalNames,
          transformedFunctions, checker, typescript,
        )
        escapeInfo.diagnostics.forEach(addDiagnostic)

        // Transform the body statements
        const transformedStatements = transformFunctionBody(node.body, abi)
        newBody = factory.createBlock(transformedStatements, true)
      }

      // Create the lowered function
      const loweredFn = factory.createFunctionDeclaration(
        undefined, // modifiers removed for internal function
        undefined,
        factory.createIdentifier(abi.mangledName),
        undefined,
        newParams,
        abi.returnsStackValue
          ? factory.createKeywordTypeNode(typescript.SyntaxKind.VoidKeyword)
          : undefined,
        newBody ?? factory.createBlock([], true),
      )

      // In library mode, also generate a public wrapper
      if (config.mode === 'library' && node.modifiers?.some(
        m => m.kind === typescript.SyntaxKind.ExportKeyword,
      )) {
        const wrapper = generatePublicWrapper(
          abi, '__stackfold_getRuntime', factory, typescript,
        )
        // Restore scope
        scopeStackLocals.clear()
        for (const [k, v] of outerLocals) scopeStackLocals.set(k, v)
        return [loweredFn, wrapper]
      }

      // Restore scope
      scopeStackLocals.clear()
      for (const [k, v] of outerLocals) scopeStackLocals.set(k, v)
      return loweredFn
    }

    function transformFunctionBody(
      body: ts.Block,
      abi: FunctionABI,
    ): ts.Statement[] {
      const statements: ts.Statement[] = []

      for (const stmt of body.statements) {
        // Handle return statements
        if (typescript.isReturnStatement(stmt) && stmt.expression) {
          if (abi.returnsStackValue && abi.returnLayout) {
            const returnStmts = transformReturn(stmt.expression, abi)
            statements.push(...returnStmts)
            continue
          }
        }

        // Transform other statements
        const transformed = visitNode(stmt)
        if (Array.isArray(transformed)) {
          statements.push(...(transformed as ts.Statement[]))
        } else {
          statements.push(transformed as ts.Statement)
        }
      }

      return statements
    }

    function transformReturn(
      expr: ts.Expression,
      abi: FunctionABI,
    ): ts.Statement[] {
      const layout = abi.returnLayout!

      // Case 1: Return forwarding — return f(x)
      if (typescript.isCallExpression(expr) && typescript.isIdentifier(expr.expression)) {
        const calleeName = expr.expression.text
        const calleeABI = functionABIs.get(calleeName)
        if (calleeABI?.returnsStackValue) {
          // Forward __out directly to the callee
          return transformReturnForwarding(expr, calleeABI, layout)
        }
      }

      // Case 2: Return a local stack variable
      if (typescript.isIdentifier(expr)) {
        const localLayout = scopeStackLocals.get(expr.text)
        if (localLayout) {
          // Write local scalars to __out
          const ctx = { stackLocals: scopeStackLocals, factory, typescript }
          const dpsStatements = generateDPSWrite(expr.text, localLayout, { factory, ts: typescript })
          dpsStatements.push(factory.createReturnStatement(undefined))
          return dpsStatements
        }
      }

      // Case 3: Return an expression that creates a new stack value
      // (e.g., return stack.make<Vec3>({...}))
      // For now, fallback: treat as DPS write of the expression result
      return [factory.createReturnStatement(undefined)]
    }

    function transformReturnForwarding(
      callExpr: ts.CallExpression,
      calleeABI: FunctionABI,
      _returnLayout: StructLayout,
    ): ts.Statement[] {
      // Check if any arguments are also calls to transformed functions
      // that need arena temporaries
      const hasNestedCalls = callExpr.arguments.some(arg =>
        typescript.isCallExpression(arg) &&
        typescript.isIdentifier(arg.expression) &&
        functionABIs.has(arg.expression.text),
      )

      if (hasNestedCalls) {
        // Need arena scope for temporaries
        return transformNestedReturnCalls(callExpr, calleeABI)
      }

      // Simple forwarding: pass __out directly
      const args = buildFlattenedCallArgs(callExpr, calleeABI,
        factory.createIdentifier('__rt'),
        factory.createIdentifier('__out'),
      )

      return [
        factory.createExpressionStatement(
          factory.createCallExpression(
            factory.createIdentifier(calleeABI.mangledName),
            undefined, args,
          ),
        ),
        factory.createReturnStatement(undefined),
      ]
    }

    function transformNestedReturnCalls(
      callExpr: ts.CallExpression,
      outerABI: FunctionABI,
    ): ts.Statement[] {
      const body: ts.Statement[] = []
      let tmpCounter = 0

      // Process each argument: if it's a call to a transformed function,
      // allocate a temp and call it first
      const resolvedArgs: ts.Expression[] = []

      for (let i = 0; i < callExpr.arguments.length; i++) {
        const arg = callExpr.arguments[i]

        if (
          typescript.isCallExpression(arg) &&
          typescript.isIdentifier(arg.expression)
        ) {
          const nestedABI = functionABIs.get(arg.expression.text)
          if (nestedABI?.returnsStackValue && nestedABI.returnLayout) {
            // Allocate temp for this nested call
            const tmpName = `__tmp${tmpCounter++}`
            body.push(generateTempAlloc(
              tmpName, nestedABI.returnLayout.wordCount, factory, typescript,
            ))

            // Call the nested function with the temp as destination
            const nestedArgs = buildFlattenedCallArgs(arg, nestedABI,
              factory.createIdentifier('__rt'),
              factory.createIdentifier(tmpName),
            )
            body.push(factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createIdentifier(nestedABI.mangledName),
                undefined, nestedArgs,
              ),
            ))

            // The resolved "argument" for the outer call is a reference to the temp slot
            // We need to read from the temp slot as flattened args
            if (outerABI.params[i]?.isStackValue && outerABI.params[i].layout) {
              for (const field of outerABI.params[i].layout!.fields) {
                resolvedArgs.push(
                  factory.createElementAccessExpression(
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier('__rt'),
                      'mem',
                    ),
                    factory.createBinaryExpression(
                      factory.createIdentifier(tmpName),
                      typescript.SyntaxKind.PlusToken,
                      factory.createNumericLiteral(field.index),
                    ),
                  ),
                )
              }
            }
            continue
          }
        }

        // Non-transformed argument: pass through
        const transformed = visitExpression(arg)
        if (outerABI.params[i]?.isStackValue && outerABI.params[i].layout) {
          // Need to flatten the stack value argument
          const argName = typescript.isIdentifier(arg) ? arg.text : null
          if (argName && scopeStackLocals.has(argName)) {
            for (const field of outerABI.params[i].layout!.fields) {
              resolvedArgs.push(
                factory.createIdentifier(
                  LayoutEngine.fieldLocalName(argName, field.name),
                ),
              )
            }
            continue
          }
        }
        resolvedArgs.push(transformed)
      }

      // Add __rt and __out
      if (outerABI.returnsStackValue) {
        resolvedArgs.push(factory.createIdentifier('__rt'))
        resolvedArgs.push(factory.createIdentifier('__out'))
      }

      // Call the outer function
      body.push(factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createIdentifier(outerABI.mangledName),
          undefined, resolvedArgs,
        ),
      ))

      // Wrap in arena scope
      const scopedBody = generateArenaScope(body, '__m', factory, typescript)
      scopedBody.push(factory.createReturnStatement(undefined))
      return scopedBody
    }

    function buildFlattenedCallArgs(
      callExpr: ts.CallExpression,
      abi: FunctionABI,
      rtExpr: ts.Expression,
      outExpr: ts.Expression,
    ): ts.Expression[] {
      const args: ts.Expression[] = []

      for (let i = 0; i < abi.params.length; i++) {
        const param = abi.params[i]
        const originalArg = callExpr.arguments[i]

        if (param.isStackValue && param.layout && originalArg) {
          // Flatten the stack value argument
          if (typescript.isIdentifier(originalArg)) {
            const argName = originalArg.text
            if (scopeStackLocals.has(argName)) {
              for (const field of param.layout.fields) {
                args.push(factory.createIdentifier(
                  LayoutEngine.fieldLocalName(argName, field.name),
                ))
              }
              continue
            }
          }
          // Fallback: read properties from the expression
          for (const field of param.layout.fields) {
            args.push(
              factory.createPropertyAccessExpression(
                visitExpression(originalArg),
                field.name,
              ),
            )
          }
        } else if (originalArg) {
          args.push(visitExpression(originalArg))
        }
      }

      if (abi.returnsStackValue) {
        args.push(rtExpr)
        args.push(outExpr)
      }

      return args
    }

    function transformCallExpression(
      node: ts.CallExpression,
      calleeABI: FunctionABI,
    ): ts.Expression {
      if (!calleeABI.returnsStackValue) {
        // Non-DPS call: just flatten the arguments
        const args = buildFlattenedCallArgs(
          node, calleeABI,
          factory.createIdentifier('__rt'),
          factory.createNumericLiteral(0),
        )
        return factory.createCallExpression(
          factory.createIdentifier(calleeABI.mangledName),
          undefined, args,
        )
      }

      // DPS call in expression position — this needs an arena allocation
      // This case should typically be handled at the statement level,
      // but as a fallback we generate an IIFE
      return factory.createCallExpression(
        factory.createIdentifier(calleeABI.mangledName),
        undefined,
        buildFlattenedCallArgs(
          node, calleeABI,
          factory.createIdentifier('__rt'),
          factory.createIdentifier('__out'),
        ),
      )
    }

    interface StackIntrinsicCall {
      kind: 'make' | 'zero' | 'materialize'
      layout?: StructLayout
      argName?: string
    }

    function parseStackIntrinsicCall(
      node: ts.CallExpression,
    ): StackIntrinsicCall | null {
      if (!typescript.isPropertyAccessExpression(node.expression)) return null

      const obj = node.expression.expression
      const method = node.expression.name.text

      if (!typescript.isIdentifier(obj) || obj.text !== 'stack') return null

      if (method === 'make' || method === 'zero') {
        // Get the type argument to determine the layout
        let layout: StructLayout | undefined
        if (node.typeArguments && node.typeArguments.length > 0) {
          const typeArg = node.typeArguments[0]
          const type = checker.getTypeFromTypeNode(typeArg)
          layout = layoutEngine.getLayoutFromInner(type, checker.typeToString(type)) ??
            layoutEngine.getLayout(type) ?? undefined
        }
        // Fallback: try to infer from the contextual type
        if (!layout) {
          const contextualType = checker.getContextualType(node)
          if (contextualType) {
            layout = layoutEngine.getLayout(contextualType) ?? undefined
          }
        }
        return { kind: method, layout }
      }

      if (method === 'materialize') {
        let argName: string | undefined
        if (node.arguments.length > 0 && typescript.isIdentifier(node.arguments[0])) {
          argName = node.arguments[0].text
        }
        return { kind: 'materialize', argName }
      }

      return null
    }
  }
}

/**
 * Transforms a single source file string, creating a program internally.
 * This is the primary entry point for the Vite plugin and CLI.
 */
export function transformSource(
  sourceText: string,
  fileName: string,
  config: StackConfig,
  typescript: typeof ts,
  compilerOptions?: ts.CompilerOptions,
): TransformResult {
  const diagnostics: Diagnostic[] = []

  const defaultCompilerOptions: ts.CompilerOptions = {
    target: typescript.ScriptTarget.ES2022,
    module: typescript.ModuleKind.ES2022,
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    strict: true,
    declaration: false,
    sourceMap: true,
    ...compilerOptions,
  }

  // Create a virtual source file
  const sourceFile = typescript.createSourceFile(
    fileName, sourceText, typescript.ScriptTarget.ES2022, true,
  )

  // Create a minimal compiler host
  const host = typescript.createCompilerHost(defaultCompilerOptions)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, target, onError, shouldCreate) => {
    if (name === fileName) return sourceFile
    return originalGetSourceFile(name, target, onError, shouldCreate)
  }

  // Create the program
  const program = typescript.createProgram([fileName], defaultCompilerOptions, host)

  // Create and apply the transformer
  const transformerFactory = createStackTransformerFactory(program, typescript, {
    config,
    onDiagnostic: d => diagnostics.push(d),
  })

  let outputText = ''
  let sourceMap: string | undefined

  program.emit(
    sourceFile,
    (name, text) => {
      if (name.endsWith('.map')) {
        sourceMap = text
      } else {
        outputText = text
      }
    },
    undefined, undefined,
    { before: [transformerFactory] },
  )

  return { outputText, diagnostics, sourceMap }
}

/**
 * Checks a source file for stack-value diagnostics without emitting.
 * Used by `stackc check` and the tsserver plugin.
 */
export function checkSource(
  sourceText: string,
  fileName: string,
  config: StackConfig,
  typescript: typeof ts,
  compilerOptions?: ts.CompilerOptions,
): Diagnostic[] {
  const result = transformSource(sourceText, fileName, config, typescript, compilerOptions)
  return result.diagnostics
}
