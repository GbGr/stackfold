/**
 * Alias analysis: classifies transformed functions as alias-safe,
 * alias-unsafe, or unknown. When destination storage may overlap an
 * input and correctness is not proven, the compiler allocates a
 * temporary and copies the result into the final destination.
 */

import type ts from 'typescript'
import {
  type Diagnostic,
  STK1007,
  STK2002,
  createDiagnostic,
  spanFromNode,
} from './diagnostics.js'

export enum AliasSafety {
  /** Proven: destination never overlaps any input. */
  Safe = 'safe',
  /** Proven: destination may overlap an input. */
  Unsafe = 'unsafe',
  /** Cannot determine statically. */
  Unknown = 'unknown',
}

export interface AliasAnalysisResult {
  safety: AliasSafety
  diagnostics: Diagnostic[]
  /** If unsafe or unknown, which parameter indices might alias the destination. */
  aliasingParams: number[]
}

/**
 * Analyzes whether a DPS function's output slot might alias any of its
 * input slots. This is relevant when the function writes to __out and
 * also reads from input parameters that refer to arena slots.
 *
 * For scalar-lowered locals (P1), aliasing is never possible because
 * each field is a separate JS variable. This analysis becomes critical
 * in P2 when parameters are arena slot references.
 *
 * Heuristic rules:
 * 1. If the function only reads from scalar params (not arena slots),
 *    it is alias-safe.
 * 2. If the function receives arena slot references and also writes
 *    to __out, check whether any input slot could equal __out.
 * 3. If the function body never reads from an input after the first
 *    write to __out, it is alias-safe (write-first pattern).
 */
export function analyzeAliasing(
  _fnNode: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  paramIsArenaSlot: boolean[],
  _typescript: typeof ts,
): AliasAnalysisResult {
  const diagnostics: Diagnostic[] = []
  const aliasingParams: number[] = []

  // If no params are arena slots, aliasing is impossible
  const hasAnyArenaSlot = paramIsArenaSlot.some(Boolean)
  if (!hasAnyArenaSlot) {
    return { safety: AliasSafety.Safe, diagnostics, aliasingParams }
  }

  // For v1, we conservatively mark all arena-slot params as potentially aliasing
  for (let i = 0; i < paramIsArenaSlot.length; i++) {
    if (paramIsArenaSlot[i]) {
      aliasingParams.push(i)
    }
  }

  // Conservative: if any param could be an arena slot, classify as unknown
  diagnostics.push(
    createDiagnostic(STK2002, spanFromNode(_fnNode), {
      fn: _fnNode.name ? _fnNode.name.text : '<anonymous>',
    }),
  )

  return {
    safety: AliasSafety.Unknown,
    diagnostics,
    aliasingParams,
  }
}

/**
 * Given an alias analysis result, determines if a temporary copy is needed
 * for a particular call site.
 */
export function needsTemporaryCopy(
  analysis: AliasAnalysisResult,
  destSlot: number | 'scalar',
  inputSlots: (number | 'scalar')[],
): boolean {
  if (analysis.safety === AliasSafety.Safe) return false
  if (destSlot === 'scalar') return false

  // Check if the destination could overlap any input
  for (const paramIdx of analysis.aliasingParams) {
    const inputSlot = inputSlots[paramIdx]
    if (inputSlot === destSlot) return true
    // If unknown, be conservative
    if (analysis.safety === AliasSafety.Unknown && inputSlot !== 'scalar') return true
  }

  return false
}
