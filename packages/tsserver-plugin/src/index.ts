/**
 * @stackfold/tsserver-plugin — TypeScript Language Service plugin.
 *
 * Surfaces STK diagnostics inside editors (VS Code, etc.) by delegating
 * to the compiler core rather than re-implementing analysis rules.
 *
 * Usage in tsconfig.json:
 *   {
 *     "compilerOptions": {
 *       "plugins": [{ "name": "@stackfold/tsserver-plugin" }]
 *     }
 *   }
 */

import type ts from 'typescript'
import {
  checkSource,
  loadConfig,
  DiagnosticSeverity,
  type StackConfig,
  type Diagnostic,
} from '@stackfold/compiler'

/**
 * Converts a stackfold Diagnostic to a TypeScript ts.Diagnostic.
 */
function convertDiagnostic(
  d: Diagnostic,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
): ts.Diagnostic {
  const category =
    d.severity === DiagnosticSeverity.Error
      ? typescript.DiagnosticCategory.Error
      : d.severity === DiagnosticSeverity.Warning
        ? typescript.DiagnosticCategory.Warning
        : typescript.DiagnosticCategory.Message

  const messageText = d.fix
    ? `${d.message}\nFix: ${d.fix}`
    : d.message

  return {
    file: sourceFile,
    start: d.span.start,
    length: d.span.end - d.span.start,
    messageText,
    category,
    code: parseInt(d.code.replace('STK', ''), 10) + 90000,
    source: 'stackfold',
  }
}

/**
 * TypeScript Language Service Plugin entry point.
 * Called by tsserver when the plugin is loaded.
 */
function init(modules: { typescript: typeof ts }) {
  const typescript = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const logger = info.project.projectService.logger

    logger.info('[@stackfold/tsserver-plugin] Initializing')

    // Load stackfold config from the project root
    const projectRoot = info.project.getCurrentDirectory()
    let config: StackConfig
    try {
      config = loadConfig(projectRoot)
    } catch {
      config = loadConfig('__nonexistent__') // falls back to defaults
    }

    // Build the proxy (decorator pattern)
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(proxy as any)[k] = (...args: unknown[]) => (x as Function).apply(info.languageService, args)
    }

    // Override getSemanticDiagnostics to inject STK diagnostics
    proxy.getSemanticDiagnostics = (fileName: string): ts.Diagnostic[] => {
      const original = info.languageService.getSemanticDiagnostics(fileName)

      if (!/\.tsx?$/.test(fileName) || /\.d\.ts$/.test(fileName)) {
        return original
      }

      const program = info.languageService.getProgram()
      if (!program) return original

      const sourceFile = program.getSourceFile(fileName)
      if (!sourceFile) return original

      const sourceText = sourceFile.getFullText()

      if (!sourceText.includes('stack.') && !sourceText.includes('Stack<')) {
        return original
      }

      try {
        const stkDiagnostics = checkSource(sourceText, fileName, config, typescript)
        const tsDiags = stkDiagnostics.map(d => convertDiagnostic(d, sourceFile, typescript))
        return [...original, ...tsDiags]
      } catch (error) {
        logger.info(
          `[@stackfold/tsserver-plugin] Error analyzing ${fileName}: ${error}`,
        )
        return original
      }
    }

    return proxy
  }

  return { create }
}

export default init
