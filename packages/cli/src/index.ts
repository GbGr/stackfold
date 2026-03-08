/**
 * @stackfold/cli — The `stackc` command-line tool.
 *
 * Commands:
 *   stackc check [files...]   Validate sources without emit
 *   stackc build [files...]   Validate, lower, and emit
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import {
  loadConfig,
  transformSource,
  checkSource,
  type Diagnostic,
  DiagnosticSeverity,
  type StackConfig,
} from '@stackfold/compiler'

// ---------------------------------------------------------------------------
// CLI argument parsing (minimal, no external deps)
// ---------------------------------------------------------------------------

interface CliArgs {
  command: 'check' | 'build' | 'help'
  files: string[]
  project: string
  watch: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  const result: CliArgs = {
    command: 'help',
    files: [],
    project: process.cwd(),
    watch: false,
  }

  if (args.length === 0) return result

  const command = args[0]
  if (command === 'check' || command === 'build') {
    result.command = command
  } else if (command === 'help' || command === '--help' || command === '-h') {
    return result
  } else {
    // Treat as file for default build command
    result.command = 'build'
    result.files.push(command)
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--project' || arg === '-p') {
      result.project = args[++i] ?? process.cwd()
    } else if (arg === '--watch' || arg === '-w') {
      result.watch = true
    } else if (!arg.startsWith('-')) {
      result.files.push(arg)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverFiles(config: StackConfig, project: string, explicitFiles: string[]): string[] {
  if (explicitFiles.length > 0) {
    return explicitFiles.map(f => path.resolve(project, f))
  }

  // Use tsconfig.json to find files
  const tsconfigPath = path.join(project, 'tsconfig.json')
  if (fs.existsSync(tsconfigPath)) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    if (configFile.config) {
      const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, project)
      return parsed.fileNames.filter(f => {
        // Apply include/exclude from stack config
        const rel = path.relative(project, f)
        const excluded = config.exclude.some(pattern => matchGlob(rel, pattern))
        if (excluded) return false
        return config.include.some(pattern => matchGlob(rel, pattern))
      })
    }
  }

  // Fallback: find .ts files in the project
  return findTsFiles(project, config)
}

function findTsFiles(dir: string, config: StackConfig): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const rel = path.relative(dir, fullPath)

    if (entry.isDirectory()) {
      if (config.exclude.some(p => matchGlob(entry.name, p))) continue
      files.push(...findTsFiles(fullPath, config))
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (!entry.name.endsWith('.d.ts')) {
        files.push(fullPath)
      }
    }
  }

  return files
}

function matchGlob(path: string, pattern: string): boolean {
  // Simple glob matching for common patterns
  const regex = pattern
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\./g, '\\.')
  return new RegExp(`^${regex}$`).test(path)
}

// ---------------------------------------------------------------------------
// Diagnostic formatting
// ---------------------------------------------------------------------------

function formatDiagnostic(d: Diagnostic, sourceText?: string): string {
  const severity = d.severity === DiagnosticSeverity.Error ? 'error'
    : d.severity === DiagnosticSeverity.Warning ? 'warning'
    : 'internal'

  let location = d.span.file
  if (sourceText) {
    const lines = sourceText.substring(0, d.span.start).split('\n')
    const line = lines.length
    const col = (lines[lines.length - 1]?.length ?? 0) + 1
    location = `${d.span.file}:${line}:${col}`
  }

  let msg = `${location} - ${severity} ${d.code}: ${d.message}`
  if (d.fix) {
    msg += `\n  Fix: ${d.fix}`
  }
  return msg
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function runCheck(args: CliArgs): number {
  const config = loadConfig(args.project)
  const files = discoverFiles(config, args.project, args.files)

  if (files.length === 0) {
    console.log('No files to check.')
    return 0
  }

  let errorCount = 0
  let warningCount = 0

  for (const file of files) {
    const sourceText = fs.readFileSync(file, 'utf-8')
    const diagnostics = checkSource(sourceText, file, config, ts)

    for (const d of diagnostics) {
      console.log(formatDiagnostic(d, sourceText))
      if (d.severity === DiagnosticSeverity.Error) errorCount++
      if (d.severity === DiagnosticSeverity.Warning) {
        warningCount++
        if (config.diagnostics.warningsAsErrors) errorCount++
      }
    }
  }

  console.log(`\nChecked ${files.length} file(s): ${errorCount} error(s), ${warningCount} warning(s)`)
  return errorCount > 0 ? 1 : 0
}

function runBuild(args: CliArgs): number {
  const config = loadConfig(args.project)
  const files = discoverFiles(config, args.project, args.files)

  if (files.length === 0) {
    console.log('No files to build.')
    return 0
  }

  let errorCount = 0
  let warningCount = 0
  let emittedCount = 0

  for (const file of files) {
    const sourceText = fs.readFileSync(file, 'utf-8')
    const result = transformSource(sourceText, file, config, ts)

    for (const d of result.diagnostics) {
      console.log(formatDiagnostic(d, sourceText))
      if (d.severity === DiagnosticSeverity.Error) errorCount++
      if (d.severity === DiagnosticSeverity.Warning) {
        warningCount++
        if (config.diagnostics.warningsAsErrors) errorCount++
      }
    }

    // Only emit if no errors (or no errors for this file)
    const fileErrors = result.diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error,
    ).length
    if (fileErrors === 0 && result.outputText) {
      const outFile = file.replace(/\.tsx?$/, '.js')
      const outDir = path.dirname(outFile)
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(outFile, result.outputText, 'utf-8')
      emittedCount++

      if (result.sourceMap) {
        fs.writeFileSync(`${outFile}.map`, result.sourceMap, 'utf-8')
      }

      if (config.debug.emitIR) {
        fs.writeFileSync(
          file.replace(/\.tsx?$/, '.stk.ir'),
          result.outputText,
          'utf-8',
        )
      }
    }
  }

  console.log(
    `\nBuilt ${files.length} file(s): ${emittedCount} emitted, ` +
    `${errorCount} error(s), ${warningCount} warning(s)`,
  )
  return errorCount > 0 ? 1 : 0
}

function printHelp(): void {
  console.log(`
stackc — Stack Value Types compiler for TypeScript

Usage:
  stackc check [files...]   Validate sources without emit
  stackc build [files...]   Validate, lower, and emit JavaScript

Options:
  -p, --project <dir>  Project root directory (default: cwd)
  -w, --watch          Watch mode (rebuild on changes)
  -h, --help           Show this help message

Configuration:
  Place a stack.config.ts or add a "stack" key to package.json.

  mode          'app' | 'library'     Default: 'app'
  strict        boolean               Default: true
  arena.initialWords  number          Default: 4096
  debug.emitIR  boolean               Default: false
`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv)

  let exitCode = 0
  switch (args.command) {
    case 'check':
      exitCode = runCheck(args)
      break
    case 'build':
      exitCode = runBuild(args)
      break
    case 'help':
      printHelp()
      break
  }

  process.exit(exitCode)
}

main()
