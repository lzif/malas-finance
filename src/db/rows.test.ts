import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { toIso, toIsoOrNull } from './rows.ts'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('toIso', () => {
  it('converts a Date (what postgres.js returns for timestamptz) to ISO 8601', () => {
    const out = toIso(new Date(Date.UTC(2026, 7, 10, 12, 0, 0)))
    expect(out).toBe('2026-08-10T12:00:00.000Z')
    expect(out).toMatch(ISO)
  })

  it('normalizes an already-ISO string through Date, output is canonical', () => {
    expect(toIso('2026-08-10T12:00:00.000Z')).toBe('2026-08-10T12:00:00.000Z')
  })

  it('normalizes a Postgres-format timestamp string to ISO', () => {
    // Belt-and-braces: postgres.js hands back Dates, but a string must not
    // slip through as-is and become driver-dependent text again.
    expect(toIso('2026-08-10 12:00:00+00')).toMatch(ISO)
  })

  it('falls back to the raw string rather than throwing on an unparseable value', () => {
    expect(toIso('not a date')).toBe('not a date')
  })
})

describe('toIsoOrNull', () => {
  it('keeps null null (e.g. an undeleted row deleted_at)', () => {
    expect(toIsoOrNull(null)).toBeNull()
    expect(toIsoOrNull(undefined)).toBeNull()
  })

  it('converts a present value like toIso', () => {
    expect(toIsoOrNull(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe('2026-01-01T00:00:00.000Z')
  })
})
