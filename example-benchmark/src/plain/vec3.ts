export interface JsVec3 {
  x: number
  y: number
  z: number
}

export function create(x: number, y: number, z: number): JsVec3 {
  return { x, y, z }
}

export function zero(): JsVec3 {
  return { x: 0, y: 0, z: 0 }
}

export function add(a: JsVec3, b: JsVec3): JsVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: JsVec3, b: JsVec3): JsVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale(a: JsVec3, s: number): JsVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function lengthSq(a: JsVec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z
}

export function length(a: JsVec3): number {
  return Math.sqrt(lengthSq(a))
}

export function normalize(a: JsVec3): JsVec3 {
  const len = length(a)
  if (len === 0) return { x: 0, y: 0, z: 0 }
  return { x: a.x / len, y: a.y / len, z: a.z / len }
}

export function dot(a: JsVec3, b: JsVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: JsVec3, b: JsVec3): JsVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function distanceSq(a: JsVec3, b: JsVec3): number {
  return lengthSq(sub(a, b))
}

export function distance(a: JsVec3, b: JsVec3): number {
  return Math.sqrt(distanceSq(a, b))
}
