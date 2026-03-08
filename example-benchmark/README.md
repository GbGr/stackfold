# Stackfold Boids Benchmark

A benchmark comparing plain JavaScript object vectors against stackfold-lowered scalar vectors in a 3D boids flocking simulation.

## What is this?

This example demonstrates the performance benefit of [stackfold](../) — a TypeScript compiler that transforms `Stack<T>` value types into scalar local variables, eliminating heap allocation for hot-path vector math.

Two implementations of the same 3D boids flocking simulation:

- **Plain JS** — uses `{ x, y, z }` objects for all vector operations. Every `add()`, `sub()`, `scale()`, `normalize()` allocates a new object.
- **Stack\<T\> (lowered)** — the same algorithm with all vector math lowered to scalar variables. Zero intermediate object allocation. This is what the stackfold compiler produces.

## How stackfold works

The stackfold compiler transforms code like this:

```typescript
import { Stack, stack } from '@stackfold/types'

type Vec3 = Stack<{ x: number; y: number; z: number }>

function add(a: Vec3, b: Vec3): Vec3 {
  return stack.make<{ x: number; y: number; z: number }>({
    x: a.x + b.x, y: a.y + b.y, z: a.z + b.z,
  })
}
```

Into this:

```javascript
// All vector math becomes scalar operations — no object allocation
function __stk_add(a_x, a_y, a_z, b_x, b_y, b_z, __rt, __out) {
  __rt.mem[__out + 0] = a_x + b_x
  __rt.mem[__out + 1] = a_y + b_y
  __rt.mem[__out + 2] = a_z + b_z
}
```

In the hot loop of this benchmark, the lowered version stores all vector components as scalar `let` variables instead of `{ x, y, z }` objects. The only allocations are the final write-back of position/velocity per boid (2 objects per boid per frame), compared to potentially hundreds of temporary vector objects per boid in the plain version.

## The benchmark: Boids flocking

[Boids](https://en.wikipedia.org/wiki/Boids) is a classic flocking simulation where each entity (boid) follows three rules:

1. **Separation** — avoid crowding nearby boids
2. **Alignment** — steer toward average heading of neighbors
3. **Cohesion** — move toward center of mass of neighbors

Each rule requires heavy vector math per boid per frame (distance calculations, normalization, scaling, accumulation). With N boids and O(N²) neighbor checks, this creates massive allocation pressure for object-based vector libraries.

## Setup & Run

```bash
cd example-benchmark

# Install dependencies
npm install

# (Optional) Compile the Stack<T> source to see compiler output
npx tsx build.ts

# Run the benchmark
npx tsx src/bench.ts
```

Requires Node.js 18+ and the monorepo packages to be built (`pnpm build` from root).

## Results

Benchmarked on Apple M-series, Node.js v22, 3 frames per iteration, 1s time budget per benchmark.
Times shown are mean milliseconds per simulation step (frame).

| Entity Count | Plain JS (ms/step) | Stack\<T\> (ms/step) | Speedup |
|:------------:|:-------------------:|:---------------------:|:-------:|
| 1,000 | 10.3 | 4.0 | **2.59x** |
| 5,000 | 274.9 | 87.9 | **3.13x** |
| 10,000 | 1,115 | 354 | **3.15x** |

## Analysis

The stackfold-lowered version is consistently **~3x faster** across all entity counts.

**Why?**

1. **Zero intermediate allocation** — the plain version creates a new `{ x, y, z }` object for every vector operation (add, sub, scale, normalize). In the inner loop with 10K boids, that's millions of short-lived objects per frame. The lowered version uses scalar `let` variables — no GC pressure.

2. **Scalar locals stay in registers** — V8 can keep `pos_x`, `pos_y`, `pos_z` in CPU registers throughout the inner loop. Object property access requires memory indirection.

3. **Better JIT optimization** — simple scalar arithmetic is easier for V8's TurboFan to optimize than object creation + property access patterns.

The speedup grows slightly with entity count (2.6x → 3.1x) because larger simulations amplify GC pressure: more boids means more short-lived vector objects per frame, increasing garbage collector overhead relative to actual computation.

## Project structure

```
src/
  plain/           Plain JS implementation
    vec2.ts        Vec2 library ({x, y} objects)
    vec3.ts        Vec3 library ({x, y, z} objects)
    boids.ts       Boids simulation using plain vectors
  stack/
    combined.stk.ts  Stack<T> source (what you write)
    boids.ts         Hand-lowered scalar version (what the compiler produces)
  shared/
    types.ts       Shared Boid interface and simulation params
    seed-random.ts Deterministic PRNG for reproducible benchmarks
  bench.ts         Benchmark harness (tinybench)
build.ts           Compilation script (demonstrates compiler)
tests/             Vitest tests
```

> **Note:** Production projects should use the `stackc build` CLI or the Vite plugin. This example uses the compiler API directly for self-containment.
