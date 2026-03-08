/**
 * Config tests: verify configuration loading and merging.
 */

import { describe, it, expect } from 'vitest'
import { mergeConfig, getDefaultConfig } from '../../packages/compiler/src/config.js'

describe('Config', () => {
  it('returns sensible defaults', () => {
    const config = getDefaultConfig()
    expect(config.mode).toBe('app')
    expect(config.strict).toBe(true)
    expect(config.arena.initialWords).toBe(4096)
    expect(config.debug.emitIR).toBe(false)
    expect(config.diagnostics.warningsAsErrors).toBe(false)
  })

  it('merges partial config with defaults', () => {
    const config = mergeConfig({ mode: 'library', strict: false })
    expect(config.mode).toBe('library')
    expect(config.strict).toBe(false)
    // Defaults preserved
    expect(config.arena.initialWords).toBe(4096)
    expect(config.debug.emitIR).toBe(false)
  })

  it('merges nested arena config', () => {
    const config = mergeConfig({ arena: { initialWords: 8192 } })
    expect(config.arena.initialWords).toBe(8192)
    expect(config.mode).toBe('app')
  })

  it('merges diagnostics config', () => {
    const config = mergeConfig({ diagnostics: { warningsAsErrors: true } })
    expect(config.diagnostics.warningsAsErrors).toBe(true)
  })

  it('handles empty partial', () => {
    const config = mergeConfig({})
    expect(config).toEqual(getDefaultConfig())
  })
})
