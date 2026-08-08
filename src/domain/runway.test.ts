import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { addDays } from './day.ts'
import { computeRunway } from './runway.ts'
import type { RunwayInput } from './runway.ts'

function base(overrides: Partial<RunwayInput> = {}): RunwayInput {
  return {
    today: '2025-06-15',
    startedAt: '2025-06-15',
    dailySpendMap: {},
    seedDailySpend: 50_000,
    spendableBalance: 500_000,
    dailyCommitmentCost: 0,
    ...overrides,
  }
}

describe('computeRunway — cold start', () => {
  it('zero days of data → pure seed, marked estimated, result is not NaN', () => {
    const r = computeRunway(base())
    expect(r).not.toBeNull()
    expect(r!.estimated).toBe(true)
    expect(Number.isNaN(r!.days)).toBe(false)
    // dailyAverage = pure seed (w=0) → runway = floor(spendableBalance / seed)
    expect(r!.days).toBe(Math.floor(500_000 / 50_000))
  })

  it('day 7: a mix of seed and actual (w = 0.5)', () => {
    const today = '2025-06-22' // startedAt + 7
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    // 7 days before today, each spending 100,000 → actualAverage 100,000
    for (let i = 1; i <= 7; i++) map[addDays(today, -i)] = 100_000
    const r = computeRunway(base({ today, startedAt, dailySpendMap: map, seedDailySpend: 50_000 }))
    expect(r!.estimated).toBe(true)
    // dailyAverage = 0.5*100,000 + 0.5*50,000 = 75,000
    expect(r!.days).toBe(Math.floor(500_000 / 75_000))
  })

  it('day 14: seed weighted to zero (w = 1)', () => {
    const today = '2025-06-29' // startedAt + 14
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    for (let i = 1; i <= 14; i++) map[addDays(today, -i)] = 20_000
    const r = computeRunway(base({ today, startedAt, dailySpendMap: map, seedDailySpend: 999_999 }))
    expect(r!.estimated).toBe(false)
    expect(r!.days).toBe(Math.floor(500_000 / 20_000))
  })

  it('day 15: still seed weighted to zero (w stays 1, N stays clamped at 28)', () => {
    const today = '2025-06-30' // startedAt + 15
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    for (let i = 1; i <= 15; i++) map[addDays(today, -i)] = 20_000
    const r = computeRunway(base({ today, startedAt, dailySpendMap: map, seedDailySpend: 999_999 }))
    expect(r!.estimated).toBe(false)
    expect(r!.days).toBe(Math.floor(500_000 / 20_000))
  })
})

describe('computeRunway — thin-data guards', () => {
  it('zero spending and zero commitments → null, not Infinity', () => {
    const r = computeRunway(base({ seedDailySpend: 0, dailySpendMap: {}, dailyCommitmentCost: 0 }))
    expect(r).toBeNull()
  })

  it('a day with no spending counts as 0, not skipped (which would dilute the average)', () => {
    const today = '2025-06-20' // startedAt + 5, N = 5
    const startedAt = '2025-06-15'
    // Only one of five days has an entry — the rest must count as 0.
    const map: Record<string, number> = { [addDays(today, -1)]: 500_000 }
    const r = computeRunway(base({ today, startedAt, dailySpendMap: map, seedDailySpend: 0 }))
    // actualAverage = 500,000 / 5 = 100,000 (not 500,000 / 1)
    // w = 5/14, dailyAverage = (5/14)*100,000 + (9/14)*0
    const expectedDailyAverage = (5 / 14) * 100_000
    expect(r!.days).toBe(Math.floor(500_000 / expectedDailyAverage))
  })
})

describe('computeRunway — the average window excludes today', () => {
  it('runway does not change when a transaction is saved today', () => {
    const today = '2025-06-25'
    const startedAt = '2025-06-01'
    const mapWithoutToday: Record<string, number> = {
      [addDays(today, -1)]: 30_000,
      [addDays(today, -2)]: 20_000,
    }
    const before = computeRunway(
      base({ today, startedAt, dailySpendMap: mapWithoutToday, seedDailySpend: 0 }),
    )
    const mapWithToday = { ...mapWithoutToday, [today]: 9_999_999 }
    const after = computeRunway(
      base({ today, startedAt, dailySpendMap: mapWithToday, seedDailySpend: 0 }),
    )
    expect(after).toEqual(before)
  })
})
