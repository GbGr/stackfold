import { describe, it, expect } from 'vitest'
import * as v2 from '../src/plain/vec2.js'
import * as v3 from '../src/plain/vec3.js'

describe('Plain JS Vec2', () => {
  it('create returns a new object', () => {
    const a = v2.create(1, 2)
    expect(a).toEqual({ x: 1, y: 2 })
  })

  it('zero returns {0, 0}', () => {
    expect(v2.zero()).toEqual({ x: 0, y: 0 })
  })

  it('add returns sum without mutating inputs', () => {
    const a = v2.create(1, 2)
    const b = v2.create(3, 4)
    const c = v2.add(a, b)
    expect(c).toEqual({ x: 4, y: 6 })
    expect(a).toEqual({ x: 1, y: 2 })
    expect(b).toEqual({ x: 3, y: 4 })
  })

  it('sub returns difference', () => {
    expect(v2.sub(v2.create(5, 7), v2.create(2, 3))).toEqual({ x: 3, y: 4 })
  })

  it('scale multiplies by scalar', () => {
    expect(v2.scale(v2.create(2, 3), 4)).toEqual({ x: 8, y: 12 })
  })

  it('lengthSq returns squared magnitude', () => {
    expect(v2.lengthSq(v2.create(3, 4))).toBe(25)
  })

  it('length returns magnitude', () => {
    expect(v2.length(v2.create(3, 4))).toBe(5)
  })

  it('normalize returns unit vector', () => {
    const n = v2.normalize(v2.create(3, 4))
    expect(n.x).toBeCloseTo(0.6)
    expect(n.y).toBeCloseTo(0.8)
  })

  it('normalize of zero vector returns zero', () => {
    expect(v2.normalize(v2.zero())).toEqual({ x: 0, y: 0 })
  })

  it('dot returns dot product', () => {
    expect(v2.dot(v2.create(1, 2), v2.create(3, 4))).toBe(11)
  })

  it('distanceSq returns squared distance', () => {
    expect(v2.distanceSq(v2.create(1, 1), v2.create(4, 5))).toBe(25)
  })

  it('distance returns euclidean distance', () => {
    expect(v2.distance(v2.create(1, 1), v2.create(4, 5))).toBe(5)
  })
})

describe('Plain JS Vec3', () => {
  it('create returns a new object', () => {
    expect(v3.create(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('zero returns {0, 0, 0}', () => {
    expect(v3.zero()).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('add returns sum without mutating inputs', () => {
    const a = v3.create(1, 2, 3)
    const b = v3.create(4, 5, 6)
    const c = v3.add(a, b)
    expect(c).toEqual({ x: 5, y: 7, z: 9 })
    expect(a).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('sub returns difference', () => {
    expect(v3.sub(v3.create(5, 7, 9), v3.create(1, 2, 3))).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('scale multiplies by scalar', () => {
    expect(v3.scale(v3.create(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 })
  })

  it('lengthSq returns squared magnitude', () => {
    expect(v3.lengthSq(v3.create(1, 2, 2))).toBe(9)
  })

  it('length returns magnitude', () => {
    expect(v3.length(v3.create(1, 2, 2))).toBe(3)
  })

  it('normalize returns unit vector', () => {
    const n = v3.normalize(v3.create(1, 2, 2))
    expect(n.x).toBeCloseTo(1 / 3)
    expect(n.y).toBeCloseTo(2 / 3)
    expect(n.z).toBeCloseTo(2 / 3)
  })

  it('normalize of zero vector returns zero', () => {
    expect(v3.normalize(v3.zero())).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('dot returns dot product', () => {
    expect(v3.dot(v3.create(1, 2, 3), v3.create(4, 5, 6))).toBe(32)
  })

  it('distanceSq returns squared distance', () => {
    expect(v3.distanceSq(v3.create(0, 0, 0), v3.create(1, 2, 2))).toBe(9)
  })

  it('distance returns euclidean distance', () => {
    expect(v3.distance(v3.create(0, 0, 0), v3.create(1, 2, 2))).toBe(3)
  })

  it('cross returns cross product', () => {
    const c = v3.cross(v3.create(1, 0, 0), v3.create(0, 1, 0))
    expect(c).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('cross is anti-commutative', () => {
    const a = v3.create(1, 2, 3)
    const b = v3.create(4, 5, 6)
    const ab = v3.cross(a, b)
    const ba = v3.cross(b, a)
    expect(ab.x).toBe(-ba.x)
    expect(ab.y).toBe(-ba.y)
    expect(ab.z).toBe(-ba.z)
  })
})
