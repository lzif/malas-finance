// domain/impulse.ts — impulse spend amount within the running cycle
// (spec §4.6, narrow slice). Pure functions only — no db, no Svelte.
//
// Only the rupiah SUM needed to translate the weekly notification's impulse
// figure into "N hari runway" (spec §8.1) is implemented here:
//   Σ(out, intent='impulse', discretionary, period)
// The full impulse-ratio PERCENTAGE, its dashboard presentation, the
// identical `emergency` treatment, and the 20%-of-cycle reflection prompt
// (all of §4.6) belong to Phase 2 (the Sadar screen) and are NOT built here
// — see TODO.md.

export interface ImpulseTransaction {
  kind: 'out' | 'in' | 'move'
  intent: string | null
  commitmentId: string | null
  dayKey: string
  amount: number
}

/**
 * impulseAmount(txs, cycleStart, today) = Σ amount
 *   for kind === 'out', intent === 'impulse', commitmentId === null,
 *   dayKey ∈ [cycleStart, today]
 *
 * The period is the running cycle (spec §4.6) — the same span as the daily
 * allowance, not a calendar month. dayKey strings compare lexicographically
 * the same as chronologically (spec convention, see domain/day.ts).
 */
export function impulseAmount(txs: ImpulseTransaction[], cycleStart: string, today: string): number {
  return txs
    .filter(
      (t) =>
        t.kind === 'out' &&
        t.intent === 'impulse' &&
        t.commitmentId === null &&
        t.dayKey >= cycleStart &&
        t.dayKey <= today
    )
    .reduce((sum, t) => sum + t.amount, 0)
}

/**
 * Converts a rupiah amount to its runway-day equivalent (spec §4.6):
 * `impulseAmount / totalDailyCost`. Returns null when totalDailyCost <= 0 —
 * "days of runway" is undefined with no daily cost to divide by.
 */
export function impulseRunwayDays(amount: number, totalDailyCost: number): number | null {
  if (totalDailyCost <= 0) return null
  return Math.floor(amount / totalDailyCost)
}
