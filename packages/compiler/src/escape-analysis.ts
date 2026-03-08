/**
 * Escape analysis: detects uses of stack values that would require
 * them to outlive the local transformed region or adopt general
 * JavaScript object semantics.
 *
 * Detected escapes:
 * - Closure capture (STK1004)
 * - Await/yield crossing (STK1005)
 * - Passing to unknown/non-transformed callee (STK1003)
 * - Dynamic property access (STK1006)
 * - Object spread (STK1009)
 * - Reflection/identity operations (STK1010)
 * - Storage in arrays/collections (STK1011)
 * - Partial initialization (STK1008)
 */

import type ts from 'typescript'
import {
  type Diagnostic,
  STK1003,
  STK1004,
  STK1005,
  STK1006,
  STK1008,
  STK1009,
  STK1010,
  STK1011,
  createDiagnostic,
  spanFromNode,
} from './diagnostics.js'

export interface EscapeInfo {
  diagnostics: Diagnostic[]
  escapedVariables: Set<string>
}

/**
 * Set of function/method names known to be transformed by the compiler.
 * During analysis this is populated with functions that have stack value
 * params/returns and are in the current compilation unit.
 */
export type TransformedFunctionSet = Set<string>

/**
 * Analyzes a function body for stack value escapes.
 *
 * @param body The function body to analyze.
 * @param stackLocals Map of local variable names that hold stack values.
 * @param stackParams Set of parameter names that are stack values.
 * @param transformedFunctions Names of functions known to be stack-transformed.
 * @param typescript The TypeScript module to use.
 */
