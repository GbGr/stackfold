/**
 * Layout engine: discovers Stack<T> type definitions, extracts field
 * names and source order, computes StructLayout for lowering.
 */

import type ts from 'typescript'

export interface LayoutField {
  /** Property name as declared in the type literal. */
  name: string
  /** Zero-based index in source order. Determines ABI field position. */
  index: number
}

export interface StructLayout {
  /** Human-readable type name (e.g. "Vec3"). */
  typeName: string
  /** Fields in source order. */
  fields: LayoutField[]
  /** Total Float64 word count (= fields.length for flat numeric structs). */
  wordCount: number
}

/**
 * Manages layout extraction and caching for Stack<T> types.
 */
export class LayoutEngine {
  private readonly _cache = new Map<number, StructLayout>()
  private readonly _checker: ts.TypeChecker
  private readonly _ts: typeof ts

  constructor(checker: ts.TypeChecker, typescript: typeof ts) {
    this._checker = checker
    this._ts = typescript
  }

  /**
   * Attempts to extract a StructLayout from a type that should be Stack<T>.
   * Returns null if the type is not a recognized Stack<T> alias.
   */
  getLayout(type: ts.Type): StructLayout | null {
    // Check cache by type id
    const id = (type as { id?: number }).id
    if (id !== undefined && this._cache.has(id)) {
      return this._cache.get(id)!
    }

    const layout = this._extractLayout(type)
    if (layout && id !== undefined) {
      this._cache.set(id, layout)
    }
    return layout
  }

  /**
   * Extracts layout from a type known to be the inner T of Stack<T>.
   */
  getLayoutFromInner(innerType: ts.Type, typeName: string): StructLayout | null {
    const id = (innerType as { id?: number }).id
    if (id !== undefined && this._cache.has(id)) {
      return this._cache.get(id)!
    }

    const layout = this._buildLayout(innerType, typeName)
    if (layout && id !== undefined) {
      this._cache.set(id, layout)
    }
    return layout
  }

  /**
   * Check whether a type reference is Stack<T>.
   */
  isStackType(type: ts.Type): boolean {
    return this._resolveStackInner(type) !== null
  }

  /**
   * Resolves the inner T type from Stack<T>.
   */
  resolveStackInner(type: ts.Type): ts.Type | null {
    return this._resolveStackInner(type)
  }

  private _extractLayout(type: ts.Type): StructLayout | null {
    // Try to resolve as Stack<T> (which is T & { __stack_brand: T })
    const inner = this._resolveStackInner(type)
    if (!inner) return null

    const typeName = this._checker.typeToString(type)
    return this._buildLayout(inner, typeName)
  }

  private _isBrandProperty(prop: ts.Symbol): boolean {
    // __stack_brand is a unique symbol, so TypeScript stores it with an
    // escaped name like "__@___stack_brand@12", not the plain string.
    return prop.name.includes('__stack_brand')
  }

  private _hasBrandProperty(type: ts.Type): boolean {
    return type.getProperties().some(p => this._isBrandProperty(p))
  }

  private _resolveStackInner(type: ts.Type): ts.Type | null {
    const ts = this._ts

    // Stack<T> is a type alias. Check if the type has an alias symbol named "Stack"
    // or if it's an intersection with a __stack_brand property.
    if (type.isIntersection()) {
      // Stack<T> = T & { readonly [__stack_brand]: T }
      // Check for __stack_brand in the intersection members
      if (this._hasBrandProperty(type)) {
        // The first type in the intersection should be T
        for (const member of type.types) {
          if (!this._hasBrandProperty(member)) {
            return member
          }
        }
      }
    }

    // Check alias: type Vec3 = Stack<{ ... }>
    const aliasSymbol = type.aliasSymbol
    if (aliasSymbol?.name === 'Stack') {
      const typeArgs = type.aliasTypeArguments
      if (typeArgs && typeArgs.length === 1) {
        return typeArgs[0]
      }
    }

    // Check if the type itself has __stack_brand (resolved alias)
    if (this._hasBrandProperty(type)) {
      // Get properties excluding __stack_brand
      const props = type.getProperties().filter(p => !this._isBrandProperty(p))
      if (props.length > 0) {
        // The type itself is the layout carrier
        return type
      }
    }

    return null
  }

  private _buildLayout(innerType: ts.Type, typeName: string): StructLayout | null {
    const properties = innerType.getProperties()
    if (properties.length === 0) return null

    const fields: LayoutField[] = []
    for (let i = 0; i < properties.length; i++) {
      const prop = properties[i]
      // Skip the brand property (unique symbol: escaped as __@___stack_brand@<id>)
      if (this._isBrandProperty(prop)) continue
      fields.push({ name: prop.name, index: fields.length })
    }

    if (fields.length === 0) return null

    return {
      typeName,
      fields,
      wordCount: fields.length,
    }
  }

  /** Returns a mangled field name for a struct local variable. */
  static fieldLocalName(varName: string, fieldName: string): string {
    return `${varName}_${fieldName}`
  }

  /** Returns all field local names for a struct local variable. */
  static fieldLocalNames(varName: string, layout: StructLayout): string[] {
    return layout.fields.map(f => LayoutEngine.fieldLocalName(varName, f.name))
  }

  /** Returns the mangled function name for a stack-transformed function. */
  static mangledFunctionName(originalName: string): string {
    return `__stk_${originalName}`
  }
}
