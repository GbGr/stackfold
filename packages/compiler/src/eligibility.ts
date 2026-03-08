/**
 * Eligibility checker: validates that Stack<T> type arguments contain
 * only flat numeric fields. Rejects optional properties, computed keys,
 * methods, nested objects, arrays, and unions with non-number fields.
 */

import type ts from 'typescript'
import {
  type Diagnostic,
  type SourceSpan,
  STK1001,
  STK1002,
  createDiagnostic,
} from './diagnostics.js'

export interface EligibilityResult {
  eligible: boolean
  diagnostics: Diagnostic[]
}

/**
 * Checks whether a type (the T in Stack<T>) is eligible for stack-value lowering.
 */
export function checkEligibility(
  innerType: ts.Type,
  typeName: string,
  span: SourceSpan,
  checker: ts.TypeChecker,
  typescript: typeof ts,
): EligibilityResult {
  const diagnostics: Diagnostic[] = []
  const properties = innerType.getProperties()

  if (properties.length === 0) {
    diagnostics.push(
      createDiagnostic(STK1001, span, {
        field: '(none)',
        type: typeName,
      }, 'Add at least one numeric field to the struct type.'),
    )
    return { eligible: false, diagnostics }
  }

  for (const prop of properties) {
    // Skip brand symbol
    if (prop.name === '__stack_brand') continue

    const decls = prop.getDeclarations()
    if (!decls || decls.length === 0) continue

    const decl = decls[0]

    // Check for optional properties
    if (typescript.isPropertySignature(decl) && decl.questionToken) {
      diagnostics.push(
        createDiagnostic(STK1002, span, {
          field: prop.name,
          type: typeName,
          reason: 'optional (has a ? modifier)',
        }, `Remove the ? from property "${prop.name}" — all stack value fields must be required.`),
      )
      continue
    }

    // Check for methods
    if (typescript.isMethodSignature(decl) || typescript.isMethodDeclaration(decl)) {
      diagnostics.push(
        createDiagnostic(STK1002, span, {
          field: prop.name,
          type: typeName,
          reason: 'a method',
        }, `Remove method "${prop.name}" — stack values can only contain number fields.`),
      )
      continue
    }

    // Check for computed property names
    if (
      typescript.isPropertySignature(decl) &&
      decl.name &&
      typescript.isComputedPropertyName(decl.name)
    ) {
      diagnostics.push(
        createDiagnostic(STK1002, span, {
          field: prop.name,
          type: typeName,
          reason: 'a computed property name',
        }, 'Use a plain string property name instead of a computed one.'),
      )
      continue
    }

    // Check that the property type is `number`
    const propType = checker.getTypeOfSymbol(prop)
    if (!isNumberType(propType, typescript)) {
      const typeStr = checker.typeToString(propType)
      diagnostics.push(
        createDiagnostic(STK1001, span, {
          field: prop.name,
          type: typeName,
        }, `Change "${prop.name}" from ${typeStr} to number.`),
      )
    }
  }

  return {
    eligible: diagnostics.length === 0,
    diagnostics,
  }
}

function isNumberType(type: ts.Type, typescript: typeof ts): boolean {
  // Check for the number primitive
  if (type.flags & typescript.TypeFlags.Number) return true
  if (type.flags & typescript.TypeFlags.NumberLiteral) return true
  return false
}
