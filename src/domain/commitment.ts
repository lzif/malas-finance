/**
 * Commitments (spec §4.3). Pure functions only — no db, no Svelte.
 *
 * Paid status is DERIVED from transactions, never stored. That removes three
 * defects at once: no dual-table write to keep atomic, no reverse sync when a
 * payment is soft-deleted, and no cycle key to define for `manual`/`rolling`
 * modes. Soft-deleting a payment un-pays the commitment for free, because
 * nothing was written that would need undoing.
 */

export interface Commitment {
  id: string
  name: string
  amount: number
  /** `bill` is settled by an `out`; `saving` by a `move` into a reserve wallet. */
  kind: 'bill' | 'saving'
  dueDay: number
  walletId: string | null
  active: boolean
}

export interface CommitmentTransaction {
  commitmentId: string | null
  dayKey: string
  kind: 'out' | 'in' | 'move'
}

export interface CommitmentWindow {
  start: string
  end: string
}

/** The transaction kind that actually settles a commitment of this kind. */
export function settlingKind(c: Commitment): 'out' | 'move' {
  return c.kind === 'saving' ? 'move' : 'out'
}

/**
 * The window in which a commitment counts as owed: the cycle itself.
 *
 * Spec §4.3 writes `[startOfMonth, cycleEnd]`. That is right only for a cycle
 * anchored on day 1, and wrong in both directions otherwise. With a cycle of
 * 10 Jul - 9 Aug it reaches back to 1 Jul and pulls in a bill due 5 Jul that
 * belongs to the PREVIOUS cycle, overstating what is owed; and the reason it
 * was chosen in the first place - stopping an overdue bill from vanishing -
 * `cycleStart` already achieves, since a bill due 25 Jul is still inside
 * 10 Jul - 9 Aug on 1 Aug.
 *
 * So the rule is simply: every occurrence falling inside the current cycle.
 * Occurrences from before the cycle started were the previous cycle's
 * accounting; carrying them forward forever would permanently depress the
 * allowance over bills that may well have been settled outside the app.
 *
 * Known limit: in `rolling` mode `cycleStart` is today, so a bill that fell due
 * earlier this month does not appear. In rolling mode there is no cycle for it
 * to be overdue *within*. Recorded in TODO.md.
 */
export function commitmentWindow(cycleStart: string, cycleEnd: string): CommitmentWindow {
  return { start: cycleStart, end: cycleEnd }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Every 'YYYY-MM' the window touches, inclusive of both ends. */
export function monthsInWindow(window: CommitmentWindow): string[] {
  const months: string[] = []
  let year = Number(window.start.slice(0, 4))
  let month = Number(window.start.slice(5, 7))
  const endKey = window.end.slice(0, 7)
  for (let guard = 0; guard < 24; guard++) {
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
    months.push(key)
    if (key >= endKey) break
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/**
 * The dayKey this commitment falls due in the given 'YYYY-MM'.
 * dueDay 29/30/31 clamps to the last day of a short month.
 */
export function dueOccurrence(c: Commitment, monthKey: string): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const day = Math.min(c.dueDay, daysInMonth(year, month))
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

/**
 * Every due date of this commitment that falls inside the window. A window
 * spanning two calendar months genuinely contains two occurrences; computing
 * only the one in today's month made the other invisible and understated what
 * the user owes.
 */
export function dueOccurrences(c: Commitment, window: CommitmentWindow): string[] {
  return monthsInWindow(window)
    .map((m) => dueOccurrence(c, m))
    .filter((d) => d >= window.start && d <= window.end)
}

/**
 * Is this particular occurrence settled? A payment counts only when it has the
 * kind that actually settles this commitment — an `in` tagged with the
 * commitment id must never mark a bill paid — and only when it lands in the
 * same calendar month as the occurrence, so paying July's rent does not also
 * clear August's.
 */
export function isOccurrencePaid(
  c: Commitment,
  txs: CommitmentTransaction[],
  occurrence: string,
): boolean {
  const monthKey = occurrence.slice(0, 7)
  const needed = settlingKind(c)
  return txs.some(
    (tx) => tx.commitmentId === c.id && tx.kind === needed && tx.dayKey.slice(0, 7) === monthKey,
  )
}

/** Convenience for the UI: is the occurrence due in `today`'s month settled? */
export function isPaid(c: Commitment, txs: CommitmentTransaction[], today: string): boolean {
  return isOccurrencePaid(c, txs, dueOccurrence(c, today.slice(0, 7)))
}

/**
 * Σ of every unpaid occurrence inside the window, for active commitments only.
 * Callers pass ACTIVE (non-deleted) transactions.
 */
export function unpaidCommitments(
  commitments: Commitment[],
  txs: CommitmentTransaction[],
  cycleStart: string,
  cycleEnd: string,
): number {
  if (commitments.length === 0) return 0
  const window = commitmentWindow(cycleStart, cycleEnd)
  let total = 0
  for (const c of commitments) {
    if (!c.active) continue
    for (const occurrence of dueOccurrences(c, window)) {
      if (!isOccurrencePaid(c, txs, occurrence)) total += c.amount
    }
  }
  return total
}