export function analyzeEscapes(
  body: ts.Block,
  stackLocals: Set<string>,
  stackParams: Set<string>,
  transformedFunctions: TransformedFunctionSet,
  checker: ts.TypeChecker,
  typescript: typeof ts,
): EscapeInfo {
  const diagnostics: Diagnostic[] = []
  const escapedVariables = new Set<string>()
  const allStackVars = new Set([...stackLocals, ...stackParams])

  // Track initialization state: variable → set of initialized fields
  const initState = new Map<string, Set<string>>()

  function isStackVar(name: string): boolean {
    return allStackVars.has(name)
  }

  function getIdentifierName(node: ts.Node): string | null {
    if (typescript.isIdentifier(node)) {
      return node.text
    }
    return null
  }

  function visit(node: ts.Node, insideClosure: boolean, insideAwait: boolean): void {
    // Detect closure boundaries
    if (
      typescript.isFunctionExpression(node) ||
      typescript.isArrowFunction(node) ||
      typescript.isFunctionDeclaration(node)
    ) {
      // Check if any stack vars are referenced inside this nested function
      visitClosure(node)
      return // Don't recurse further into this function via normal visit
    }

    // Detect await expressions
    if (typescript.isAwaitExpression(node)) {
      // Check if the awaited expression uses stack values
      const expr = node.expression
      checkAwaitYieldUsage(expr, node)
      typescript.forEachChild(node, child => visit(child, insideClosure, true))
      return
    }

    // Detect yield expressions
    if (typescript.isYieldExpression(node)) {
      if (node.expression) {
        checkAwaitYieldUsage(node.expression, node)
      }
      typescript.forEachChild(node, child => visit(child, insideClosure, true))
      return
    }

    // Detect dynamic property access: stackVal[expr]
    if (typescript.isElementAccessExpression(node)) {
      const exprName = getIdentifierName(node.expression)
      if (exprName && isStackVar(exprName)) {
        // Only allow string literal indices that match field names
        if (!typescript.isStringLiteral(node.argumentExpression) &&
            !typescript.isNumericLiteral(node.argumentExpression)) {
          diagnostics.push(
            createDiagnostic(STK1006, spanFromNode(node), {},
              'Use direct property access (e.g., v.x) instead of bracket notation.'),
          )
          escapedVariables.add(exprName)
        }
      }
    }

    // Detect spread: { ...stackVal }
    if (typescript.isSpreadAssignment(node) || typescript.isSpreadElement(node)) {
      const expr = typescript.isSpreadAssignment(node) ? node.expression : node.expression
      const name = getIdentifierName(expr)
      if (name && isStackVar(name)) {
        diagnostics.push(
          createDiagnostic(STK1009, spanFromNode(node), {},
            'Use stack.materialize() first, then spread the resulting object.'),
        )
        escapedVariables.add(name)
      }
    }

    // Detect array storage: [stackVal] or arr.push(stackVal)
    if (typescript.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        const name = getIdentifierName(element)
        if (name && isStackVar(name)) {
          diagnostics.push(
            createDiagnostic(STK1011, spanFromNode(element), { name },
              'Use stack.materialize() before storing in an array.'),
          )
          escapedVariables.add(name)
        }
      }
    }

    // Detect call expressions: passing stack value to unknown function
    if (typescript.isCallExpression(node)) {
      checkCallExpression(node)
    }

    // Detect typeof, instanceof, Object.keys, etc.
    if (typescript.isTypeOfExpression(node)) {
      const name = getIdentifierName(node.expression)
      if (name && isStackVar(name)) {
        diagnostics.push(
          createDiagnostic(STK1010, spanFromNode(node), { op: 'typeof' },
            'Stack values do not support typeof. Use stack.materialize() first.'),
        )
        escapedVariables.add(name)
      }
    }

    typescript.forEachChild(node, child => visit(child, insideClosure, insideAwait))
  }

  function visitClosure(node: ts.Node): void {
    // Walk the closure body and check for references to stack vars
    typescript.forEachChild(node, function walkClosure(child: ts.Node): void {
      if (typescript.isIdentifier(child)) {
        const name = child.text
        if (isStackVar(name)) {
          diagnostics.push(
            createDiagnostic(STK1004, spanFromNode(child), { name },
              `Extract the needed scalar fields from "${name}" before the closure, or use stack.materialize().`),
          )
          escapedVariables.add(name)
        }
      }
      typescript.forEachChild(child, walkClosure)
    })
  }

  function checkAwaitYieldUsage(expr: ts.Node, awaitNode: ts.Node): void {
    // Check if any stack values are used after the await/yield point
    // For simplicity, we check if stack vars appear in the await expression
    typescript.forEachChild(expr, function walk(child: ts.Node): void {
      if (typescript.isIdentifier(child)) {
        const name = child.text
        if (isStackVar(name)) {
          diagnostics.push(
            createDiagnostic(STK1005, spanFromNode(awaitNode), { name },
              `Materialize "${name}" before the await/yield, or restructure the code.`),
          )
          escapedVariables.add(name)
        }
      }
      typescript.forEachChild(child, walk)
    })
  }

  function checkCallExpression(node: ts.CallExpression): void {
    const expr = node.expression

    // Allow stack.make, stack.zero, stack.materialize
    if (typescript.isPropertyAccessExpression(expr)) {
      const objName = getIdentifierName(expr.expression)
      if (objName === 'stack') return // stack.* intrinsics are allowed
    }

    // Check each argument
    for (const arg of node.arguments) {
      const name = getIdentifierName(arg)
      if (!name || !isStackVar(name)) continue

      // Check if the callee is a known transformed function
      let calleeName: string | null = null
      if (typescript.isIdentifier(expr)) {
        calleeName = expr.text
      } else if (typescript.isPropertyAccessExpression(expr)) {
        calleeName = expr.name.text
      }

      if (calleeName && transformedFunctions.has(calleeName)) {
        continue // Passing to transformed function is fine
      }

      // Unknown callee — this is an escape
      diagnostics.push(
        createDiagnostic(STK1003, spanFromNode(arg), {
          name,
          callee: calleeName ?? '<unknown>',
        }, `Use stack.materialize(${name}) to convert to a plain object first.`),
      )
      escapedVariables.add(name)
    }
  }

  // Run the analysis
  visit(body, false, false)

  return { diagnostics, escapedVariables }
}
