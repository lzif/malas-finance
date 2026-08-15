import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { computeStats } from './stats.ts'
import type { StatsTransaction } from './stats.ts'

const CASH = 'w-cash'
const SAVE = 'w-save'

function out(amount: number, dayKey: string, extra: Partial<StatsTransaction> = {}) {
  return {
    kind: 'out' as const,
    amount,
    intent: 'impulse' as const,
    categoryId: 'c1',
    walletId: CASH,
    toWalletId: null,
    dayKey,
    ...extra,
  }
}

describe('computeStats — income, expense, saving rate', () => {
  it('saving rate is what came in but did not go out', () => {
    const r = computeStats({
      transactions: [
        { ...out(300_000, '2026-08-15') },
        {
          kind: 'in',
          amount: 1_000_000,
          intent: null,
          categoryId: null,
          walletId: CASH,
          toWalletId: null,
          dayKey: '2026-08-15',
        },
      ],
      reserveWalletIds: [SAVE],
      days: ['2026-08-15'],
    })
    expect(r.totalIn).toBe(1_000_000)
    expect(r.totalOut).toBe(300_000)
    expect(r.net).toBe(700_000)
    expect(r.savingRate).toBeCloseTo(0.7)
  })

  it('saving rate is null rather than 0 when no income landed in the window', () => {
    const r = computeStats({
      transactions: [out(50_000, '2026-08-15')],
      reserveWalletIds: [SAVE],
      days: ['2026-08-15'],
    })
    // 0 would read as "you saved nothing", which is a different claim from
    // "there is no income to measure against".
    expect(r.savingRate).toBeNull()
    expect(r.net).toBe(-50_000)
  })

  it('a move into a reserve wallet counts as saving; a move between spending wallets does not', () => {
    const move = (walletId: string, toWalletId: string) => ({
      kind: 'move' as const,
      amount: 150_000,
      intent: null,
      categoryId: null,
      walletId,
      toWalletId,
      dayKey: '2026-08-15',
    })
    const saved = computeStats({
      transactions: [move(CASH, SAVE)],
      reserveWalletIds: [SAVE],
      days: ['2026-08-15'],
    })
    expect(saved.savedToReserve).toBe(150_000)

    const shuffled = computeStats({
      transactions: [move(CASH, 'w-gopay')],
      reserveWalletIds: [SAVE],
      days: ['2026-08-15'],
    })
    expect(shuffled.savedToReserve).toBe(0)
  })

  it('a move is never counted as income or expense', () => {
    const r = computeStats({
      transactions: [{
        kind: 'move',
        amount: 150_000,
        intent: null,
        categoryId: null,
        walletId: CASH,
        toWalletId: SAVE,
        dayKey: '2026-08-15',
      }],
      reserveWalletIds: [SAVE],
      days: ['2026-08-15'],
    })
    expect(r.totalIn).toBe(0)
    expect(r.totalOut).toBe(0)
  })
})

describe('computeStats — intent and category breakdown', () => {
  it('an expense with no intent is counted as impulse, matching the write path default', () => {
    const r = computeStats({
      transactions: [out(10_000, '2026-08-15', { intent: null })],
      reserveWalletIds: [],
      days: ['2026-08-15'],
    })
    expect(r.intentTotals.impulse).toBe(10_000)
    expect(r.impulseRatio).toBe(1)
  })

  it('impulse ratio is null when nothing was spent, not NaN', () => {
    const r = computeStats({ transactions: [], reserveWalletIds: [], days: ['2026-08-15'] })
    expect(r.impulseRatio).toBeNull()
    expect(r.averageDailyOut).toBe(0)
  })

  it('categories come back largest first', () => {
    const r = computeStats({
      transactions: [
        out(10_000, '2026-08-15', { categoryId: 'small' }),
        out(90_000, '2026-08-15', { categoryId: 'big' }),
        out(50_000, '2026-08-15', { categoryId: 'mid' }),
      ],
      reserveWalletIds: [],
      days: ['2026-08-15'],
    })
    expect(r.byCategory.map((c) => c.categoryId)).toEqual(['big', 'mid', 'small'])
    expect(r.byCategory[0].amount).toBe(90_000)
  })
})

describe('computeStats — the daily series', () => {
  it('a day with no spending is a zero, not a missing point', () => {
    const r = computeStats({
      transactions: [out(60_000, '2026-08-15')],
      reserveWalletIds: [],
      days: ['2026-08-14', '2026-08-15', '2026-08-16'],
    })
    expect(r.daily).toEqual([
      { dayKey: '2026-08-14', out: 0 },
      { dayKey: '2026-08-15', out: 60_000 },
      { dayKey: '2026-08-16', out: 0 },
    ])
    // 60k over three days, including the two empty ones.
    expect(r.averageDailyOut).toBe(20_000)
  })

  it('same-day expenses accumulate into one point', () => {
    const r = computeStats({
      transactions: [out(20_000, '2026-08-15'), out(25_000, '2026-08-15')],
      reserveWalletIds: [],
      days: ['2026-08-15'],
    })
    expect(r.daily[0].out).toBe(45_000)
  })

  it('a transaction outside the requested days never invents a point', () => {
    const r = computeStats({
      transactions: [out(60_000, '2026-07-01')],
      reserveWalletIds: [],
      days: ['2026-08-15'],
    })
    expect(r.daily).toEqual([{ dayKey: '2026-08-15', out: 0 }])
    // It still counts toward the totals — the caller chose the query window.
    expect(r.totalOut).toBe(60_000)
  })
})
