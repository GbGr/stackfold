/**
 * @stackfold/vite-plugin — Vite integration for stackfold.
 *
 * Invokes the compiler core inside Vite's transform hooks for eligible
 * .ts/.tsx files, preserves source maps, and surfaces compiler
 * diagnostics as Vite warnings/errors.
 */

import type { Plugin, FilterPattern } from 'vite'
import ts from 'typescript'
import {
  transformSource,
  loadConfig,
  mergeConfig,
  DiagnosticSeverity,
  type StackConfig,
} from '@stackfold/compiler'

export interface StackfoldViteOptions {
  /** Override config values (merged with auto-loaded config). */
  config?: Partial<StackConfig>
  /** File include patterns. Default: /\\.tsx?$/ */
  include?: FilterPattern
  /** File exclude patterns. Default: /node_modules/ */
  exclude?: FilterPattern
}

/**
 * Creates the Vite plugin for stackfold.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import stackfold from '@stackfold/vite-plugin'
 *
 * export default defineConfig({
 *   plugins: [stackfold()],
 * })
 * ```
 */
export default function stackfoldPlugin(options: StackfoldViteOptions = {}): Plugin {
  let config: StackConfig
  let projectRoot: string

  return {
    name: 'stackfold',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      projectRoot = resolvedConfig.root
      const loaded = loadConfig(projectRoot)
      config = options.config ? mergeConfig({ ...loaded, ...options.config }) : loaded
    },

    transform(code, id) {
      // Only process .ts and .tsx files
      if (!/\.tsx?$/.test(id)) return null
      // Skip declaration files
      if (/\.d\.ts$/.test(id)) return null
      // Skip node_modules by default
      if (/node_modules/.test(id)) return null

      // Quick check: skip files that don't reference stack types
      if (!code.includes('stack.') && !code.includes('Stack<')) return null

      try {
        const result = transformSource(code, id, config, ts)

        // Report diagnostics
        for (const d of result.diagnostics) {
          const msg = `[${d.code}] ${d.message}`
          if (d.severity === DiagnosticSeverity.Error) {
            this.error({ message: msg, id, pos: d.span.start })
          } else if (d.severity === DiagnosticSeverity.Warning) {
            this.warn({ message: msg, id, pos: d.span.start })
          }
        }

        // If there are errors in strict mode, don't emit
        const hasErrors = result.diagnostics.some(
          d => d.severity === DiagnosticSeverity.Error,
        )
        if (hasErrors && config.strict) return null

        if (!result.outputText) return null

        return {
          code: result.outputText,
          map: result.sourceMap ? JSON.parse(result.sourceMap) : null,
        }
      } catch (error) {
        this.error({
          message: `stackfold internal error: ${error instanceof Error ? error.message : String(error)}`,
          id,
        })
        return null
      }
    },
  }
}
