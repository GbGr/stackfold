import { describe, it, expect } from 'vitest'
import { initBoids, stepBoids } from '../src/plain/boids.js'
import { createRng } from '../src/shared/seed-random.js'
import { DEFAULT_PARAMS, type BoidsParams } from '../src/shared/types.js'
import * as v3 from '../src/plain/vec3.js'

const smallParams: BoidsParams = {
  ...DEFAULT_PARAMS,
  bounds: { width: 100, height: 100, depth: 100 },
}

describe('Boids simulation (plain JS)', () => {
  it('initBoids creates the correct number of boids', () => {
    const rng = createRng(42)
    const boids = initBoids(10, smallParams.bounds, rng)
    expect(boids).toHaveLength(10)
  })

  it('initBoids positions are within bounds', () => {
    const rng = createRng(42)
    const { width, height, depth } = smallParams.bounds
    const boids = initBoids(50, smallParams.bounds, rng)
    for (const b of boids) {
      expect(b.position.x).toBeGreaterThanOrEqual(0)
      expect(b.position.x).toBeLessThanOrEqual(width)
      expect(b.position.y).toBeGreaterThanOrEqual(0)
      expect(b.position.y).toBeLessThanOrEqual(height)
      expect(b.position.z).toBeGreaterThanOrEqual(0)
      expect(b.position.z).toBeLessThanOrEqual(depth)
    }
  })

  it('stepBoids produces deterministic output for fixed seed', () => {
    const rng1 = createRng(42)
    const boids1 = initBoids(20, smallParams.bounds, rng1)
    for (let i = 0; i < 10; i++) stepBoids(boids1, smallParams)

    const rng2 = createRng(42)
    const boids2 = initBoids(20, smallParams.bounds, rng2)
    for (let i = 0; i < 10; i++) stepBoids(boids2, smallParams)

    for (let i = 0; i < boids1.length; i++) {
      expect(boids1[i].position.x).toBe(boids2[i].position.x)
      expect(boids1[i].position.y).toBe(boids2[i].position.y)
      expect(boids1[i].position.z).toBe(boids2[i].position.z)
    }
  })

  it('separation pushes boids apart when too close', () => {
    // Place two boids very close together
    const boids = [
      { position: v3.create(50, 50, 50), velocity: v3.zero() },
      { position: v3.create(51, 50, 50), velocity: v3.zero() },
    ]
    const params: BoidsParams = {
      ...smallParams,
      separationWeight: 10,
      alignmentWeight: 0,
      cohesionWeight: 0,
      separationDistance: 30,
      perceptionRadius: 50,
    }

    stepBoids(boids, params)

    // After step, boids should have moved apart (distance increased)
    const dist = v3.distance(boids[0].position, boids[1].position)
    expect(dist).toBeGreaterThan(1)
  })

  it('cohesion pulls boid toward center of mass', () => {
    // One boid far from a group of three
    const boids = [
      { position: v3.create(50, 50, 50), velocity: v3.zero() },  // loner
      { position: v3.create(80, 50, 50), velocity: v3.zero() },
      { position: v3.create(80, 52, 50), velocity: v3.zero() },
      { position: v3.create(80, 48, 50), velocity: v3.zero() },
    ]
    const params: BoidsParams = {
      ...smallParams,
      separationWeight: 0,
      alignmentWeight: 0,
      cohesionWeight: 10,
      perceptionRadius: 100,
    }

    const originalX = boids[0].position.x
    stepBoids(boids, params)

    // Loner should move toward the group (positive x direction)
    expect(boids[0].position.x).toBeGreaterThan(originalX)
  })

  it('alignment steers toward average heading', () => {
    // One boid stationary, neighbors all moving right
    const boids = [
      { position: v3.create(50, 50, 50), velocity: v3.zero() },
      { position: v3.create(55, 50, 50), velocity: v3.create(4, 0, 0) },
      { position: v3.create(45, 50, 50), velocity: v3.create(4, 0, 0) },
    ]
    const params: BoidsParams = {
      ...smallParams,
      separationWeight: 0,
      alignmentWeight: 10,
      cohesionWeight: 0,
      perceptionRadius: 100,
    }

    stepBoids(boids, params)

    // Stationary boid should now have positive x velocity (aligned with neighbors)
    expect(boids[0].velocity.x).toBeGreaterThan(0)
  })

  it('velocity is clamped to maxSpeed', () => {
    const rng = createRng(42)
    const boids = initBoids(30, smallParams.bounds, rng)

    for (let i = 0; i < 50; i++) stepBoids(boids, smallParams)

    for (const b of boids) {
      const speed = v3.length(b.velocity)
      expect(speed).toBeLessThanOrEqual(smallParams.maxSpeed + 1e-10)
    }
  })

  it('positions wrap around bounds', () => {
    const bounds = { width: 100, height: 100, depth: 100 }
    const boids = [
      { position: v3.create(99, 50, 50), velocity: v3.create(4, 0, 0) },
    ]
    const params: BoidsParams = {
      ...smallParams,
      bounds,
      separationWeight: 0,
      alignmentWeight: 0,
      cohesionWeight: 0,
    }

    stepBoids(boids, params)

    // Position should wrap around
    expect(boids[0].position.x).toBeLessThan(100)
    expect(boids[0].position.x).toBeGreaterThanOrEqual(0)
  })
})
