import { describe, it, expect } from 'vitest'
import { stepBoids as stepBoidsStack, initBoids as initBoidsStack } from '../src/stack/boids.js'
import { stepBoids as stepBoidsPlain, initBoids as initBoidsPlain } from '../src/plain/boids.js'
import { createRng } from '../src/shared/seed-random.js'
import { DEFAULT_PARAMS, type BoidsParams } from '../src/shared/types.js'

const params: BoidsParams = {
  ...DEFAULT_PARAMS,
  bounds: { width: 200, height: 200, depth: 200 },
}

describe('Stack (lowered) boids vs plain boids', () => {
  it('initBoids produces same positions for same seed', () => {
    const rng1 = createRng(42)
    const rng2 = createRng(42)
    const plain = initBoidsPlain(20, params.bounds, rng1)
    const stack = initBoidsStack(20, params.bounds, rng2)

    expect(stack.length).toBe(plain.length)
    for (let i = 0; i < plain.length; i++) {
      expect(stack[i].position.x).toBe(plain[i].position.x)
      expect(stack[i].position.y).toBe(plain[i].position.y)
      expect(stack[i].position.z).toBe(plain[i].position.z)
      expect(stack[i].velocity.x).toBe(plain[i].velocity.x)
      expect(stack[i].velocity.y).toBe(plain[i].velocity.y)
      expect(stack[i].velocity.z).toBe(plain[i].velocity.z)
    }
  })

  it('stepBoids produces positions within 1e-10 after 10 steps', () => {
    const rng1 = createRng(42)
    const rng2 = createRng(42)
    const plain = initBoidsPlain(30, params.bounds, rng1)
    const stack = initBoidsStack(30, params.bounds, rng2)

    for (let step = 0; step < 10; step++) {
      stepBoidsPlain(plain, params)
      stepBoidsStack(stack, params)
    }

    for (let i = 0; i < plain.length; i++) {
      expect(Math.abs(stack[i].position.x - plain[i].position.x)).toBeLessThan(1e-10)
      expect(Math.abs(stack[i].position.y - plain[i].position.y)).toBeLessThan(1e-10)
      expect(Math.abs(stack[i].position.z - plain[i].position.z)).toBeLessThan(1e-10)
      expect(Math.abs(stack[i].velocity.x - plain[i].velocity.x)).toBeLessThan(1e-10)
      expect(Math.abs(stack[i].velocity.y - plain[i].velocity.y)).toBeLessThan(1e-10)
      expect(Math.abs(stack[i].velocity.z - plain[i].velocity.z)).toBeLessThan(1e-10)
    }
  })

  it('stepBoids produces deterministic output', () => {
    const rng1 = createRng(99)
    const rng2 = createRng(99)
    const boids1 = initBoidsStack(20, params.bounds, rng1)
    const boids2 = initBoidsStack(20, params.bounds, rng2)

    for (let i = 0; i < 5; i++) {
      stepBoidsStack(boids1, params)
      stepBoidsStack(boids2, params)
    }

    for (let i = 0; i < boids1.length; i++) {
      expect(boids1[i].position.x).toBe(boids2[i].position.x)
      expect(boids1[i].position.y).toBe(boids2[i].position.y)
      expect(boids1[i].position.z).toBe(boids2[i].position.z)
    }
  })
})
