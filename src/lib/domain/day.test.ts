import { describe, expect, it } from 'vitest'
import { addDays, clampDay, daysInMonth, dayKeyOf, dayRange, daysBetween, weekdayOf } from './day'

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

describe('dayKeyOf', () => {
  it('dayStartHour = 3: a transaction at 01:30 falls into yesterday\'s dayKey', () => {
    const at = new Date(2025, 5, 15, 1, 30, 0).getTime() // June 15, 2025, 01:30 local
    expect(dayKeyOf(at, 3)).toBe('2025-06-14')
  })

  it('dayStartHour = 3: a transaction at 03:30 falls into today\'s dayKey', () => {
    const at = new Date(2025, 5, 15, 3, 30, 0).getTime()
    expect(dayKeyOf(at, 3)).toBe('2025-06-15')
  })

  it('dayStartHour = 0 (default): midnight immediately starts a new day', () => {
    const at = new Date(2025, 5, 15, 0, 5, 0).getTime()
    expect(dayKeyOf(at, 0)).toBe('2025-06-15')
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

describe('weekdayOf', () => {
  it('matches JS getDay() convention: 0 = Sunday .. 6 = Saturday', () => {
    expect(weekdayOf('2026-07-19')).toBe(0) // a Sunday
    expect(weekdayOf('2026-07-18')).toBe(6) // a Saturday
    expect(weekdayOf('2026-07-15')).toBe(3) // a Wednesday
  })
})

describe('dayRange', () => {
  it('is inclusive of both ends', () => {
    expect(dayRange('2025-06-01', '2025-06-03')).toEqual([
      '2025-06-01',
      '2025-06-02',
      '2025-06-03'
    ])
  })

  it('is a single day when start === end', () => {
    expect(dayRange('2025-06-01', '2025-06-01')).toEqual(['2025-06-01'])
  })
})
