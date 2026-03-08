/**
 * xorshift128 PRNG for deterministic benchmarks.
 * Returns values in [0, 1).
 */
export function createRng(seed: number) {
  let s0 = seed | 0 || 1
  let s1 = (seed * 1812433253 + 1) | 0
  let s2 = (s1 * 1812433253 + 1) | 0
  let s3 = (s2 * 1812433253 + 1) | 0

  return function next(): number {
    const t = s0 ^ (s0 << 11)
    s0 = s1
    s1 = s2
    s2 = s3
    s3 = (s3 ^ (s3 >>> 19)) ^ (t ^ (t >>> 8))
    return (s3 >>> 0) / 4294967296
  }
}
