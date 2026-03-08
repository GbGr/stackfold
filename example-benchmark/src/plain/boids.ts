import type { Boid, BoidsParams } from '../shared/types.js'
import * as v3 from './vec3.js'

/**
 * Initialize boids with deterministic positions and velocities.
 */
export function initBoids(
  count: number,
  bounds: { width: number; height: number; depth: number },
  rng: () => number,
): Boid[] {
  const boids: Boid[] = []
  for (let i = 0; i < count; i++) {
    boids.push({
      position: v3.create(
        rng() * bounds.width,
        rng() * bounds.height,
        rng() * bounds.depth,
      ),
      velocity: v3.create(
        (rng() - 0.5) * 2,
        (rng() - 0.5) * 2,
        (rng() - 0.5) * 2,
      ),
    })
  }
  return boids
}

/**
 * Run one simulation step: compute separation, alignment, cohesion
 * forces and update boid positions/velocities in-place.
 */
export function stepBoids(boids: Boid[], params: BoidsParams): void {
  const {
    perceptionRadius, separationDistance, maxSpeed, maxForce,
    separationWeight, alignmentWeight, cohesionWeight, bounds,
  } = params
  const perceptionSq = perceptionRadius * perceptionRadius
  const separationSq = separationDistance * separationDistance

  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i]
    let separation = v3.zero()
    let alignment = v3.zero()
    let cohesion = v3.zero()
    let separationCount = 0
    let neighborCount = 0

    for (let j = 0; j < boids.length; j++) {
      if (i === j) continue
      const other = boids[j]
      const dSq = v3.distanceSq(boid.position, other.position)

      if (dSq < perceptionSq) {
        // Alignment: accumulate neighbor velocities
        alignment = v3.add(alignment, other.velocity)
        // Cohesion: accumulate neighbor positions
        cohesion = v3.add(cohesion, other.position)
        neighborCount++

        // Separation: push away from too-close neighbors
        if (dSq < separationSq && dSq > 0) {
          const diff = v3.sub(boid.position, other.position)
          const scaled = v3.scale(diff, 1 / Math.sqrt(dSq))
          separation = v3.add(separation, scaled)
          separationCount++
        }
      }
    }

    let force = v3.zero()

    if (separationCount > 0) {
      separation = v3.scale(separation, 1 / separationCount)
      if (v3.lengthSq(separation) > 0) {
        separation = v3.scale(v3.normalize(separation), maxSpeed)
        separation = v3.sub(separation, boid.velocity)
        separation = clampMagnitude(separation, maxForce)
      }
      force = v3.add(force, v3.scale(separation, separationWeight))
    }

    if (neighborCount > 0) {
      // Alignment: steer toward average velocity
      alignment = v3.scale(alignment, 1 / neighborCount)
      if (v3.lengthSq(alignment) > 0) {
        alignment = v3.scale(v3.normalize(alignment), maxSpeed)
        alignment = v3.sub(alignment, boid.velocity)
        alignment = clampMagnitude(alignment, maxForce)
      }
      force = v3.add(force, v3.scale(alignment, alignmentWeight))

      // Cohesion: steer toward average position
      cohesion = v3.scale(cohesion, 1 / neighborCount)
      let desired = v3.sub(cohesion, boid.position)
      if (v3.lengthSq(desired) > 0) {
        desired = v3.scale(v3.normalize(desired), maxSpeed)
        desired = v3.sub(desired, boid.velocity)
        desired = clampMagnitude(desired, maxForce)
      }
      force = v3.add(force, v3.scale(desired, cohesionWeight))
    }

    // Apply force to velocity
    boid.velocity = v3.add(boid.velocity, force)

    // Clamp velocity to maxSpeed
    if (v3.lengthSq(boid.velocity) > maxSpeed * maxSpeed) {
      boid.velocity = v3.scale(v3.normalize(boid.velocity), maxSpeed)
    }

    // Update position
    boid.position = v3.add(boid.position, boid.velocity)

    // Wrap around bounds
    boid.position = {
      x: ((boid.position.x % bounds.width) + bounds.width) % bounds.width,
      y: ((boid.position.y % bounds.height) + bounds.height) % bounds.height,
      z: ((boid.position.z % bounds.depth) + bounds.depth) % bounds.depth,
    }
  }
}

function clampMagnitude(v: { x: number; y: number; z: number }, max: number) {
  const sq = v3.lengthSq(v)
  if (sq > max * max) {
    return v3.scale(v3.normalize(v), max)
  }
  return v
}
