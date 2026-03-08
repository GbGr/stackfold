/**
 * @stackfold/runtime — Arena-backed scratch memory for stack value lowering.
 *
 * The runtime provides a reusable Float64Array arena with mark/reset
 * semantics. Generated code uses this to store temporaries and
 * destination-passing results without heap allocation.
 */

export interface StackRuntimeOptions {
  /** Initial capacity in Float64 words. Default: 4096 */
  initialWords?: number
  /** Enable debug mode: poison released slots on reset. Default: false */
  debug?: boolean
}

/**
 * Reusable scratch arena backed by a Float64Array.
 *
 * Every transformed region that allocates temporaries captures a mark
 * and resets it on all exit paths (including exceptional exits via
 * try/finally). The arena supports recursive and nested calls by
 * advancing the stack pointer rather than reusing a single global slot.
 */
export class StackRuntime {
  /** The backing typed array. */
  mem: Float64Array
  /** Current stack pointer (in Float64 words). */
  sp: number

  private readonly _debug: boolean
  private _capacity: number

  constructor(options?: StackRuntimeOptions) {
    const initialWords = options?.initialWords ?? 4096
    this._debug = options?.debug ?? false
    this._capacity = initialWords
    this.mem = new Float64Array(initialWords)
    this.sp = 0
  }

  /**
   * Captures the current stack pointer for later reset.
   * Must be paired with a corresponding `reset()` call.
   */
  mark(): number {
    return this.sp
  }

  /**
   * Resets the stack pointer to a previously captured mark.
   * In debug mode, poisons released slots with NaN to catch misuse.
   */
  reset(mark: number): void {
    if (this._debug) {
      for (let i = mark; i < this.sp; i++) {
        this.mem[i] = NaN
      }
    }
    this.sp = mark
  }

  /**
   * Allocates `words` contiguous Float64 slots and returns the
   * start offset. Grows the arena if necessary.
   *
   * @returns The offset (in words) of the first allocated slot.
   */
  alloc(words: number): number {
    const offset = this.sp
    const newSp = this.sp + words
    if (newSp > this._capacity) {
      this._grow(newSp)
    }
    this.sp = newSp
    return offset
  }

  /**
   * Reads a single Float64 value from the arena.
   * @param offset Base offset of the struct slot.
   * @param fieldIndex Zero-based field index within the struct.
   */
  read(offset: number, fieldIndex: number): number {
    return this.mem[offset + fieldIndex]
  }

  /**
   * Writes a single Float64 value into the arena.
   * @param offset Base offset of the struct slot.
   * @param fieldIndex Zero-based field index within the struct.
   * @param value The value to write.
   */
  write(offset: number, fieldIndex: number, value: number): void {
    this.mem[offset + fieldIndex] = value
  }

  /**
   * Copies `words` values from one arena region to another.
   * Handles overlapping regions correctly.
   */
  copy(srcOffset: number, dstOffset: number, words: number): void {
    if (srcOffset === dstOffset) return
    this.mem.copyWithin(dstOffset, srcOffset, srcOffset + words)
  }

  /**
   * Grows the arena to at least `minCapacity` words.
   * Preserves all live data. Uses a 2x growth strategy.
   */
  private _grow(minCapacity: number): void {
    let newCapacity = this._capacity
    while (newCapacity < minCapacity) {
      newCapacity *= 2
    }
    const newMem = new Float64Array(newCapacity)
    newMem.set(this.mem)
    this.mem = newMem
    this._capacity = newCapacity
  }
}
