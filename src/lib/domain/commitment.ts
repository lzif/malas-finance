/**
 * Types and pure functions for commitments.
 * Paid status is derived from transactions (§4.3).
 */

/**
 * Commitment entity representing a recurring obligation (bill or saving).
 * @see §4.3
 */
export interface Commitment {
  id: string
  name: string
  amount: number
  kind: 'bill' | 'saving'
  dueDay: number
  walletId: string | null
  active: boolean
}

/**
 * Transaction fields relevant for commitment calculations.
 * @see §4.3
 */
export interface CommitmentTransaction {
  commitmentId: string | null
  dayKey: string
  kind: 'out' | 'in' | 'move'
}

/**
 * Calculates the commitment window [start, end] for commitment queries.
 * The lower bound is the first day of today's calendar month ('YYYY-MM-01'),
 * ensuring past-due unpaid commitments are still counted.
 * @see §4.3
 */
export function commitmentWindow(today: string, cycleEnd: string): { start: string; end: string } {
  const start = `${today.slice(0, 7)}-01`
  return { start, end: cycleEnd }
}

/**
 * Calculates the dayKey when a commitment falls due in the calendar month of `monthOfDayKey`.
 * Clamps dueDay 29/30/31 in short months to the last day of that month.
 * @see §4.3
 */
export function dueOccurrence(c: Commitment, monthOfDayKey: string): string {
  const yearStr = monthOfDayKey.slice(0, 4)
  const monthStr = monthOfDayKey.slice(5, 7)
  const year = Number(yearStr)
  const month = Number(monthStr)
  const maxDays = new Date(year, month, 0).getDate()
  const day = Math.min(c.dueDay, maxDays)
  const dayStr = String(day).padStart(2, '0')
  return `${yearStr}-${monthStr}-${dayStr}`
}

/**
 * Returns true if a commitment is paid within the commitment window.
 * A commitment is considered paid if there is an active transaction
 * linked via commitmentId with a dayKey inside [window.start, window.end].
 * @see §4.3
 */
export function isPaid(
  c: Commitment,
  txs: CommitmentTransaction[],
  window: { start: string; end: string }
): boolean {
  return txs.some(
    (tx) =>
      tx.commitmentId === c.id &&
      tx.dayKey >= window.start &&
      tx.dayKey <= window.end
  )
}

/**
 * Calculates the sum of amounts for all active commitments whose due occurrence
 * falls within the window and which are not yet paid.
 * Returns 0 if there are no unpaid active commitments.
 * @see §4.3
 */
export function unpaidCommitments(
  commitments: Commitment[],
  txs: CommitmentTransaction[],
  today: string,
  cycleEnd: string
): number {
  if (commitments.length === 0) return 0
  const window = commitmentWindow(today, cycleEnd)
  let total = 0
  for (const c of commitments) {
    if (!c.active) continue
    const due = dueOccurrence(c, today)
    if (due >= window.start && due <= window.end && !isPaid(c, txs, window)) {
      total += c.amount
    }
  }
  return total
}

