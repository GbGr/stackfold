/**
 * Configuration parsing for stackfold. Reads from stack.config.ts,
 * stack.config.js, or the "stack" key in package.json.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export type CompilationMode = 'app' | 'library'

export interface ArenaConfig {
  /** Initial scratch capacity in Float64 words. Default: 4096 */
  initialWords: number
}

export interface DebugConfig {
  /** Write intermediate lowered output for debugging. Default: false */
  emitIR: boolean
}

export interface DiagnosticsConfig {
  /** Promote warnings to build failures. Default: false */
  warningsAsErrors: boolean
}

export interface StackConfig {
  /** Selects app or library boundary behavior. Default: 'app' */
  mode: CompilationMode
  /** Reject implicit escapes and unsupported patterns. Default: true */
  strict: boolean
  /** Arena configuration. */
  arena: ArenaConfig
  /** Debug output settings. */
  debug: DebugConfig
  /** Diagnostics behavior. */
  diagnostics: DiagnosticsConfig
  /** Glob patterns for files to include. */
  include: string[]
  /** Glob patterns for files to exclude. */
  exclude: string[]
}

const DEFAULT_CONFIG: StackConfig = {
  mode: 'app',
  strict: true,
  arena: { initialWords: 4096 },
  debug: { emitIR: false },
  diagnostics: { warningsAsErrors: false },
  include: ['**/*.ts', '**/*.tsx'],
  exclude: ['node_modules/**', 'dist/**', '**/*.d.ts'],
}

/**
 * Loads stackfold configuration from the project root.
 * Checks (in order): stack.config.ts, stack.config.js, package.json "stack" key.
 */
export function loadConfig(projectRoot: string): StackConfig {
  // Try stack.config.ts / stack.config.js
  for (const name of ['stack.config.ts', 'stack.config.js']) {
    const configPath = path.join(projectRoot, name)
    if (fs.existsSync(configPath)) {
      // For .ts files, we need to transpile. For now, we'll handle .js directly
      // and support .ts via the CLI which pre-transpiles configs.
      if (name.endsWith('.js')) {
        try {
          // Dynamic import would be async; for sync config loading we read the JSON-like form
          const content = fs.readFileSync(configPath, 'utf-8')
          const userConfig = parseConfigContent(content)
          return mergeConfig(userConfig)
        } catch {
          // Fall through
        }
      }
      // For .ts config files, return default for now (CLI handles transpilation)
      return { ...DEFAULT_CONFIG }
    }
  }

  // Try package.json "stack" key
  const pkgPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (pkg.stack && typeof pkg.stack === 'object') {
        return mergeConfig(pkg.stack)
      }
    } catch {
      // Fall through
    }
  }

  return { ...DEFAULT_CONFIG }
}

/**
 * Creates a StackConfig from a partial user-provided config object.
 */
export function mergeConfig(partial: Partial<StackConfig>): StackConfig {
  return {
    mode: partial.mode ?? DEFAULT_CONFIG.mode,
    strict: partial.strict ?? DEFAULT_CONFIG.strict,
    arena: {
      initialWords: partial.arena?.initialWords ?? DEFAULT_CONFIG.arena.initialWords,
    },
    debug: {
      emitIR: partial.debug?.emitIR ?? DEFAULT_CONFIG.debug.emitIR,
    },
    diagnostics: {
      warningsAsErrors: partial.diagnostics?.warningsAsErrors ?? DEFAULT_CONFIG.diagnostics.warningsAsErrors,
    },
    include: partial.include ?? DEFAULT_CONFIG.include,
    exclude: partial.exclude ?? DEFAULT_CONFIG.exclude,
  }
}

export function getDefaultConfig(): StackConfig {
  return { ...DEFAULT_CONFIG }
}

function parseConfigContent(content: string): Partial<StackConfig> {
  // Simple heuristic: try to extract a default export object
  // This is a basic parser for `export default { ... }` or `module.exports = { ... }`
  try {
    // Try JSON-like extraction
    const match = content.match(/(?:export\s+default|module\.exports\s*=)\s*(\{[\s\S]*\})/)
    if (match) {
      // This is a best-effort parse; real implementation would use proper JS evaluation
      return JSON.parse(match[1])
    }
  } catch {
    // Fall through
  }
  return {}
}
