/**
 * @stackfold/compiler — Core analysis and lowering engine.
 *
 * Public API for the stackfold compiler. All other packages
 * (CLI, Vite plugin, tsserver plugin) delegate to this core.
 */

// Diagnostics
export {
  type Diagnostic,
  type SourceSpan,
  type DiagnosticCatalogEntry,
  DiagnosticSeverity,
  DIAGNOSTIC_CATALOG,
  createDiagnostic,
  spanFromNode,
  STK1001, STK1002, STK1003, STK1004, STK1005, STK1006,
  STK1007, STK1008, STK1009, STK1010, STK1011, STK1012,
  STK1013, STK1014,
  STK2001, STK2002, STK2003,
  STK3001, STK3002, STK3003,
} from './diagnostics.js'

// Layout engine
export {
  LayoutEngine,
  type LayoutField,
  type StructLayout,
} from './layout.js'

// Eligibility
export {
  checkEligibility,
  type EligibilityResult,
} from './eligibility.js'

// Escape analysis
export {
  analyzeEscapes,
  type EscapeInfo,
  type TransformedFunctionSet,
} from './escape-analysis.js'

// Alias analysis
export {
  analyzeAliasing,
  needsTemporaryCopy,
  AliasSafety,
  type AliasAnalysisResult,
} from './alias-analysis.js'

// Lowering
export {
  lowerStackMake, lowerStackZero,
  lowerPropertyRead, lowerPropertyWrite,
  lowerMaterialize, lowerStructAssignment,
  type LocalLoweringContext,
  generateFlattenedParams, generateFlattenedArgs,
  generateDPSWrite, generateDPSRead,
  type LoweredParam, type FunctionABI, type CodegenContext,
  generateArenaScope, generateTempAlloc,
  canForwardReturn, generateSlotCopy,
  type TempAllocation,
  generatePublicWrapper,
} from './lowering/index.js'

// Transformer
export {
  createStackTransformerFactory,
  transformSource,
  checkSource,
  type TransformResult,
  type TransformerOptions,
} from './transformer.js'

// Config
export {
  loadConfig,
  mergeConfig,
  getDefaultConfig,
  type StackConfig,
  type CompilationMode,
  type ArenaConfig,
  type DebugConfig,
  type DiagnosticsConfig,
} from './config.js'
