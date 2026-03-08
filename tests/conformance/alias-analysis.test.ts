/**
 * Alias analysis tests.
 */

import { describe, it, expect } from 'vitest'
import {
  AliasSafety,
  needsTemporaryCopy,
  type AliasAnalysisResult,
} from '../../packages/compiler/src/alias-analysis.js'

describe('Alias analysis', () => {
  describe('needsTemporaryCopy', () => {
    it('returns false for alias-safe functions', () => {
      const result: AliasAnalysisResult = {
        safety: AliasSafety.Safe,
        diagnostics: [],
        aliasingParams: [],
      }
      expect(needsTemporaryCopy(result, 10, [5, 15])).toBe(false)
    })

    it('returns false when destination is scalar', () => {
      const result: AliasAnalysisResult = {
        safety: AliasSafety.Unknown,
        diagnostics: [],
        aliasingParams: [0],
      }
      expect(needsTemporaryCopy(result, 'scalar', [5])).toBe(false)
    })

    it('returns true when destination matches an aliasing input', () => {
      const result: AliasAnalysisResult = {
        safety: AliasSafety.Unsafe,
        diagnostics: [],
        aliasingParams: [0],
      }
      expect(needsTemporaryCopy(result, 10, [10, 20])).toBe(true)
    })

    it('returns true for unknown safety with non-scalar inputs', () => {
      const result: AliasAnalysisResult = {
        safety: AliasSafety.Unknown,
        diagnostics: [],
        aliasingParams: [0, 1],
      }
      expect(needsTemporaryCopy(result, 10, [5, 15])).toBe(true)
    })

    it('returns false for unknown safety with all scalar inputs', () => {
      const result: AliasAnalysisResult = {
        safety: AliasSafety.Unknown,
        diagnostics: [],
        aliasingParams: [0],
      }
      expect(needsTemporaryCopy(result, 10, ['scalar'])).toBe(false)
    })
  })
})
