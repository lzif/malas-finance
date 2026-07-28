// domain/weekComparison.ts — week-over-week spend comparison (spec §4.7,
// narrow slice built for the Sunday weekly notification, spec §8.1). Pure
// functions only — no db, no Svelte.
//
// Only this one supporting metric is implemented here. Tag breakdown, intent
// distribution, sparkline series, and emergency burden (§4.7's other rows)
// belong to Phase 2 (the Sadar dashboard) and are NOT built here — see
// TODO.md.

import { addDays, dayRange } from './day'

export interface WeekComparisonResult {
  /** Σ dailySpend(d) for the 7 days ending today, inclusive. */
  thisWeekTotal: number
  /** Mean of up to 4 preceding, fully-recorded 7-day blocks. */
  average4Weeks: number
  /** (thisWeekTotal − average4Weeks) / average4Weeks. null when average4Weeks === 0 (spec §4.7 guard). */
  percentChange: number | null
  /** How many preceding weeks actually had complete data (0..4). */
  weeksUsed: number
}

/**
 * computeWeekComparison(dailySpendMap, today, daysSinceStart) → result | null
 *
 * Hidden entirely (returns null) when daysSinceStart < 7 (spec §4.7) — under
 * a week of history is not enough to call it "this week" vs. anything.
 *
 * `thisWeekTotal` is the 7 days ending TODAY, inclusive: by the time this
 * feeds the Sunday 20:00 notification, today's spending is almost entirely
 * in already (same reasoning as the daily summary, spec §8.2).
 *
 * `average4Weeks` looks back at as many of the 4 preceding 7-day blocks as
 * are fully covered by recorded history (0..4) — spec §4.7's "when data is
 * less than 4 full weeks, use the available weeks and note the number".
 * When zero preceding weeks are available, `average4Weeks` is 0 and
 * `percentChange` is null rather than a division by zero.
 */
export function computeWeekComparison(
  dailySpendMap: Record<string, number>,
  today: string,
  daysSinceStart: number
): WeekComparisonResult | null {
  if (daysSinceStart < 7) return null

  const thisWeekTotal = sumRange(dailySpendMap, addDays(today, -6), today)

  // Week w (1-indexed) covers [today − 6 − 7w, today − 7w]. It is fully
  // within recorded history when (6 + 7w) <= daysSinceStart.
  const weeksUsed = Math.min(4, Math.max(0, Math.floor((daysSinceStart - 6) / 7)))

  let sum = 0
  for (let w = 1; w <= weeksUsed; w++) {
    const end = addDays(today, -7 * w)
    const start = addDays(end, -6)
    sum += sumRange(dailySpendMap, start, end)
  }
  const average4Weeks = weeksUsed > 0 ? sum / weeksUsed : 0
  const percentChange = average4Weeks > 0 ? (thisWeekTotal - average4Weeks) / average4Weeks : null

  return { thisWeekTotal, average4Weeks, percentChange, weeksUsed }
}

function sumRange(map: Record<string, number>, start: string, end: string): number {
  return dayRange(start, end).reduce((sum, d) => sum + (map[d] ?? 0), 0)
}
