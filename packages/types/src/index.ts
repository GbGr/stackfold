/**
 * @stackfold/types — Compile-time marker types for stack value structs.
 *
 * These types are erased by the stackfold compiler. They exist only to
 * guide the compiler's analysis and lowering passes.
 */

/**
 * A unique symbol used to brand stack value types so they are
 * structurally incompatible with plain objects at the type level.
 */
declare const __stack_brand: unique symbol

/**
 * Marks a flat numeric struct for stack-value lowering.
 *
 * All properties of `T` must be `number`. Nested objects, arrays,
 * optional properties, and computed keys are rejected by the compiler.
 *
 * @example
 * ```ts
 * type Vec3 = Stack<{ x: number; y: number; z: number }>
 * ```
 */
export type Stack<T extends Record<string, number>> = T & {
  readonly [__stack_brand]: T
}

/**
 * Compiler intrinsics for creating and converting stack values.
 *
 * Every function in this namespace is replaced by the stackfold compiler
 * during lowering. Calling them at runtime without compilation is an error.
 */
export declare namespace stack {
  /**
   * Creates a stack value from a full object literal whose keys
   * exactly match the struct layout.
   */
  function make<T extends Record<string, number>>(init: T): Stack<T>

  /**
   * Creates a zero-initialized stack value.
   */
  function zero<T extends Record<string, number>>(): Stack<T>

  /**
   * Explicitly converts a stack value into a normal JavaScript object.
   * This is the only approved escape hatch in strict mode.
   */
  function materialize<T extends Record<string, number>>(value: Stack<T>): T
}
