/**
 * Return lowering: handles return forwarding and arena temporary insertion
 * for nested stack-value-returning calls.
 *
 * Example:
 *   return normalize(add(a, b))
 *
 * Lowered:
 *   const __m = __rt.mark()
 *   try {
 *     const __tmp = __rt.alloc(3)
 *     __stk_add(a_x, a_y, a_z, b_x, b_y, b_z, __rt, __tmp)
 *     __stk_normalize_from_slot(__tmp, __rt, __out)
 *   } finally {
 *     __rt.reset(__m)
 *   }
 */

import type ts from 'typescript'
import type { StructLayout } from '../layout.js'

export interface TempAllocation {
  /** Variable name for the temporary arena offset. */
  varName: string
  /** Number of words to allocate. */
  wordCount: number
}

/**
 * Generates a mark/try/finally block for arena temporaries.
 *
 * Produces:
 *   const __m = __rt.mark();
 *   try { ...body } finally { __rt.reset(__m); }
 */
export function generateArenaScope(
  body: ts.Statement[],
  markVarName: string,
  factory: ts.NodeFactory,
  typescript: typeof ts,
): ts.Statement[] {
  // const __m = __rt.mark()
  const markDecl = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration(
        markVarName, undefined, undefined,
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

  // __rt.reset(__m)
  const resetCall = factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createPropertyAccessExpression(
        factory.createIdentifier('__rt'),
        'reset',
      ),
      undefined,
      [factory.createIdentifier(markVarName)],
    ),
  )

  // try { ...body } finally { __rt.reset(__m) }
  const tryFinally = factory.createTryStatement(
    factory.createBlock(body, true),
    undefined, // no catch
    factory.createBlock([resetCall], true),
  )

  return [markDecl, tryFinally]
}

/**
 * Generates a temporary arena allocation.
 *
 * Produces:
 *   const __tmp = __rt.alloc(wordCount);
 */
export function generateTempAlloc(
  varName: string,
  wordCount: number,
  factory: ts.NodeFactory,
  typescript: typeof ts,
): ts.Statement {
  return factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration(
        varName, undefined, undefined,
        factory.createCallExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier('__rt'),
            'alloc',
          ),
          undefined,
          [factory.createNumericLiteral(wordCount)],
        ),
      )],
      typescript.NodeFlags.Const,
    ),
  )
}

/**
 * Determines whether a return expression can use return forwarding.
 *
 * Return forwarding is possible when the return expression is a direct
 * call to another transformed function and the result is not used
 * in any other expression. In this case, we can pass the caller's
 * __out directly to the nested callee.
 *
 * @param returnExpr The expression being returned.
 * @param isTransformedCall Callback to check if a function name is transformed.
 */
export function canForwardReturn(
  returnExpr: ts.Expression,
  isTransformedCall: (name: string) => boolean,
  typescript: typeof ts,
): boolean {
  if (!typescript.isCallExpression(returnExpr)) return false

  const callee = returnExpr.expression
  if (typescript.isIdentifier(callee)) {
    return isTransformedCall(callee.text)
  }

  return false
}

/**
 * Generates a "read from arena slot into __out" copy.
 * Used when return forwarding is not possible and we need to copy
 * a temporary result to the final destination.
 *
 * Produces:
 *   __rt.mem[__out + 0] = __rt.mem[srcSlot + 0];
 *   __rt.mem[__out + 1] = __rt.mem[srcSlot + 1];
 *   ...
 */
export function generateSlotCopy(
  srcSlotExpr: ts.Expression,
  dstSlotExpr: ts.Expression,
  layout: StructLayout,
  factory: ts.NodeFactory,
  typescript: typeof ts,
): ts.Statement[] {
  return layout.fields.map(field => {
    const memAccess = (slot: ts.Expression) =>
      factory.createElementAccessExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier('__rt'), 'mem'),
        field.index === 0
          ? slot
          : factory.createBinaryExpression(slot, typescript.SyntaxKind.PlusToken, factory.createNumericLiteral(field.index)),
      )
    return factory.createExpressionStatement(
      factory.createAssignment(memAccess(dstSlotExpr), memAccess(srcSlotExpr)),
    )
  })
}
