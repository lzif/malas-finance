// domain/stats.ts — dashboard aggregates (spec §10). Pure functions, no I/O.
//
// Everything the read-only WebApp shows is derived here rather than in SQL, for
// the same reason the allowance is: it stays unit-testable without a database,
// and the numbers cannot drift between the chat reply and the dashboard.

import type { Intent, Kind } from './types.ts'

export interface StatsTransaction {
  kind: Kind
  amount: number
  intent: Intent | null
  categoryId: string | null
  walletId: string
  toWalletId: string | null
  dayKey: string
}

export interface StatsInput {
  transactions: StatsTransaction[]
  /** Wallets that hold savings rather than spending money. */
  reserveWalletIds: string[]
  /**
   * Every dayKey in the window, ascending. Passed in rather than derived from
   * the transactions so a day with no spending renders as a zero instead of
   * vanishing — a sparkline that silently drops empty days overstates how
   * steady the spending was.
   */
  days: string[]
}

export interface CategoryTotal {
  categoryId: string | null
  amount: number
}

export interface DailyPoint {
  dayKey: string
  out: number
}

export interface StatsResult {
  totalIn: number
  totalOut: number
  /** totalIn − totalOut. Negative means the window ate into earlier savings. */
  net: number
  /** Σ moves landing in a reserve wallet — deliberate saving, not leftovers. */
  savedToReserve: number
  /** net / totalIn, 0..1. null when nothing came in, since the ratio is undefined. */
  savingRate: number | null
  intentTotals: Record<Intent, number>
  /** impulse / totalOut, 0..1. null when nothing went out. */
  impulseRatio: number | null
  /** Spending per category, largest first. */
  byCategory: CategoryTotal[]
  daily: DailyPoint[]
  /** Mean daily spend across the window, including zero days. */
  averageDailyOut: number
}

const ZERO_INTENTS: Record<Intent, number> = {
  planned: 0,
  routine: 0,
  impulse: 0,
  emergency: 0,
}

export function computeStats(input: StatsInput): StatsResult {
  const intentTotals: Record<Intent, number> = { ...ZERO_INTENTS }
  const categories = new Map<string | null, number>()
  const perDay = new Map<string, number>()
  const reserve = new Set(input.reserveWalletIds)

  let totalIn = 0
  let totalOut = 0
  let savedToReserve = 0

  for (const t of input.transactions) {
    if (t.kind === 'in') {
      totalIn += t.amount
      continue
    }
    if (t.kind === 'move') {
      // A move is not income and not expense — it only counts as saving when
      // it actually lands somewhere reserved. Counting every move would let
      // shuffling money between two spending wallets inflate the saving rate.
      if (t.toWalletId !== null && reserve.has(t.toWalletId) && !reserve.has(t.walletId)) {
        savedToReserve += t.amount
      }
      continue
    }

    totalOut += t.amount
    intentTotals[t.intent ?? 'impulse'] += t.amount
    categories.set(t.categoryId, (categories.get(t.categoryId) ?? 0) + t.amount)
    perDay.set(t.dayKey, (perDay.get(t.dayKey) ?? 0) + t.amount)
  }

  const byCategory = [...categories.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)

  const daily = input.days.map((dayKey) => ({ dayKey, out: perDay.get(dayKey) ?? 0 }))

  const net = totalIn - totalOut

  return {
    totalIn,
    totalOut,
    net,
    savedToReserve,
    savingRate: totalIn > 0 ? net / totalIn : null,
    intentTotals,
    impulseRatio: totalOut > 0 ? intentTotals.impulse / totalOut : null,
    byCategory,
    daily,
    averageDailyOut: input.days.length > 0 ? Math.round(totalOut / input.days.length) : 0,
  }
}
