import { describe, expect, it } from 'vitest'
import { addDays } from './day'
import { computeWeekComparison } from './weekComparison'

const TODAY = '2026-07-15'

describe('computeWeekComparison — thin-data guard', () => {
  it('daysSinceStart < 7 → null (hidden entirely, spec §4.7)', () => {
    expect(computeWeekComparison({}, TODAY, 6)).toBeNull()
  })

  it('daysSinceStart === 7 → this week only, no preceding week, percentChange null', () => {
    const r = computeWeekComparison({}, TODAY, 7)
    expect(r).not.toBeNull()
    expect(r!.weeksUsed).toBe(0)
    expect(r!.average4Weeks).toBe(0)
    expect(r!.percentChange).toBeNull()
  })
})

describe('computeWeekComparison — thisWeekTotal', () => {
  it('sums the 7 days ending today, inclusive of today', () => {
    const map: Record<string, number> = {}
    for (let i = 0; i <= 6; i++) map[addDays(TODAY, -i)] = 10_000
    // A day just outside the 7-day window must not be counted.
    map[addDays(TODAY, -7)] = 999_999
    const r = computeWeekComparison(map, TODAY, 30)
    expect(r!.thisWeekTotal).toBe(70_000)
  })
})

describe('computeWeekComparison — preceding weeks', () => {
  it('uses exactly 1 preceding week at daysSinceStart = 13', () => {
    const r = computeWeekComparison({}, TODAY, 13)
    expect(r!.weeksUsed).toBe(1)
  })

  it('does not yet use a 2nd preceding week at daysSinceStart = 19', () => {
    const r = computeWeekComparison({}, TODAY, 19)
    expect(r!.weeksUsed).toBe(1)
  })

  it('uses a 2nd preceding week at daysSinceStart = 20', () => {
    const r = computeWeekComparison({}, TODAY, 20)
    expect(r!.weeksUsed).toBe(2)
  })

  it('caps at 4 preceding weeks however long the history', () => {
    const r = computeWeekComparison({}, TODAY, 365)
    expect(r!.weeksUsed).toBe(4)
  })

  it('computes percentChange = (thisWeekTotal − average4Weeks) / average4Weeks', () => {
    const map: Record<string, number> = {}
    // This week: 140,000 total (7 days × 20,000)
    for (let i = 0; i <= 6; i++) map[addDays(TODAY, -i)] = 20_000
    // Preceding week 1 (days −7..−13): 70,000 total (7 days × 10,000)
    for (let i = 7; i <= 13; i++) map[addDays(TODAY, -i)] = 10_000
    const r = computeWeekComparison(map, TODAY, 13)
    expect(r!.weeksUsed).toBe(1)
    expect(r!.thisWeekTotal).toBe(140_000)
    expect(r!.average4Weeks).toBe(70_000)
    expect(r!.percentChange).toBeCloseTo(1) // 100% more
  })

  it('a day with no recorded spend counts as 0, not skipped', () => {
    const map: Record<string, number> = { [addDays(TODAY, -1)]: 100_000 }
    const r = computeWeekComparison(map, TODAY, 30)
    expect(r!.thisWeekTotal).toBe(100_000)
  })
})
