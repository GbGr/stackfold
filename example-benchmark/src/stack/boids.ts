/**
 * Hand-lowered boids simulation — represents the output of the stackfold
 * compiler. All vector math uses scalar locals instead of {x, y, z} objects.
 *
 * Transformation applied:
 *   stack.make<Vec3>({x, y, z})  →  let v_x = x; let v_y = y; let v_z = z;
 *   v.x                          →  v_x
 *   v.x = expr                   →  v_x = expr
 *   stack.materialize(v)         →  { x: v_x, y: v_y, z: v_z }
 *   v3.add(a, b) (inlined)      →  scalar addition on each component
 *
 * The only object allocation is the final write-back of position/velocity
 * per boid (2 objects per boid per frame), vs the plain version which
 * allocates a new {x,y,z} for every intermediate vector operation.
 */

import type { Boid, BoidsParams } from '../shared/types.js'

export function initBoids(
  count: number,
  bounds: { width: number; height: number; depth: number },
  rng: () => number,
): Boid[] {
  const boids: Boid[] = []
  for (let i = 0; i < count; i++) {
    boids.push({
      position: {
        x: rng() * bounds.width,
        y: rng() * bounds.height,
        z: rng() * bounds.depth,
      },
      velocity: {
        x: (rng() - 0.5) * 2,
        y: (rng() - 0.5) * 2,
        z: (rng() - 0.5) * 2,
      },
    })
  }
  return boids
}

