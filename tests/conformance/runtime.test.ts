/**
 * Runtime conformance tests: StackRuntime arena operations.
 */

import { describe, it, expect } from 'vitest'
import { StackRuntime } from '../../packages/runtime/src/index.js'

describe('StackRuntime', () => {
  it('initializes with default capacity', () => {
    const rt = new StackRuntime()
    expect(rt.sp).toBe(0)
    expect(rt.mem.length).toBe(4096)
  })

  it('initializes with custom capacity', () => {
    const rt = new StackRuntime({ initialWords: 16 })
    expect(rt.mem.length).toBe(16)
  })

  it('alloc advances stack pointer and returns offset', () => {
    const rt = new StackRuntime({ initialWords: 64 })
    const offset1 = rt.alloc(3)
    expect(offset1).toBe(0)
    expect(rt.sp).toBe(3)

    const offset2 = rt.alloc(4)
    expect(offset2).toBe(3)
    expect(rt.sp).toBe(7)
  })

  it('mark/reset restores stack pointer', () => {
    const rt = new StackRuntime({ initialWords: 64 })
    rt.alloc(3)
    const mark = rt.mark()
    expect(mark).toBe(3)

    rt.alloc(5)
    expect(rt.sp).toBe(8)

    rt.reset(mark)
    expect(rt.sp).toBe(3)
  })

  it('supports nested mark/reset', () => {
    const rt = new StackRuntime({ initialWords: 64 })

    const m1 = rt.mark()
    rt.alloc(3)

    const m2 = rt.mark()
    rt.alloc(4)
    expect(rt.sp).toBe(7)

    rt.reset(m2)
    expect(rt.sp).toBe(3)

    rt.reset(m1)
    expect(rt.sp).toBe(0)
  })

  it('read/write work correctly', () => {
    const rt = new StackRuntime({ initialWords: 64 })
    const offset = rt.alloc(3)

    rt.write(offset, 0, 1.0)
    rt.write(offset, 1, 2.0)
    rt.write(offset, 2, 3.0)

    expect(rt.read(offset, 0)).toBe(1.0)
    expect(rt.read(offset, 1)).toBe(2.0)
    expect(rt.read(offset, 2)).toBe(3.0)
  })

  it('copy handles non-overlapping regions', () => {
    const rt = new StackRuntime({ initialWords: 64 })
    const src = rt.alloc(3)
    rt.write(src, 0, 10)
    rt.write(src, 1, 20)
    rt.write(src, 2, 30)

    const dst = rt.alloc(3)
    rt.copy(src, dst, 3)

    expect(rt.read(dst, 0)).toBe(10)
    expect(rt.read(dst, 1)).toBe(20)
    expect(rt.read(dst, 2)).toBe(30)
  })

  it('auto-grows when capacity exceeded', () => {
    const rt = new StackRuntime({ initialWords: 4 })
    const offset = rt.alloc(8) // exceeds initial capacity
    expect(offset).toBe(0)
    expect(rt.sp).toBe(8)
    expect(rt.mem.length).toBeGreaterThanOrEqual(8)

    // Data should still be accessible
    rt.write(offset, 7, 42)
    expect(rt.read(offset, 7)).toBe(42)
  })

  it('preserves data during growth', () => {
    const rt = new StackRuntime({ initialWords: 4 })
    const offset1 = rt.alloc(3)
    rt.write(offset1, 0, 100)
    rt.write(offset1, 1, 200)
    rt.write(offset1, 2, 300)

    // Force growth
    rt.alloc(10)

    // Original data preserved
    expect(rt.read(offset1, 0)).toBe(100)
    expect(rt.read(offset1, 1)).toBe(200)
    expect(rt.read(offset1, 2)).toBe(300)
  })

  it('debug mode poisons released slots', () => {
    const rt = new StackRuntime({ initialWords: 64, debug: true })
    const offset = rt.alloc(3)
    rt.write(offset, 0, 1)
    rt.write(offset, 1, 2)
    rt.write(offset, 2, 3)

    const mark = rt.mark()
    // mark is at 3, we allocated 3 words before it...
    // Actually: we alloc'ed 3, so sp=3. mark() returns 3.
    // Let's allocate more:
    const offset2 = rt.alloc(2)
    rt.write(offset2, 0, 10)
    rt.write(offset2, 1, 20)

    rt.reset(mark)
    // Slots [3, 4] should be NaN now
    expect(rt.read(offset2, 0)).toBeNaN()
    expect(rt.read(offset2, 1)).toBeNaN()

    // Slots [0, 1, 2] should be untouched
    expect(rt.read(offset, 0)).toBe(1)
    expect(rt.read(offset, 1)).toBe(2)
    expect(rt.read(offset, 2)).toBe(3)
  })

  it('simulates Vec3 add with DPS pattern', () => {
    const rt = new StackRuntime({ initialWords: 64 })

    // Simulate: add(a, b) where a={1,2,3}, b={4,5,6}
    // In lowered form: __stk_add(a_x, a_y, a_z, b_x, b_y, b_z, rt, out)
    const out = rt.alloc(3)

    function __stk_add(
      a_x: number, a_y: number, a_z: number,
      b_x: number, b_y: number, b_z: number,
      __rt: StackRuntime, __out: number,
    ): void {
      __rt.mem[__out + 0] = a_x + b_x
      __rt.mem[__out + 1] = a_y + b_y
      __rt.mem[__out + 2] = a_z + b_z
    }

    __stk_add(1, 2, 3, 4, 5, 6, rt, out)

    expect(rt.read(out, 0)).toBe(5)
    expect(rt.read(out, 1)).toBe(7)
    expect(rt.read(out, 2)).toBe(9)
  })

  it('simulates nested return: normalize(add(a, b))', () => {
    const rt = new StackRuntime({ initialWords: 64 })

    function __stk_add(
      a_x: number, a_y: number, a_z: number,
      b_x: number, b_y: number, b_z: number,
      __rt: StackRuntime, __out: number,
    ): void {
      __rt.mem[__out + 0] = a_x + b_x
      __rt.mem[__out + 1] = a_y + b_y
      __rt.mem[__out + 2] = a_z + b_z
    }

    function __stk_normalize_from_slot(
      slot: number,
      __rt: StackRuntime, __out: number,
    ): void {
      const x = __rt.mem[slot + 0]
      const y = __rt.mem[slot + 1]
      const z = __rt.mem[slot + 2]
      const len = Math.sqrt(x * x + y * y + z * z)
      __rt.mem[__out + 0] = x / len
      __rt.mem[__out + 1] = y / len
      __rt.mem[__out + 2] = z / len
    }

    // Simulate: normalizeAdd(a, b)
    const finalOut = rt.alloc(3)
    const m = rt.mark()
    try {
      const tmp = rt.alloc(3)
      __stk_add(3, 0, 0, 0, 4, 0, rt, tmp)
      __stk_normalize_from_slot(tmp, rt, finalOut)
    } finally {
      rt.reset(m)
    }

    // add result: {3, 4, 0}, length = 5
    // normalized: {0.6, 0.8, 0}
    expect(rt.read(finalOut, 0)).toBeCloseTo(0.6)
    expect(rt.read(finalOut, 1)).toBeCloseTo(0.8)
    expect(rt.read(finalOut, 2)).toBeCloseTo(0)

    // Arena should be cleaned up to just the final output
    expect(rt.sp).toBe(3)
  })
})
