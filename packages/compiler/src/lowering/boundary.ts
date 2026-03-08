/**
 * Boundary lowering: generates public wrappers for library mode that
 * materialize returned objects and marshal object arguments into
 * flattened internal calls.
 *
 * Example (library mode wrapper):
 *   export function add(a: Vec3, b: Vec3): Vec3 {
 *     const __rt = __getRuntime();
 *     const __m = __rt.mark();
 *     try {
 *       const __out = __rt.alloc(3);
 *       __stk_add(a.x, a.y, a.z, b.x, b.y, b.z, __rt, __out);
 *       return { x: __rt.mem[__out], y: __rt.mem[__out+1], z: __rt.mem[__out+2] };
 *     } finally {
 *       __rt.reset(__m);
 *     }
 *   }
 */

import type ts from 'typescript'
import type { StructLayout } from '../layout.js'
import type { FunctionABI } from './functions.js'
import { LayoutEngine } from '../layout.js'

/**
 * Generates a public wrapper function for library mode.
 * The wrapper accepts plain objects and returns plain objects,
 * while internally calling the lowered ABI.
 */
export function generatePublicWrapper(
  abi: FunctionABI,
  runtimeGetterName: string,
  factory: ts.NodeFactory,
  typescript: typeof ts,
): ts.FunctionDeclaration {
  const statements: ts.Statement[] = []

  // const __rt = __getRuntime()
  statements.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [factory.createVariableDeclaration(
          '__rt', undefined, undefined,
          factory.createCallExpression(
            factory.createIdentifier(runtimeGetterName),
            undefined, [],
          ),
        )],
        typescript.NodeFlags.Const,
      ),
    ),
  )

  // Build the try/finally body
  const tryBody: ts.Statement[] = []

  // Allocate output slot if function returns stack value
  if (abi.returnsStackValue && abi.returnLayout) {
    tryBody.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(
            '__out', undefined, undefined,
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier('__rt'),
                'alloc',
              ),
              undefined,
              [factory.createNumericLiteral(abi.returnLayout.wordCount)],
            ),
          )],
          typescript.NodeFlags.Const,
        ),
      ),
    )
  }

  // Build the call arguments: marshal objects → scalars
  const callArgs: ts.Expression[] = []
  for (const param of abi.params) {
    if (param.isStackValue && param.layout) {
      for (const field of param.layout.fields) {
        callArgs.push(
          factory.createPropertyAccessExpression(
            factory.createIdentifier(param.originalName),
            field.name,
          ),
        )
      }
    } else {
      callArgs.push(factory.createIdentifier(param.originalName))
    }
  }

  if (abi.returnsStackValue) {
    callArgs.push(factory.createIdentifier('__rt'))
    callArgs.push(factory.createIdentifier('__out'))
  }

  // Call the internal function
  const callExpr = factory.createCallExpression(
    factory.createIdentifier(abi.mangledName),
    undefined,
    callArgs,
  )

  if (abi.returnsStackValue && abi.returnLayout) {
    // Call the internal function (void return in DPS)
    tryBody.push(factory.createExpressionStatement(callExpr))

    // Materialize the result from the arena
    const resultProps = abi.returnLayout.fields.map(field => {
      const indexExpr = field.index === 0
        ? factory.createIdentifier('__out')
        : factory.createBinaryExpression(
            factory.createIdentifier('__out'),
            typescript.SyntaxKind.PlusToken,
            factory.createNumericLiteral(field.index),
          )
      return factory.createPropertyAssignment(
        field.name,
        factory.createElementAccessExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier('__rt'),
            'mem',
          ),
          indexExpr,
        ),
      )
    })

    tryBody.push(
      factory.createReturnStatement(
        factory.createObjectLiteralExpression(resultProps, false),
      ),
    )
  } else {
    // Non-stack return: just return the call result
    tryBody.push(factory.createReturnStatement(callExpr))
  }

  // Wrap in mark/try/finally
  const markDecl = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration(
        '__m', undefined, undefined,
        factory.createCallExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier('__rt'),
            'mark',
          ),
          undefined, [],
        ),
      )],
      typescript.NodeFlags.Const,
    ),
  )

  const resetCall = factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createPropertyAccessExpression(
        factory.createIdentifier('__rt'),
        'reset',
      ),
      undefined,
      [factory.createIdentifier('__m')],
    ),
  )

  statements.push(markDecl)
  statements.push(
    factory.createTryStatement(
      factory.createBlock(tryBody, true),
      undefined,
      factory.createBlock([resetCall], true),
    ),
  )

  // Build wrapper parameters (plain object params)
  const wrapperParams = abi.params.map(param =>
    factory.createParameterDeclaration(
      undefined, undefined,
      factory.createIdentifier(param.originalName),
      undefined, undefined, undefined,
    ),
  )

  return factory.createFunctionDeclaration(
    [factory.createModifier(typescript.SyntaxKind.ExportKeyword)],
    undefined,
    factory.createIdentifier(abi.originalName),
    undefined,
    wrapperParams,
    undefined,
    factory.createBlock(statements, true),
  )
}
