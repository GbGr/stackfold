/**
 * Lowering conformance tests: verify that scalar local lowering
 * produces correct AST nodes.
 */

import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import {
  lowerStackMake, lowerStackZero,
  lowerPropertyRead, lowerPropertyWrite,
  lowerMaterialize, lowerStructAssignment,
} from '../../packages/compiler/src/lowering/locals.js'
import type { StructLayout } from '../../packages/compiler/src/layout.js'
import type { LocalLoweringContext } from '../../packages/compiler/src/lowering/locals.js'

const vec3Layout: StructLayout = {
  typeName: 'Vec3',
  fields: [
    { name: 'x', index: 0 },
    { name: 'y', index: 1 },
    { name: 'z', index: 2 },
  ],
  wordCount: 3,
}

const vec2Layout: StructLayout = {
  typeName: 'Vec2',
  fields: [
    { name: 'x', index: 0 },
    { name: 'y', index: 1 },
  ],
  wordCount: 2,
}

function createCtx(): LocalLoweringContext {
  return {
    stackLocals: new Map(),
    factory: ts.factory,
    typescript: ts,
  }
}

function printNode(node: ts.Node): string {
  const printer = ts.createPrinter()
  const sourceFile = ts.createSourceFile('test.ts', '', ts.ScriptTarget.Latest)
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
}

function printStatements(stmts: ts.Statement[]): string {
  return stmts.map(s => printNode(s)).join('\n')
}

describe('Scalar local lowering', () => {
  describe('lowerStackMake', () => {
    it('creates scalar declarations for Vec3', () => {
      const ctx = createCtx()
      const initProps = new Map<string, ts.Expression>([
        ['x', ts.factory.createNumericLiteral(1)],
        ['y', ts.factory.createNumericLiteral(2)],
        ['z', ts.factory.createNumericLiteral(3)],
      ])

      const stmts = lowerStackMake('v', vec3Layout, initProps, ctx)
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(3)
      expect(output).toContain('let v_x = 1')
      expect(output).toContain('let v_y = 2')
      expect(output).toContain('let v_z = 3')
    })

    it('creates scalar declarations for Vec2', () => {
      const ctx = createCtx()
      const initProps = new Map<string, ts.Expression>([
        ['x', ts.factory.createNumericLiteral(10)],
        ['y', ts.factory.createNumericLiteral(20)],
      ])

      const stmts = lowerStackMake('pos', vec2Layout, initProps, ctx)
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(2)
      expect(output).toContain('let pos_x = 10')
      expect(output).toContain('let pos_y = 20')
    })

    it('uses 0 for missing init values', () => {
      const ctx = createCtx()
      const initProps = new Map<string, ts.Expression>([
        ['x', ts.factory.createNumericLiteral(5)],
      ])

      const stmts = lowerStackMake('v', vec3Layout, initProps, ctx)
      const output = printStatements(stmts)

      expect(output).toContain('let v_x = 5')
      expect(output).toContain('let v_y = 0')
      expect(output).toContain('let v_z = 0')
    })
  })

  describe('lowerStackZero', () => {
    it('creates zero-initialized scalar declarations', () => {
      const ctx = createCtx()
      const stmts = lowerStackZero('z', vec3Layout, ctx)
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(3)
      expect(output).toContain('let z_x = 0')
      expect(output).toContain('let z_y = 0')
      expect(output).toContain('let z_z = 0')
    })
  })

  describe('lowerPropertyRead', () => {
    it('returns identifier for field local', () => {
      const ctx = createCtx()
      const expr = lowerPropertyRead('v', 'x', ctx)
      expect(printNode(expr)).toBe('v_x')
    })

    it('handles different variable names', () => {
      const ctx = createCtx()
      expect(printNode(lowerPropertyRead('pos', 'y', ctx))).toBe('pos_y')
      expect(printNode(lowerPropertyRead('vel', 'z', ctx))).toBe('vel_z')
    })
  })

  describe('lowerPropertyWrite', () => {
    it('creates assignment to field local', () => {
      const ctx = createCtx()
      const expr = lowerPropertyWrite('v', 'x', ts.factory.createNumericLiteral(42), ctx)
      const output = printNode(expr)
      expect(output).toBe('v_x = 42')
    })
  })

  describe('lowerMaterialize', () => {
    it('creates object literal from scalars', () => {
      const ctx = createCtx()
      const expr = lowerMaterialize('v', vec3Layout, ctx)
      const output = printNode(expr)
      expect(output).toContain('x: v_x')
      expect(output).toContain('y: v_y')
      expect(output).toContain('z: v_z')
    })

    it('handles Vec2', () => {
      const ctx = createCtx()
      const expr = lowerMaterialize('pos', vec2Layout, ctx)
      const output = printNode(expr)
      expect(output).toContain('x: pos_x')
      expect(output).toContain('y: pos_y')
      expect(output).not.toContain('z:')
    })
  })

  describe('lowerStructAssignment', () => {
    it('creates field-by-field assignment', () => {
      const ctx = createCtx()
      const stmts = lowerStructAssignment('a', 'b', vec3Layout, ctx)
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(3)
      expect(output).toContain('a_x = b_x')
      expect(output).toContain('a_y = b_y')
      expect(output).toContain('a_z = b_z')
    })
  })
})
