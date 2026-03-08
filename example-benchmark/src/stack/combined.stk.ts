/**
 * Stack<T> vector library + boids — single compilation unit.
 *
 * This file demonstrates the stackfold source code that a developer would
 * write. The stackfold compiler transforms it into the scalar operations
 * found in ./boids.ts (the hand-lowered benchmark version).
 *
 * All Stack code must live in one file because the compiler discovers
 * function ABIs per-file (transformSource processes files individually).
 */

import type { Stack } from '@stackfold/types'
import { stack } from '@stackfold/types'

// ─── Vec3 type ──────────────────────────────────────────────────────

type StkVec3 = Stack<{ x: number; y: number; z: number }>

function vec3_create(x: number, y: number, z: number): StkVec3 {
  return stack.make<{ x: number; y: number; z: number }>({ x, y, z })
}

function vec3_zero(): StkVec3 {
  return stack.zero<{ x: number; y: number; z: number }>()
}

function vec3_add(a: StkVec3, b: StkVec3): StkVec3 {
  return stack.make<{ x: number; y: number; z: number }>({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  })
}

function vec3_sub(a: StkVec3, b: StkVec3): StkVec3 {
  return stack.make<{ x: number; y: number; z: number }>({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  })
}

function vec3_scale(a: StkVec3, s: number): StkVec3 {
  return stack.make<{ x: number; y: number; z: number }>({
    x: a.x * s,
    y: a.y * s,
    z: a.z * s,
  })
}

function vec3_lengthSq(a: StkVec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z
}

function vec3_length(a: StkVec3): number {
  return Math.sqrt(vec3_lengthSq(a))
}

function vec3_normalize(a: StkVec3): StkVec3 {
  const len = vec3_length(a)
  if (len === 0) return vec3_zero()
  return vec3_scale(a, 1 / len)
}

