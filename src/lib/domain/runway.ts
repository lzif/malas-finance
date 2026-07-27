// domain/runway.ts — how long the spendable balance lasts at the current
// pace. Pure functions. (spec §4.5)

import { addDays, daysBetween } from './day'

export interface RunwayInput {
  today: string
  /** dayKey of the first day the app was used (settings.startedAt). */
  startedAt: string
  /**
   * Map of dayKey → total discretionary spend (out, commitmentId == null)
   * for that day. Days missing from the map count as 0, not skipped.
   */
  dailySpendMap: Record<string, number>
  /** Set during onboarding: "roughly how much do you spend a day?". */
  seedDailySpend: number
  spendableBalance: number
  /**
   * Σ(active commitments) / cycleLength. MUST remain a parameter even though
   * commitments are out of MVP scope — the caller passes 0.
   */
  dailyCommitmentCost: number
}

export interface RunwayResult {
  days: number
  /** true while the seed weight (w) < 1 — the UI must show an "estimated" label. */
  estimated: boolean
}

/**
 * computeRunway(input) → { days, estimated } | null
 *
 * N                 = min(28, daysSinceStart)
 * averageWindow     = [today − N, today − 1]        // does NOT include today
 * actualAverage     = N > 0 ? mean(dailySpend(d)) for d in window : 0
 * w                 = min(1, daysSinceStart / 14)
 * dailyAverage      = w × actualAverage + (1 − w) × seedDailySpend
 * totalDailyCost    = dailyAverage + dailyCommitmentCost
 * runway            = totalDailyCost > 0 ? floor(spendableBalance / totalDailyCost) : null
 *
 * The `N > 0` guard is absolute: without it mean([]) === NaN, and 0 × NaN is
 * still NaN in JavaScript — a zero weight does NOT save the first day (spec §4.5).
 */
export function computeRunway(input: RunwayInput): RunwayResult | null {
  const daysSinceStart = daysBetween(input.today, input.startedAt)
  const N = Math.min(28, daysSinceStart)

  let actualAverage = 0
  if (N > 0) {
    let total = 0
    for (let i = 1; i <= N; i++) {
      const d = addDays(input.today, -i)
      total += input.dailySpendMap[d] ?? 0
    }
    actualAverage = total / N
  }

  const w = Math.min(1, daysSinceStart / 14)
  const dailyAverage = w * actualAverage + (1 - w) * input.seedDailySpend
  const totalDailyCost = dailyAverage + input.dailyCommitmentCost

  if (totalDailyCost <= 0) return null

  return {
    days: Math.floor(input.spendableBalance / totalDailyCost),
    estimated: w < 1
  }
}
