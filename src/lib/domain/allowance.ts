// domain/allowance.ts — daily allowance, the app's anchor number. Pure
// functions. (spec §4.4). This is the most important part of the codebase:
// if this number lies even once, the user stops trusting it and the app dies.

import type { Kind } from './types'

export interface AllowanceTransaction {
  kind: Kind
  amount: number
  /** null unless this is a commitment payment. */
  commitmentId: string | null
}

export interface AllowanceInput {
  /** Σ walletBalance(w) across all spendable, non-archived wallets. */
  spendableBalance: number
  /** Active (non-deleted) transactions with dayKey === today. */
  transactionsToday: AllowanceTransaction[]
  /**
   * Σ unpaid commitment bills due within the current cycle window. This
   * parameter is REQUIRED even though commitments are out of MVP scope —
   * the caller passes 0. Do not remove it from the signature: adding
   * commitments later must not change the shape of domain/.
   */
  unpaidCommitments: number
  endBuffer: number
  /** max(1, daysBetween(cycleEnd, today) + 1) — from cycle.ts. */
  daysRemaining: number
}

// NOTE: these string values are intentionally left as the original Indonesian
// terms (not translated to e.g. 'negative' / 'exceeded'). They are internal
// status codes, never rendered to the user directly, and are pinned by
// literal `.toBe(...)` assertions in allowance.test.ts that this refactor
// must not alter. Only the type/function identifiers around them are renamed.
export type AllowanceStatus = 'normal' | 'minus' | 'lewat'

export interface AllowanceResult {
  spentToday: number
  allowanceBasis: number
  availableFunds: number
  allowanceToday: number
  remainingAllowance: number
  status: AllowanceStatus
  /** null when allowanceToday === 0 (minus condition) — percentage is undefined. */
  percentUsed: number | null
}

/**
 * computeAllowance(input) → { allowanceToday, remainingAllowance, status, ... }
 *
 * spentToday      = Σ amount  for out, dayKey == today, commitmentId == null
 * allowanceBasis  = spendableBalance + spentToday
 * availableFunds  = allowanceBasis − unpaidCommitments − endBuffer
 * allowanceToday  = availableFunds > 0 ? floor(availableFunds / daysRemaining) : 0
 * remainingAllowance = allowanceToday − spentToday
 */
export function computeAllowance(input: AllowanceInput): AllowanceResult {
  const spentToday = input.transactionsToday
    .filter((t) => t.kind === 'out' && t.commitmentId === null)
    .reduce((sum, t) => sum + t.amount, 0)

  const allowanceBasis = input.spendableBalance + spentToday
  const availableFunds = allowanceBasis - input.unpaidCommitments - input.endBuffer
  const allowanceToday = availableFunds > 0 ? Math.floor(availableFunds / input.daysRemaining) : 0
  const remainingAllowance = allowanceToday - spentToday

  let status: AllowanceStatus = 'normal'
  if (availableFunds <= 0) status = 'minus'
  else if (remainingAllowance < 0) status = 'lewat'

  const percentUsed = allowanceToday > 0 ? spentToday / allowanceToday : null

  return { spentToday, allowanceBasis, availableFunds, allowanceToday, remainingAllowance, status, percentUsed }
}

// NOTE: same as AllowanceStatus above — these string values are intentionally
// left untranslated. They double as the CSS class suffix in app.css
// (`.band-tenang`, `.band-waspada`, ...) and are pinned by literal
// `.toBe(...)` assertions in allowance.test.ts.
export type AllowanceBand = 'tenang' | 'waspada' | 'mendesak' | 'terlampaui'

/**
 * Anti-habituation visual treatment (spec §7.1, mechanism 1): color and font
 * weight follow the percentage of the allowance used, not just its digits.
 * calm 0–60%, alert 60–90%, urgent 90–100%, exceeded >100%.
 */
export function allowanceBand(percentUsed: number | null): AllowanceBand {
  if (percentUsed === null) return 'terlampaui'
  if (percentUsed > 1) return 'terlampaui'
  if (percentUsed >= 0.9) return 'mendesak'
  if (percentUsed >= 0.6) return 'waspada'
  return 'tenang'
}

/**
 * Anti-habituation mechanism 2 (spec §7.1): intervention at the moment of
 * decision. How many rupiah the amount being typed would exceed the
 * remaining allowance by — 0 if it doesn't exceed it. Used for the warning
 * line shown before saving: "This will exceed your allowance by Rp <result>."
 */
export function projectedOverspend(amount: number, remainingAllowanceNow: number): number {
  const remainingAfter = remainingAllowanceNow - amount
  return remainingAfter < 0 ? -remainingAfter : 0
}

/**
 * Projects tomorrow's daily allowance based on current spendable balance.
 * Implements the third anti-habituation mechanism from spec §7.1: 'state the
 * future consequence outright' — when today's allowance is exceeded, show
 * the user what tomorrow's allowance drops to.
 *
 * Note: There is no add-back of today's spending here (unlike computeAllowance)
 * because tomorrow's spentToday is zero by definition, so the current balance
 * is already tomorrow's basis.
 */
export function projectedTomorrowAllowance(input: {
  spendableBalance: number
  unpaidCommitments: number
  endBuffer: number
  daysRemaining: number
}): number {
  const daysLeftTomorrow = Math.max(1, input.daysRemaining - 1)
  const available = input.spendableBalance - input.unpaidCommitments - input.endBuffer
  return available > 0 ? Math.floor(available / daysLeftTomorrow) : 0
}
