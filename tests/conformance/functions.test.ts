/**
 * Function ABI conformance tests: verify flattened parameter generation,
 * DPS write/read, and boundary wrapper generation.
 */

import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import {
  generateFlattenedParams,
  generateDPSWrite,
  generateDPSRead,
} from '../../packages/compiler/src/lowering/functions.js'
import { generateArenaScope, generateTempAlloc } from '../../packages/compiler/src/lowering/returns.js'
import { generatePublicWrapper } from '../../packages/compiler/src/lowering/boundary.js'
import type { FunctionABI } from '../../packages/compiler/src/lowering/functions.js'
import type { StructLayout } from '../../packages/compiler/src/layout.js'

const vec3Layout: StructLayout = {
  typeName: 'Vec3',
  fields: [
    { name: 'x', index: 0 },
    { name: 'y', index: 1 },
    { name: 'z', index: 2 },
  ],
  wordCount: 3,
}

function printNode(node: ts.Node): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const sourceFile = ts.createSourceFile('test.ts', '', ts.ScriptTarget.Latest)
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
}

function printStatements(stmts: ts.Statement[]): string {
  return stmts.map(s => printNode(s)).join('\n')
}

describe('Function ABI lowering', () => {
  describe('generateFlattenedParams', () => {
    it('flattens Vec3 parameter into three number params', () => {
      const abi: FunctionABI = {
        originalName: 'scale',
        mangledName: '__stk_scale',
        params: [
          { originalName: 'v', isStackValue: true, layout: vec3Layout },
          { originalName: 'factor', isStackValue: false },
        ],
        returnsStackValue: false,
      }

      const params = generateFlattenedParams(abi, ts.factory)
      const names = params.map(p => printNode(p.name))

      expect(names).toEqual(['v_x', 'v_y', 'v_z', 'factor'])
    })

    it('adds __rt and __out for DPS returns', () => {
      const abi: FunctionABI = {
        originalName: 'add',
        mangledName: '__stk_add',
        params: [
          { originalName: 'a', isStackValue: true, layout: vec3Layout },
          { originalName: 'b', isStackValue: true, layout: vec3Layout },
        ],
        returnsStackValue: true,
        returnLayout: vec3Layout,
      }

      const params = generateFlattenedParams(abi, ts.factory)
      const names = params.map(p => printNode(p.name))

      expect(names).toEqual([
        'a_x', 'a_y', 'a_z',
        'b_x', 'b_y', 'b_z',
        '__rt', '__out',
      ])
    })
  })

  describe('generateDPSWrite', () => {
    it('writes scalar locals to arena destination', () => {
      const stmts = generateDPSWrite('result', vec3Layout, { factory: ts.factory, ts })
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(3)
      expect(output).toContain('__rt.mem[__out] = result_x')
      expect(output).toContain('__rt.mem[__out + 1] = result_y')
      expect(output).toContain('__rt.mem[__out + 2] = result_z')
    })
  })

  describe('generateDPSRead', () => {
    it('reads arena slot into scalar locals', () => {
      const slotExpr = ts.factory.createIdentifier('__tmp')
      const stmts = generateDPSRead('v', vec3Layout, slotExpr, { factory: ts.factory, ts })
      const output = printStatements(stmts)

      expect(stmts).toHaveLength(3)
      expect(output).toContain('const v_x = __rt.mem[__tmp]')
      expect(output).toContain('const v_y = __rt.mem[__tmp + 1]')
      expect(output).toContain('const v_z = __rt.mem[__tmp + 2]')
    })
  })

  describe('generateArenaScope', () => {
    it('produces mark/try/finally', () => {
      const body = [
        ts.factory.createExpressionStatement(
          ts.factory.createIdentifier('doSomething'),
        ),
      ]
      const stmts = generateArenaScope(body, '__m', ts.factory, ts)
      const output = printStatements(stmts)

      expect(output).toContain('const __m = __rt.mark()')
      expect(output).toContain('try')
      expect(output).toContain('finally')
      expect(output).toContain('__rt.reset(__m)')
    })
  })

  describe('generateTempAlloc', () => {
    it('produces alloc call', () => {
      const stmt = generateTempAlloc('__tmp', 3, ts.factory, ts)
      const output = printNode(stmt)

      expect(output).toContain('const __tmp = __rt.alloc(3)')
    })
  })

  describe('generatePublicWrapper', () => {
    it('generates library mode wrapper function', () => {
      const abi: FunctionABI = {
        originalName: 'add',
        mangledName: '__stk_add',
        params: [
          { originalName: 'a', isStackValue: true, layout: vec3Layout },
          { originalName: 'b', isStackValue: true, layout: vec3Layout },
        ],
        returnsStackValue: true,
        returnLayout: vec3Layout,
      }

      const wrapper = generatePublicWrapper(
        abi, '__stackfold_getRuntime', ts.factory, ts,
      )
      const output = printNode(wrapper)

      // Should have export keyword
      expect(output).toContain('export')
      // Should call the mangled function
      expect(output).toContain('__stk_add')
      // Should marshal object args: a.x, a.y, a.z, b.x, b.y, b.z
      expect(output).toContain('a.x')
      expect(output).toContain('b.z')
      // Should materialize the return
      expect(output).toContain('__rt.mem[__out]')
      // Should have mark/reset
      expect(output).toContain('__rt.mark()')
      expect(output).toContain('__rt.reset(__m)')
    })
  })
})
