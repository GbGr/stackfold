/**
 * Scalar local lowering: transforms stack.make, stack.zero, property
 * access, and stack.materialize on local stack values into scalar
 * variable declarations and direct reads/writes.
 *
 * Example:
 *   const v = stack.make<Vec3>({ x: 1, y: 2, z: 3 })
 *   v.x = 10
 *   const xVal = v.x
 *   const obj = stack.materialize(v)
 *
 * Becomes:
 *   let v_x = 1; let v_y = 2; let v_z = 3;
 *   v_x = 10;
 *   const xVal = v_x;
 *   const obj = { x: v_x, y: v_y, z: v_z };
 */

import type ts from 'typescript'
import type { StructLayout } from '../layout.js'
import { LayoutEngine } from '../layout.js'

export interface LocalLoweringContext {
  /** Map from original variable name → its struct layout. */
  stackLocals: Map<string, StructLayout>
  /** The TypeScript factory for creating new AST nodes. */
  factory: ts.NodeFactory
  /** TypeScript module reference. */
  typescript: typeof ts
}

/**
 * Lowers a `const v = stack.make<T>({ x: 1, y: 2, z: 3 })` declaration
 * into multiple `let v_x = 1; let v_y = 2; let v_z = 3;` declarations.
 */
export function lowerStackMake(
  varName: string,
  layout: StructLayout,
  initProps: Map<string, ts.Expression>,
  ctx: LocalLoweringContext,
): ts.Statement[] {
  const { factory, typescript: ts_ } = ctx
  const statements: ts.Statement[] = []

  for (const field of layout.fields) {
    const init = initProps.get(field.name) ?? factory.createNumericLiteral(0)
    const localName = LayoutEngine.fieldLocalName(varName, field.name)
    statements.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(localName, undefined, undefined, init)],
          ts_.NodeFlags.Let,
        ),
      ),
    )
  }

  return statements
}

/**
 * Lowers a `const z = stack.zero<T>()` declaration into
 * `let z_x = 0; let z_y = 0; let z_z = 0;`.
 */
export function lowerStackZero(
  varName: string,
  layout: StructLayout,
  ctx: LocalLoweringContext,
): ts.Statement[] {
  const { factory, typescript: ts_ } = ctx
  const statements: ts.Statement[] = []

  for (const field of layout.fields) {
    const localName = LayoutEngine.fieldLocalName(varName, field.name)
    statements.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(localName, undefined, undefined, factory.createNumericLiteral(0))],
          ts_.NodeFlags.Let,
        ),
      ),
    )
  }

  return statements
}

/**
 * Lowers a property read `v.x` → `v_x`.
 */
export function lowerPropertyRead(
  varName: string,
  fieldName: string,
  ctx: LocalLoweringContext,
): ts.Expression {
  const localName = LayoutEngine.fieldLocalName(varName, fieldName)
  return ctx.factory.createIdentifier(localName)
}

/**
 * Lowers a property write `v.x = expr` → `v_x = expr`.
 */
export function lowerPropertyWrite(
  varName: string,
  fieldName: string,
  value: ts.Expression,
  ctx: LocalLoweringContext,
): ts.Expression {
  const localName = LayoutEngine.fieldLocalName(varName, fieldName)
  return ctx.factory.createAssignment(
    ctx.factory.createIdentifier(localName),
    value,
  )
}

/**
 * Lowers `stack.materialize(v)` → `{ x: v_x, y: v_y, z: v_z }`.
 */
export function lowerMaterialize(
  varName: string,
  layout: StructLayout,
  ctx: LocalLoweringContext,
): ts.Expression {
  const { factory } = ctx
  const properties = layout.fields.map(field => {
    const localName = LayoutEngine.fieldLocalName(varName, field.name)
    return factory.createPropertyAssignment(
      field.name,
      factory.createIdentifier(localName),
    )
  })
  return factory.createObjectLiteralExpression(properties, false)
}

/**
 * Lowers full struct assignment `a = b` where both are stack values.
 * Produces: `a_x = b_x; a_y = b_y; a_z = b_z;`
 */
export function lowerStructAssignment(
  targetName: string,
  sourceName: string,
  layout: StructLayout,
  ctx: LocalLoweringContext,
): ts.Statement[] {
  const { factory } = ctx
  return layout.fields.map(field => {
    const targetLocal = LayoutEngine.fieldLocalName(targetName, field.name)
    const sourceLocal = LayoutEngine.fieldLocalName(sourceName, field.name)
    return factory.createExpressionStatement(
      factory.createAssignment(
        factory.createIdentifier(targetLocal),
        factory.createIdentifier(sourceLocal),
      ),
    )
  })
}
