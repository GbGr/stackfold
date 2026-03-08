/**
 * Function ABI lowering: transforms function signatures and call sites
 * to use the flattened ABI for stack value parameters and DPS returns.
 */

import type ts from 'typescript'
import type { StructLayout } from '../layout.js'
import { LayoutEngine } from '../layout.js'

export interface LoweredParam {
  originalName: string
  isStackValue: boolean
  layout?: StructLayout
}

export interface FunctionABI {
  originalName: string
  mangledName: string
  params: LoweredParam[]
  returnsStackValue: boolean
  returnLayout?: StructLayout
}

/** Codegen context with factory and typescript references. */
export interface CodegenContext {
  factory: ts.NodeFactory
  ts: typeof ts
}

function arenaAccess(ctx: CodegenContext, slotExpr: ts.Expression, fieldIndex: number): ts.ElementAccessExpression {
  const { factory, ts: typescript } = ctx
  const indexExpr = fieldIndex === 0
    ? slotExpr
    : factory.createBinaryExpression(slotExpr, typescript.SyntaxKind.PlusToken, factory.createNumericLiteral(fieldIndex))
  return factory.createElementAccessExpression(
    factory.createPropertyAccessExpression(factory.createIdentifier('__rt'), 'mem'),
    indexExpr,
  )
}

/**
 * Generates the flattened parameter list for a lowered function.
 */
export function generateFlattenedParams(
  abi: FunctionABI,
  factory: ts.NodeFactory,
): ts.ParameterDeclaration[] {
  const params: ts.ParameterDeclaration[] = []
  const mkParam = (name: string) => factory.createParameterDeclaration(
    undefined, undefined, factory.createIdentifier(name), undefined, undefined, undefined,
  )

  for (const param of abi.params) {
    if (param.isStackValue && param.layout) {
      for (const field of param.layout.fields) {
        params.push(mkParam(LayoutEngine.fieldLocalName(param.originalName, field.name)))
      }
    } else {
      params.push(mkParam(param.originalName))
    }
  }

  if (abi.returnsStackValue) {
    params.push(mkParam('__rt'))
    params.push(mkParam('__out'))
  }

  return params
}

/**
 * Generates flattened argument expressions for a call to a lowered function.
 */
export function generateFlattenedArgs(
  abi: FunctionABI,
  stackArgNames: Map<number, string>,
  _stackArgLayouts: Map<number, StructLayout>,
  scalarArgs: Map<number, ts.Expression>,
  rtExpr: ts.Expression | null,
  outExpr: ts.Expression | null,
  factory: ts.NodeFactory,
): ts.Expression[] {
  const args: ts.Expression[] = []

  for (let i = 0; i < abi.params.length; i++) {
    const param = abi.params[i]
    if (param.isStackValue && param.layout) {
      const argName = stackArgNames.get(i)
      if (argName) {
        for (const field of param.layout.fields) {
          args.push(factory.createIdentifier(LayoutEngine.fieldLocalName(argName, field.name)))
        }
      }
    } else {
      const scalarExpr = scalarArgs.get(i)
      if (scalarExpr) args.push(scalarExpr)
    }
  }

  if (abi.returnsStackValue) {
    if (rtExpr) args.push(rtExpr)
    if (outExpr) args.push(outExpr)
  }

  return args
}

/**
 * Generates DPS write: scalar locals → arena destination.
 */
export function generateDPSWrite(
  resultVarName: string,
  layout: StructLayout,
  ctx: CodegenContext,
): ts.Statement[] {
  return layout.fields.map(field =>
    ctx.factory.createExpressionStatement(
      ctx.factory.createAssignment(
        arenaAccess(ctx, ctx.factory.createIdentifier('__out'), field.index),
        ctx.factory.createIdentifier(LayoutEngine.fieldLocalName(resultVarName, field.name)),
      ),
    ),
  )
}

/**
 * Generates DPS read: arena slot → scalar locals.
 */
export function generateDPSRead(
  varName: string,
  layout: StructLayout,
  slotExpr: ts.Expression,
  ctx: CodegenContext,
): ts.Statement[] {
  return layout.fields.map(field =>
    ctx.factory.createVariableStatement(
      undefined,
      ctx.factory.createVariableDeclarationList(
        [ctx.factory.createVariableDeclaration(
          LayoutEngine.fieldLocalName(varName, field.name),
          undefined, undefined,
          arenaAccess(ctx, slotExpr, field.index),
        )],
        ctx.ts.NodeFlags.Const,
      ),
    ),
  )
}
