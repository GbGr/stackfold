import type { JsVec3 } from '../plain/vec3.js'

export interface Boid {
  position: JsVec3
  velocity: JsVec3
}

export interface BoidsParams {
  perceptionRadius: number
  separationDistance: number
  maxSpeed: number
  maxForce: number
  separationWeight: number
  alignmentWeight: number
  cohesionWeight: number
  bounds: { width: number; height: number; depth: number }
}

export const DEFAULT_PARAMS: BoidsParams = {
  perceptionRadius: 50,
  separationDistance: 25,
  maxSpeed: 4,
  maxForce: 0.1,
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  bounds: { width: 500, height: 500, depth: 500 },
}
