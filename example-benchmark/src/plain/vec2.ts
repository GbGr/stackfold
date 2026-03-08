export interface JsVec2 {
  x: number
  y: number
}

export function create(x: number, y: number): JsVec2 {
  return { x, y }
}

export function zero(): JsVec2 {
  return { x: 0, y: 0 }
}

export function add(a: JsVec2, b: JsVec2): JsVec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: JsVec2, b: JsVec2): JsVec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: JsVec2, s: number): JsVec2 {
  return { x: a.x * s, y: a.y * s }
}

export function lengthSq(a: JsVec2): number {
  return a.x * a.x + a.y * a.y
}

export function length(a: JsVec2): number {
  return Math.sqrt(lengthSq(a))
}

export function normalize(a: JsVec2): JsVec2 {
  const len = length(a)
  if (len === 0) return { x: 0, y: 0 }
  return { x: a.x / len, y: a.y / len }
}

export function dot(a: JsVec2, b: JsVec2): number {
  return a.x * b.x + a.y * b.y
}

export function distanceSq(a: JsVec2, b: JsVec2): number {
  return lengthSq(sub(a, b))
}

export function distance(a: JsVec2, b: JsVec2): number {
  return Math.sqrt(distanceSq(a, b))
}
