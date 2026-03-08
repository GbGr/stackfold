/**
 * Diagnostic codes, severity levels, and message templates for
 * the stackfold compiler. All unsupported constructs produce
 * stable diagnostic codes in the STK namespace.
 *
 * Ranges:
 *   STK1001–STK1099  Hard semantic errors in user code
 *   STK2001–STK2099  Migration warnings and performance advisories
 *   STK3001–STK3099  Internal compiler failures and invariant violations
 */

export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning',
  Internal = 'internal',
}

export interface SourceSpan {
  file: string
  start: number
  end: number
}

export interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  span: SourceSpan
  fix?: string
}

// ---------------------------------------------------------------------------
// Error codes (STK1xxx)
// ---------------------------------------------------------------------------

export const STK1001 = 'STK1001' as const // Unsupported field type
export const STK1002 = 'STK1002' as const // Unsupported property (optional, computed, method)
export const STK1003 = 'STK1003' as const // Escape to unknown callee
export const STK1004 = 'STK1004' as const // Closure capture
export const STK1005 = 'STK1005' as const // Crosses await or yield
export const STK1006 = 'STK1006' as const // Dynamic property access
export const STK1007 = 'STK1007' as const // Unsafe aliasing
export const STK1008 = 'STK1008' as const // Partial initialization
export const STK1009 = 'STK1009' as const // Unsupported spread
export const STK1010 = 'STK1010' as const // Unsupported reflection/identity op
export const STK1011 = 'STK1011' as const // Stack value in array/collection
export const STK1012 = 'STK1012' as const // Missing struct fields in make()
export const STK1013 = 'STK1013' as const // Extra fields in make()
export const STK1014 = 'STK1014' as const // Non-literal argument to make()

// ---------------------------------------------------------------------------
// Warning codes (STK2xxx)
// ---------------------------------------------------------------------------

export const STK2001 = 'STK2001' as const // Implicit materialization (migration mode)
export const STK2002 = 'STK2002' as const // Alias safety unknown, inserting temporary
export const STK2003 = 'STK2003' as const // Performance advisory

// ---------------------------------------------------------------------------
// Internal error codes (STK3xxx)
// ---------------------------------------------------------------------------

export const STK3001 = 'STK3001' as const // Internal: unexpected AST shape
export const STK3002 = 'STK3002' as const // Internal: layout cache miss
export const STK3003 = 'STK3003' as const // Internal: lowering invariant violated

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  [STK1001]: 'Unsupported field type: property "{field}" of "{type}" must be of type number. Stack values in v1 support only flat numeric fields.',
  [STK1002]: 'Unsupported property: "{field}" on "{type}" is {reason}. Stack values require plain, required, non-computed number properties.',
  [STK1003]: 'Escape to unknown callee: stack value "{name}" is passed to non-transformed function "{callee}". Use stack.materialize() to convert it to a plain object first.',
  [STK1004]: 'Closure capture: stack value "{name}" is captured by a closure. Stack values cannot be captured by closures in v1. Extract the needed scalar fields before the closure, or use stack.materialize().',
  [STK1005]: 'Suspension crossing: stack value "{name}" cannot live across an await or yield boundary. Materialize it before the suspension point or restructure the code.',
  [STK1006]: 'Dynamic property access: stack values do not support dynamic property access (bracket notation with non-literal key). Use direct property names.',
  [STK1007]: 'Unsafe aliasing: the destination for "{fn}" may overlap an input argument. The compiler will insert a temporary copy. Consider rewriting to avoid aliased in-place mutation.',
  [STK1008]: 'Partial initialization: stack value "{name}" is not fully initialized before it is observed. All fields ({fields}) must be written before the value is read or escapes.',
  [STK1009]: 'Unsupported spread: stack values cannot be created or consumed via object spread. Use stack.make() with an explicit literal.',
  [STK1010]: 'Unsupported operation: {op} is not supported on stack values. Stack values do not have identity, prototype, or reflection semantics.',
  [STK1011]: 'Collection storage: stack value "{name}" cannot be stored in an array or collection in v1. Materialize it first, or use a typed array layout.',
  [STK1012]: 'Missing fields: stack.make<{type}>() is missing fields: {fields}. All fields must be provided.',
  [STK1013]: 'Extra fields: stack.make<{type}>() has unexpected fields: {fields}. Only declared fields are allowed.',
  [STK1014]: 'Non-literal argument: stack.make<{type}>() requires an object literal argument. Computed or variable arguments cannot be statically analyzed.',

  [STK2001]: 'Implicit materialization: stack value "{name}" is being implicitly materialized at a boundary. In strict mode this would be an error. Add explicit stack.materialize() to silence.',
  [STK2002]: 'Alias safety unknown: cannot prove that the destination of "{fn}" does not overlap its inputs. Inserting a temporary copy for safety.',
  [STK2003]: 'Performance advisory: {detail}',

  [STK3001]: 'Internal error: unexpected AST shape at {location}. This is a compiler bug — please report it.',
  [STK3002]: 'Internal error: layout cache miss for type "{type}". This is a compiler bug — please report it.',
  [STK3003]: 'Internal error: lowering invariant violated: {detail}. This is a compiler bug — please report it.',
}

// ---------------------------------------------------------------------------
// Diagnostic catalog (machine-readable)
// ---------------------------------------------------------------------------

export interface DiagnosticCatalogEntry {
  code: string
  severity: DiagnosticSeverity
  messageTemplate: string
}

export const DIAGNOSTIC_CATALOG: DiagnosticCatalogEntry[] = Object.entries(MESSAGES).map(
  ([code, messageTemplate]) => ({
    code,
    severity: code.startsWith('STK1')
      ? DiagnosticSeverity.Error
      : code.startsWith('STK2')
        ? DiagnosticSeverity.Warning
        : DiagnosticSeverity.Internal,
    messageTemplate,
  }),
)

// ---------------------------------------------------------------------------
// Diagnostic creation helpers
// ---------------------------------------------------------------------------

export function createDiagnostic(
  code: string,
  span: SourceSpan,
  params: Record<string, string> = {},
  fix?: string,
): Diagnostic {
  const template = MESSAGES[code]
  if (!template) {
    return {
      code: STK3001,
      severity: DiagnosticSeverity.Internal,
      message: `Unknown diagnostic code: ${code}`,
      span,
    }
  }

  const message = template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `<${key}>`)

  const severity = code.startsWith('STK1')
    ? DiagnosticSeverity.Error
    : code.startsWith('STK2')
      ? DiagnosticSeverity.Warning
      : DiagnosticSeverity.Internal

  return { code, severity, message, span, fix }
}

export function spanFromNode(
  node: { getStart(): number; getEnd(): number; getSourceFile(): { fileName: string } },
): SourceSpan {
  return {
    file: node.getSourceFile().fileName,
    start: node.getStart(),
    end: node.getEnd(),
  }
}
