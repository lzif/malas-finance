import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { addDays, clampDay, dayKeyOf, dayRange, daysBetween, daysInMonth } from './day.ts'

describe('daysBetween', () => {
  it('daysBetween(x, x) === 0 — locked in because every cycle formula depends on it', () => {
    expect(daysBetween('2025-06-15', '2025-06-15')).toBe(0)
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('positive when a is after b, negative when a is before b', () => {
    expect(daysBetween('2025-06-20', '2025-06-15')).toBe(5)
    expect(daysBetween('2025-06-15', '2025-06-20')).toBe(-5)
  })

  it('consistent across month and year boundaries', () => {
    expect(daysBetween('2025-02-01', '2025-01-31')).toBe(1)
    expect(daysBetween('2026-01-01', '2025-12-31')).toBe(1)
  })
})

/**
 * A WIB (UTC+7) wall-clock time as epoch ms. These tests used to build their
 * instants with `new Date(y, m, d, ...)`, which resolves against whatever
 * timezone the test process runs in — so they asserted nothing about the zone
 * and passed under UTC while production was silently off by a day. Every
 * instant here is pinned to an absolute moment instead.
 */
function wib(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour - 7, minute)
}

describe('dayKeyOf', () => {
  it("dayStartHour = 3: a transaction at 01:30 falls into yesterday's dayKey", () => {
    expect(dayKeyOf(wib(2025, 6, 15, 1, 30), 3)).toBe('2025-06-14')
  })

  it("dayStartHour = 3: a transaction at 03:30 falls into today's dayKey", () => {
    expect(dayKeyOf(wib(2025, 6, 15, 3, 30), 3)).toBe('2025-06-15')
  })

  it('dayStartHour = 0 (default): midnight immediately starts a new day', () => {
    expect(dayKeyOf(wib(2025, 6, 15, 0, 5), 0)).toBe('2025-06-15')
  })

  it("uses the user's zone, not the process's — 17:45 UTC is already tomorrow in WIB", () => {
    // The regression that shipped: under a UTC process this returned
    // '2026-08-09', filing the expense against a day whose allowance was
    // already spent. Asserted as a raw UTC instant so the test fails if
    // dayKeyOf ever goes back to reading process-local time.
    expect(dayKeyOf(Date.UTC(2026, 7, 9, 17, 45), 0)).toBe('2026-08-10')
  })

  it('is independent of the process timezone', () => {
    // Same instant, same answer, whatever TZ the suite runs under.
    const at = Date.UTC(2026, 7, 9, 17, 45)
    expect(dayKeyOf(at, 0, 'Asia/Jakarta')).toBe('2026-08-10')
    expect(dayKeyOf(at, 0, 'UTC')).toBe('2026-08-09')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('goes backward across the start of a month', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28')
  })
})

describe('daysInMonth / clampDay', () => {
  it('February has 29 days in a leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(clampDay(31, 2024, 2)).toBe(29)
  })

  it('February has 28 days in a common year', () => {
    expect(daysInMonth(2025, 2)).toBe(28)
    expect(clampDay(31, 2025, 2)).toBe(28)
    expect(clampDay(30, 2025, 2)).toBe(28)
  })
})

describe('dayRange', () => {
  it('is inclusive of both ends', () => {
    expect(dayRange('2025-06-01', '2025-06-03')).toEqual([
      '2025-06-01',
      '2025-06-02',
      '2025-06-03',
    ])
  })

  it('is a single day when start === end', () => {
    expect(dayRange('2025-06-01', '2025-06-01')).toEqual(['2025-06-01'])
  })
})
