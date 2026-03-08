/**
 * Boids flocking benchmark — Plain JS objects vs stackfold-lowered scalars.
 *
 * Runs both implementations at 1K, 5K, 10K entity counts using tinybench.
 * Outputs results to console and writes results.json.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { Bench } from 'tinybench'
import { initBoids as initPlain, stepBoids as stepPlain } from './plain/boids.js'
import { initBoids as initStack, stepBoids as stepStack } from './stack/boids.js'
import { createRng } from './shared/seed-random.js'
import { DEFAULT_PARAMS, type BoidsParams } from './shared/types.js'

const ENTITY_COUNTS = [1_000, 5_000, 10_000]
// 3 frames per iteration — 100 was the original target but 10K boids at O(n²) makes
// each iteration ~2.5 seconds, so 3 frames keeps the benchmark tractable (~2.5s/iter)
const FRAMES_PER_ITERATION = 3
const SEED = 42

const params: BoidsParams = {
  ...DEFAULT_PARAMS,
  bounds: { width: 500, height: 500, depth: 500 },
}

interface BenchResult {
  entityCount: number
  plain: { opsPerSec: number; meanMs: number; p75Ms: number; p99Ms: number }
  stack: { opsPerSec: number; meanMs: number; p75Ms: number; p99Ms: number }
  speedup: number
}

async function runBenchmark(): Promise<BenchResult[]> {
  const results: BenchResult[] = []

  for (const count of ENTITY_COUNTS) {
    console.log(`\nBenchmarking ${count} boids (${FRAMES_PER_ITERATION} frames/iteration)...`)

    // Initialize both versions with same seed
    const plainBoids = initPlain(count, params.bounds, createRng(SEED))
    const stackBoids = initStack(count, params.bounds, createRng(SEED))

    const bench = new Bench({
      warmupIterations: 5,
      time: 1000,
    })

    bench
      .add(`Plain JS (${count})`, () => {
        for (let f = 0; f < FRAMES_PER_ITERATION; f++) {
          stepPlain(plainBoids, params)
        }
      })
      .add(`Stack<T> (${count})`, () => {
        for (let f = 0; f < FRAMES_PER_ITERATION; f++) {
          stepStack(stackBoids, params)
        }
      })

    await bench.run()

    const plainResult = bench.tasks[0]!.result!
    const stackResult = bench.tasks[1]!.result!

    // tinybench mean/p75/p99 are in milliseconds (from performance.now())
    // ops/sec = 1000ms / mean_ms
    const entry: BenchResult = {
      entityCount: count,
      plain: {
        opsPerSec: Math.round(1e3 / plainResult.mean),
        meanMs: plainResult.mean,
        p75Ms: plainResult.p75,
        p99Ms: plainResult.p99,
      },
      stack: {
        opsPerSec: Math.round(1e3 / stackResult.mean),
        meanMs: stackResult.mean,
        p75Ms: stackResult.p75,
        p99Ms: stackResult.p99,
      },
      speedup: plainResult.mean / stackResult.mean,
    }

    results.push(entry)

    console.log(`  Plain JS: ${entry.plain.opsPerSec} ops/s (mean: ${entry.plain.meanMs.toFixed(2)}ms)`)
    console.log(`  Stack<T>: ${entry.stack.opsPerSec} ops/s (mean: ${entry.stack.meanMs.toFixed(2)}ms)`)
    console.log(`  Speedup:  ${entry.speedup.toFixed(2)}x`)
  }

  return results
}

async function main() {
  console.log('=== Stackfold Boids Benchmark ===')
  console.log(`Frames per iteration: ${FRAMES_PER_ITERATION}`)
  console.log(`Entity counts: ${ENTITY_COUNTS.join(', ')}`)

  const results = await runBenchmark()

  // Print summary table
  console.log('\n┌─────────────┬──────────────────┬──────────────────┬─────────┐')
  console.log('│ Entity Count│ Plain JS (ops/s) │ Stack<T> (ops/s) │ Speedup │')
  console.log('├─────────────┼──────────────────┼──────────────────┼─────────┤')
  for (const r of results) {
    const count = String(r.entityCount).padStart(11)
    const plain = String(r.plain.opsPerSec).padStart(16)
    const stack = String(r.stack.opsPerSec).padStart(16)
    const speedup = r.speedup.toFixed(2).padStart(7)
    console.log(`│${count} │${plain} │${stack} │${speedup} │`)
  }
  console.log('└─────────────┴──────────────────┴──────────────────┴─────────┘')

  // Write results.json
  const outPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'results.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\nResults written to results.json`)
}

main().catch(console.error)