export function stepBoids(boids: Boid[], params: BoidsParams): void {
  const perceptionSq = params.perceptionRadius * params.perceptionRadius
  const separationSq = params.separationDistance * params.separationDistance
  const maxSpeed = params.maxSpeed
  const maxForce = params.maxForce
  const maxSpeedSq = maxSpeed * maxSpeed
  const maxForceSq = maxForce * maxForce
  const sepW = params.separationWeight
  const aliW = params.alignmentWeight
  const cohW = params.cohesionWeight
  const bW = params.bounds.width
  const bH = params.bounds.height
  const bD = params.bounds.depth

  for (let i = 0; i < boids.length; i++) {
    const bi = boids[i]

    // stack.make<Vec3>({...}) → scalar locals
    let pos_x = bi.position.x
    let pos_y = bi.position.y
    let pos_z = bi.position.z
    let vel_x = bi.velocity.x
    let vel_y = bi.velocity.y
    let vel_z = bi.velocity.z

    // stack.zero<Vec3>() → scalar locals initialized to 0
    let sep_x = 0, sep_y = 0, sep_z = 0
    let ali_x = 0, ali_y = 0, ali_z = 0
    let coh_x = 0, coh_y = 0, coh_z = 0
    let sepCount = 0
    let neighborCount = 0

    for (let j = 0; j < boids.length; j++) {
      if (i === j) continue
      const bj = boids[j]

      // v3.distanceSq inlined as scalar ops
      const dx = bj.position.x - pos_x
      const dy = bj.position.y - pos_y
      const dz = bj.position.z - pos_z
      const dSq = dx * dx + dy * dy + dz * dz

      if (dSq < perceptionSq) {
        // alignment: accumulate neighbor velocities (v3.add inlined)
        ali_x = ali_x + bj.velocity.x
        ali_y = ali_y + bj.velocity.y
        ali_z = ali_z + bj.velocity.z

        // cohesion: accumulate neighbor positions (v3.add inlined)
        coh_x = coh_x + bj.position.x
        coh_y = coh_y + bj.position.y
        coh_z = coh_z + bj.position.z
        neighborCount++

        // separation: push away from too-close neighbors
        if (dSq < separationSq && dSq > 0) {
          const invD = 1 / Math.sqrt(dSq)
          sep_x = sep_x + (-dx * invD)
          sep_y = sep_y + (-dy * invD)
          sep_z = sep_z + (-dz * invD)
          sepCount++
        }
      }
    }

    // Compute forces as scalars (no object allocation)
    let force_x = 0, force_y = 0, force_z = 0

    if (sepCount > 0) {
      // v3.scale(separation, 1/count) inlined
      sep_x = sep_x / sepCount
      sep_y = sep_y / sepCount
      sep_z = sep_z / sepCount

      const sepLenSq = sep_x * sep_x + sep_y * sep_y + sep_z * sep_z
      if (sepLenSq > 0) {
        // v3.normalize + v3.scale(maxSpeed) inlined
        const sepInvLen = maxSpeed / Math.sqrt(sepLenSq)
        sep_x = sep_x * sepInvLen
        sep_y = sep_y * sepInvLen
        sep_z = sep_z * sepInvLen

        // v3.sub(separation, velocity) inlined
        sep_x = sep_x - vel_x
        sep_y = sep_y - vel_y
        sep_z = sep_z - vel_z

        // clampMagnitude inlined
        const sepForceSq = sep_x * sep_x + sep_y * sep_y + sep_z * sep_z
        if (sepForceSq > maxForceSq) {
          const sepForceInv = maxForce / Math.sqrt(sepForceSq)
          sep_x = sep_x * sepForceInv
          sep_y = sep_y * sepForceInv
          sep_z = sep_z * sepForceInv
        }
      }

      force_x = force_x + sep_x * sepW
      force_y = force_y + sep_y * sepW
      force_z = force_z + sep_z * sepW
    }

    if (neighborCount > 0) {
      // Alignment force
      ali_x = ali_x / neighborCount
      ali_y = ali_y / neighborCount
      ali_z = ali_z / neighborCount

      const aliLenSq = ali_x * ali_x + ali_y * ali_y + ali_z * ali_z
      if (aliLenSq > 0) {
        const aliInvLen = maxSpeed / Math.sqrt(aliLenSq)
        ali_x = ali_x * aliInvLen
        ali_y = ali_y * aliInvLen
        ali_z = ali_z * aliInvLen

        ali_x = ali_x - vel_x
        ali_y = ali_y - vel_y
        ali_z = ali_z - vel_z

        const aliForceSq = ali_x * ali_x + ali_y * ali_y + ali_z * ali_z
        if (aliForceSq > maxForceSq) {
          const aliForceInv = maxForce / Math.sqrt(aliForceSq)
          ali_x = ali_x * aliForceInv
          ali_y = ali_y * aliForceInv
          ali_z = ali_z * aliForceInv
        }
      }

      force_x = force_x + ali_x * aliW
      force_y = force_y + ali_y * aliW
      force_z = force_z + ali_z * aliW

      // Cohesion force
      coh_x = coh_x / neighborCount
      coh_y = coh_y / neighborCount
      coh_z = coh_z / neighborCount

      // desired = cohesion - position
      let des_x = coh_x - pos_x
      let des_y = coh_y - pos_y
      let des_z = coh_z - pos_z

      const desLenSq = des_x * des_x + des_y * des_y + des_z * des_z
      if (desLenSq > 0) {
        const desInvLen = maxSpeed / Math.sqrt(desLenSq)
        des_x = des_x * desInvLen
        des_y = des_y * desInvLen
        des_z = des_z * desInvLen

        des_x = des_x - vel_x
        des_y = des_y - vel_y
        des_z = des_z - vel_z

        const desForceSq = des_x * des_x + des_y * des_y + des_z * des_z
        if (desForceSq > maxForceSq) {
          const desForceInv = maxForce / Math.sqrt(desForceSq)
          des_x = des_x * desForceInv
          des_y = des_y * desForceInv
          des_z = des_z * desForceInv
        }
      }

      force_x = force_x + des_x * cohW
      force_y = force_y + des_y * cohW
      force_z = force_z + des_z * cohW
    }

    // Apply force to velocity
    vel_x = vel_x + force_x
    vel_y = vel_y + force_y
    vel_z = vel_z + force_z

    // Clamp velocity to maxSpeed
    const speedSq = vel_x * vel_x + vel_y * vel_y + vel_z * vel_z
    if (speedSq > maxSpeedSq) {
      const speedInv = maxSpeed / Math.sqrt(speedSq)
      vel_x = vel_x * speedInv
      vel_y = vel_y * speedInv
      vel_z = vel_z * speedInv
    }

    // Update position
    pos_x = pos_x + vel_x
    pos_y = pos_y + vel_y
    pos_z = pos_z + vel_z

    // Wrap around bounds
    pos_x = ((pos_x % bW) + bW) % bW
    pos_y = ((pos_y % bH) + bH) % bH
    pos_z = ((pos_z % bD) + bD) % bD

    // Write back to boid (only allocation: 2 objects per boid)
    bi.position = { x: pos_x, y: pos_y, z: pos_z }
    bi.velocity = { x: vel_x, y: vel_y, z: vel_z }
  }
}
