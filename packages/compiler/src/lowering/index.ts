/**
 * Lowering orchestration: coordinates the various lowering passes
 * (locals, functions, returns, boundary) into a coherent transformation.
 */

export { lowerStackMake, lowerStackZero, lowerPropertyRead, lowerPropertyWrite, lowerMaterialize, lowerStructAssignment } from './locals.js'
export type { LocalLoweringContext } from './locals.js'

export { generateFlattenedParams, generateFlattenedArgs, generateDPSWrite, generateDPSRead } from './functions.js'
export type { LoweredParam, FunctionABI, CodegenContext } from './functions.js'

export { generateArenaScope, generateTempAlloc, canForwardReturn, generateSlotCopy } from './returns.js'
export type { TempAllocation } from './returns.js'

export { generatePublicWrapper } from './boundary.js'
