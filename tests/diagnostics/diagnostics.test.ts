/**
 * Diagnostic snapshot tests: verify each STK error code produces
 * the correct code, message, span, and fix recommendation.
 */

import { describe, it, expect } from 'vitest'
import {
  createDiagnostic,
  DiagnosticSeverity,
  DIAGNOSTIC_CATALOG,
  STK1001, STK1002, STK1003, STK1004, STK1005,
  STK1006, STK1007, STK1008, STK1009, STK1010,
  STK1011, STK1012, STK1013, STK1014,
  STK2001, STK2002, STK2003,
  STK3001, STK3002, STK3003,
} from '../../packages/compiler/src/diagnostics.js'

const testSpan = { file: 'test.ts', start: 0, end: 10 }

describe('Diagnostics', () => {
  describe('createDiagnostic', () => {
    it('creates STK1001 with field and type params', () => {
      const d = createDiagnostic(STK1001, testSpan, {
        field: 'name',
        type: 'Person',
      })
      expect(d.code).toBe('STK1001')
      expect(d.severity).toBe(DiagnosticSeverity.Error)
      expect(d.message).toContain('name')
      expect(d.message).toContain('Person')
      expect(d.message).toContain('number')
    })

    it('creates STK1003 with name and callee params', () => {
      const d = createDiagnostic(STK1003, testSpan, {
        name: 'pos',
        callee: 'console.log',
      })
      expect(d.code).toBe('STK1003')
      expect(d.severity).toBe(DiagnosticSeverity.Error)
      expect(d.message).toContain('pos')
      expect(d.message).toContain('console.log')
      expect(d.message).toContain('materialize')
    })

    it('creates STK1004 closure capture diagnostic', () => {
      const d = createDiagnostic(STK1004, testSpan, { name: 'vel' })
      expect(d.code).toBe('STK1004')
      expect(d.message).toContain('vel')
      expect(d.message).toContain('closure')
    })

    it('creates STK1005 suspension crossing diagnostic', () => {
      const d = createDiagnostic(STK1005, testSpan, { name: 'pos' })
      expect(d.code).toBe('STK1005')
      expect(d.message).toContain('await')
      expect(d.message).toContain('yield')
    })

    it('creates STK1008 partial initialization diagnostic', () => {
      const d = createDiagnostic(STK1008, testSpan, {
        name: 'v',
        fields: 'x, y, z',
      })
      expect(d.code).toBe('STK1008')
      expect(d.message).toContain('v')
      expect(d.message).toContain('x, y, z')
    })

    it('creates STK1012 missing fields diagnostic', () => {
      const d = createDiagnostic(STK1012, testSpan, {
        type: 'Vec3',
        fields: 'z',
      })
      expect(d.code).toBe('STK1012')
      expect(d.message).toContain('Vec3')
      expect(d.message).toContain('z')
    })

    it('creates STK2001 migration warning', () => {
      const d = createDiagnostic(STK2001, testSpan, { name: 'pos' })
      expect(d.code).toBe('STK2001')
      expect(d.severity).toBe(DiagnosticSeverity.Warning)
    })

    it('creates STK3001 internal error', () => {
      const d = createDiagnostic(STK3001, testSpan, { location: 'visitNode' })
      expect(d.code).toBe('STK3001')
      expect(d.severity).toBe(DiagnosticSeverity.Internal)
      expect(d.message).toContain('compiler bug')
    })

    it('includes fix when provided', () => {
      const d = createDiagnostic(STK1001, testSpan, {
        field: 'name',
        type: 'Person',
      }, 'Change "name" to type number.')
      expect(d.fix).toBe('Change "name" to type number.')
    })

    it('handles unknown diagnostic code gracefully', () => {
      const d = createDiagnostic('STK9999', testSpan)
      expect(d.code).toBe('STK3001')
      expect(d.message).toContain('Unknown diagnostic code')
    })
  })

  describe('severity classification', () => {
    it('STK1xxx are errors', () => {
      for (const code of [STK1001, STK1002, STK1003, STK1004, STK1005,
        STK1006, STK1007, STK1008, STK1009, STK1010, STK1011,
        STK1012, STK1013, STK1014]) {
        const d = createDiagnostic(code, testSpan, {
          field: 'x', type: 'T', name: 'v', callee: 'f',
          reason: 'test', op: 'typeof', fields: 'x', detail: 'test',
          location: 'test',
        })
        expect(d.severity).toBe(DiagnosticSeverity.Error)
      }
    })

    it('STK2xxx are warnings', () => {
      for (const code of [STK2001, STK2002, STK2003]) {
        const d = createDiagnostic(code, testSpan, {
          name: 'v', fn: 'f', detail: 'test',
        })
        expect(d.severity).toBe(DiagnosticSeverity.Warning)
      }
    })

    it('STK3xxx are internal', () => {
      for (const code of [STK3001, STK3002, STK3003]) {
        const d = createDiagnostic(code, testSpan, {
          location: 'test', type: 'T', detail: 'test',
        })
        expect(d.severity).toBe(DiagnosticSeverity.Internal)
      }
    })
  })

  describe('DIAGNOSTIC_CATALOG', () => {
    it('contains all defined codes', () => {
      const codes = DIAGNOSTIC_CATALOG.map(e => e.code)
      expect(codes).toContain('STK1001')
      expect(codes).toContain('STK1014')
      expect(codes).toContain('STK2001')
      expect(codes).toContain('STK3001')
    })

    it('has consistent severities', () => {
      for (const entry of DIAGNOSTIC_CATALOG) {
        if (entry.code.startsWith('STK1')) {
          expect(entry.severity).toBe(DiagnosticSeverity.Error)
        } else if (entry.code.startsWith('STK2')) {
          expect(entry.severity).toBe(DiagnosticSeverity.Warning)
        } else if (entry.code.startsWith('STK3')) {
          expect(entry.severity).toBe(DiagnosticSeverity.Internal)
        }
      }
    })

    it('all entries have non-empty message templates', () => {
      for (const entry of DIAGNOSTIC_CATALOG) {
        expect(entry.messageTemplate.length).toBeGreaterThan(0)
      }
    })
  })
})