function vec3_dot(a: StkVec3, b: StkVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function vec3_distanceSq(a: StkVec3, b: StkVec3): number {
  return vec3_lengthSq(vec3_sub(a, b))
}

function vec3_clamp(v: StkVec3, max: number): StkVec3 {
  const sq = vec3_lengthSq(v)
  if (sq > max * max) {
    return vec3_scale(vec3_normalize(v), max)
  }
  return v
}

// ─── Vec2 type ──────────────────────────────────────────────────────

type StkVec2 = Stack<{ x: number; y: number }>

function vec2_create(x: number, y: number): StkVec2 {
  return stack.make<{ x: number; y: number }>({ x, y })
}

function vec2_add(a: StkVec2, b: StkVec2): StkVec2 {
  return stack.make<{ x: number; y: number }>({
    x: a.x + b.x,
    y: a.y + b.y,
  })
}

function vec2_sub(a: StkVec2, b: StkVec2): StkVec2 {
  return stack.make<{ x: number; y: number }>({
    x: a.x - b.x,
    y: a.y - b.y,
  })
}

function vec2_scale(a: StkVec2, s: number): StkVec2 {
  return stack.make<{ x: number; y: number }>({
    x: a.x * s,
    y: a.y * s,
  })
}

function vec2_dot(a: StkVec2, b: StkVec2): number {
  return a.x * b.x + a.y * b.y
}

// ─── Vec exports (before boids — build.ts compiles only the vec section) ──

export {
  vec3_create, vec3_zero, vec3_add, vec3_sub, vec3_scale,
  vec3_lengthSq, vec3_length, vec3_normalize, vec3_dot, vec3_distanceSq,
  vec2_create, vec2_add, vec2_sub, vec2_scale, vec2_dot,
}

// ─── Boids simulation ────────────────────────────────────────────────
//
// Boid state stored as flat scalars — this matches the lowered output:
// the compiler transforms Stack<T> returns into scalar locals, so the
// "Boid" struct becomes individual pos_x/vel_y/... fields rather than
// nested { position: {x,y,z}, velocity: {x,y,z} } objects.
//
// All intermediate vector math (separation, alignment, cohesion forces)
// uses Stack<T> locals — zero object allocation in the hot loop.
// Only the final write-back to bi.pos_x etc. touches heap memory.

export interface StkBoid {
  pos_x: number
  pos_y: number
  pos_z: number
  vel_x: number
  vel_y: number
  vel_z: number
}

export interface StkBoidsParams {
  perceptionRadius: number
  separationDistance: number
  maxSpeed: number
  maxForce: number
  separationWeight: number
  alignmentWeight: number
  cohesionWeight: number
  bounds: { width: number; height: number; depth: number }
}

export function initBoids(
  count: number,
  bounds: { width: number; height: number; depth: number },
  rng: () => number,
): StkBoid[] {
  const boids: StkBoid[] = []
  for (let i = 0; i < count; i++) {
    boids.push({
      pos_x: rng() * bounds.width,
      pos_y: rng() * bounds.height,
      pos_z: rng() * bounds.depth,
      vel_x: (rng() - 0.5) * 2,
      vel_y: (rng() - 0.5) * 2,
      vel_z: (rng() - 0.5) * 2,
    })
  }
  return boids
}

export function stepBoids(boids: StkBoid[], params: StkBoidsParams): void {
  const {
    perceptionRadius, separationDistance, maxSpeed, maxForce,
    separationWeight, alignmentWeight, cohesionWeight, bounds,
  } = params
  const perceptionSq = perceptionRadius * perceptionRadius
  const separationSq = separationDistance * separationDistance

  for (let i = 0; i < boids.length; i++) {
    const bi = boids[i]!

    // Load boid state into Stack<T> locals — compiler lowers to scalar lets
    const pos = vec3_create(bi.pos_x, bi.pos_y, bi.pos_z)
    const vel = vec3_create(bi.vel_x, bi.vel_y, bi.vel_z)

    // Accumulate forces using Stack<T> vectors — zero intermediate allocation
    let separation = vec3_zero()
    let alignment = vec3_zero()
    let cohesion = vec3_zero()
    let separationCount = 0
    let neighborCount = 0

    for (let j = 0; j < boids.length; j++) {
      if (i === j) continue
      const bj = boids[j]!
      const otherPos = vec3_create(bj.pos_x, bj.pos_y, bj.pos_z)
      const otherVel = vec3_create(bj.vel_x, bj.vel_y, bj.vel_z)
      const dSq = vec3_distanceSq(pos, otherPos)

      if (dSq < perceptionSq) {
        alignment = vec3_add(alignment, otherVel)
        cohesion = vec3_add(cohesion, otherPos)
        neighborCount++

        if (dSq < separationSq && dSq > 0) {
          const diff = vec3_sub(pos, otherPos)
          const scaled = vec3_scale(diff, 1 / Math.sqrt(dSq))
          separation = vec3_add(separation, scaled)
          separationCount++
        }
      }
    }

    let force = vec3_zero()

    if (separationCount > 0) {
      separation = vec3_scale(separation, 1 / separationCount)
      if (vec3_lengthSq(separation) > 0) {
        separation = vec3_scale(vec3_normalize(separation), maxSpeed)
        separation = vec3_sub(separation, vel)
        separation = vec3_clamp(separation, maxForce)
      }
      force = vec3_add(force, vec3_scale(separation, separationWeight))
    }

    if (neighborCount > 0) {
      // Alignment: steer toward average velocity
      alignment = vec3_scale(alignment, 1 / neighborCount)
      if (vec3_lengthSq(alignment) > 0) {
        alignment = vec3_scale(vec3_normalize(alignment), maxSpeed)
        alignment = vec3_sub(alignment, vel)
        alignment = vec3_clamp(alignment, maxForce)
      }
      force = vec3_add(force, vec3_scale(alignment, alignmentWeight))

      // Cohesion: steer toward average position
      cohesion = vec3_scale(cohesion, 1 / neighborCount)
      let desired = vec3_sub(cohesion, pos)
      if (vec3_lengthSq(desired) > 0) {
        desired = vec3_scale(vec3_normalize(desired), maxSpeed)
        desired = vec3_sub(desired, vel)
        desired = vec3_clamp(desired, maxForce)
      }
      force = vec3_add(force, vec3_scale(desired, cohesionWeight))
    }

    // Apply force to velocity, clamp to maxSpeed
    const newVel = vec3_clamp(vec3_add(vel, force), maxSpeed)

    // Update position and wrap bounds
    const newPos = vec3_add(pos, newVel)

    // Write back — only scalar assignments, no new objects in hot path
    bi.pos_x = ((newPos.x % bounds.width) + bounds.width) % bounds.width
    bi.pos_y = ((newPos.y % bounds.height) + bounds.height) % bounds.height
    bi.pos_z = ((newPos.z % bounds.depth) + bounds.depth) % bounds.depth
    bi.vel_x = newVel.x
    bi.vel_y = newVel.y
    bi.vel_z = newVel.z
  }
}

// (vec exports are above the boids section so build.ts can compile them separately)
