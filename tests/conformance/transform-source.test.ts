/**
 * Integration test: verifies transformSource() produces scalar lowered output
 * for Stack<T> types (end-to-end through LayoutEngine brand detection).
 */

import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { transformSource, type TransformResult } from '../../packages/compiler/src/transformer.js'
import { getDefaultConfig } from '../../packages/compiler/src/config.js'

function compile(source: string): TransformResult {
  return transformSource(source, 'test.stk.ts', { ...getDefaultConfig(), mode: 'app', strict: true }, ts)
}

const PREAMBLE = `
declare const __stack_brand: unique symbol;
type Stack<T extends Record<string, number>> = T & { readonly [__stack_brand]: T };
declare namespace stack {
  function make<T extends Record<string, number>>(init: T): Stack<T>;
  function zero<T extends Record<string, number>>(): Stack<T>;
  function materialize<T extends Record<string, number>>(value: Stack<T>): T;
}
`

describe('transformSource end-to-end', () => {
  it('lowers stack.make to scalar let declarations', () => {
    const source = PREAMBLE + `
type Vec3 = Stack<{ x: number; y: number; z: number }>;
function vec3_create(x: number, y: number, z: number): Vec3 {
  return stack.make<{ x: number; y: number; z: number }>({ x, y, z });
}
`
    const result = compile(source)
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors).toHaveLength(0)

    // Should NOT contain stack.make — it must be lowered to scalar operations
    expect(result.outputText).not.toContain('stack.make')
    expect(result.outputText).not.toContain('stack.zero')
  })

  it('flattens Stack<T> function parameters to scalars', () => {
    const source = PREAMBLE + `
type Vec3 = Stack<{ x: number; y: number; z: number }>;
function vec3_add(a: Vec3, b: Vec3): Vec3 {
  return stack.make<{ x: number; y: number; z: number }>({
    x: a.x + b.x, y: a.y + b.y, z: a.z + b.z,
  });
}
`
    const result = compile(source)

    // Function should have flattened params (a_x, a_y, a_z, b_x, b_y, b_z)
    expect(result.outputText).toContain('a_x')
    expect(result.outputText).toContain('b_z')
    // Should use mangled name
    expect(result.outputText).toContain('__stk_vec3_add')
  })

  it('lowers stack.zero to zero-initialized scalar locals', () => {
    const source = PREAMBLE + `
type Vec2 = Stack<{ x: number; y: number }>;
function vec2_zero(): Vec2 {
  return stack.zero<{ x: number; y: number }>();
}
`
    const result = compile(source)
    expect(result.outputText).not.toContain('stack.zero')
  })

  it('does not include __stack_brand as a layout field', () => {
    const source = PREAMBLE + `
type Vec3 = Stack<{ x: number; y: number; z: number }>;
function vec3_create(x: number, y: number, z: number): Vec3 {
  return stack.make<{ x: number; y: number; z: number }>({ x, y, z });
}
`
    const result = compile(source)
    // Brand property must not appear as a field in the lowered output
    expect(result.outputText).not.toContain('__stack_brand')
    expect(result.outputText).not.toContain('__@_')
  })
})
