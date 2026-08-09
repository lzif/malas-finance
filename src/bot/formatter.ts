// bot/formatter.ts — turns computed results into the Telegram reply strings
// shown to the user (spec §6, §8). Pure functions: they take plain data and
// return a string, so every line of user-facing copy is unit-testable without
// a bot, a network, or a database.
//
// LANGUAGE RULE (AGENTS.md): user-facing string literals are Bahasa Indonesia.
// Everything else — identifiers, comments — stays English.

import { formatRupiah } from '../domain/money.ts'
import type { Intent } from '../domain/types.ts'

/** Uppercase Indonesian label + emoji for each intent (spec §6.1, §8.1). */
const INTENT_LABEL: Record<Intent, string> = {
  planned: '📋 TERENCANA',
  routine: '🔄 RUTIN',
  impulse: '⚡ IMPULSIF',
  emergency: '🚨 DARURAT',
}

export function intentLabel(intent: Intent): string {
  return INTENT_LABEL[intent]
}

/** The "sisa hari ini" anchor line included in every reply (K1, spec §6.1). */
export function anchorLine(remainingAllowance: number, allowanceToday: number): string {
  return `Sisa hari ini: ${formatRupiah(remainingAllowance)} dari ${formatRupiah(allowanceToday)}`
}

export interface ExpenseReply {
  item: string
  amount: number
  intent: Intent
  categoryPath: string // e.g. "Rokok & Sejenisnya > Rokok"
  remainingAllowance: number
  allowanceToday: number
}

/**
 * The confirmation shown after saving an expense (spec §6.1):
 *
 *   💾 Rokok Surya — Rp 27.500 [IMPULSIF]
 *   📁 Rokok & Sejenisnya > Rokok
 *   Sisa hari ini: Rp 52.500 dari Rp 80.000
 */
export function formatExpense(r: ExpenseReply): string {
  return [
    `💾 ${r.item} — ${formatRupiah(r.amount)} [${bareIntent(r.intent)}]`,
    `📁 ${r.categoryPath}`,
    anchorLine(r.remainingAllowance, r.allowanceToday),
  ].join('\n')
}

/** Intent word without the emoji, for the bracketed tag in the first line. */
function bareIntent(intent: Intent): string {
  return INTENT_LABEL[intent].split(' ')[1]
}

export interface IncomeReply {
  item: string
  amount: number
  walletName: string
  remainingAllowance: number
  allowanceToday: number
}

/**
 * Income confirmation (spec §6.2):
 *
 *   💰 Gajian — Rp 2.400.000 → Bank
 *   Sisa hari ini: Rp 100.000 dari Rp 100.000
 */
export function formatIncome(r: IncomeReply): string {
  return [
    `💰 ${r.item} — ${formatRupiah(r.amount)} → ${r.walletName}`,
    anchorLine(r.remainingAllowance, r.allowanceToday),
  ].join('\n')
}

export interface TransferReply {
  amount: number
  fromWallet: string
  toWallet: string
  remainingAllowance: number
  allowanceToday: number
  /**
   * Whether the move changed the daily allowance. False for spendable →
   * spendable (money stayed in the same pool); true when it crossed the
   * spendable/reserve boundary, because reserve wallets are excluded from
   * spendableBalance (spec §12) so the allowance really does move.
   */
  allowanceChanged: boolean
}

/**
 * Wallet transfer (spec §6.5). Moving money between two spendable wallets
 * leaves the allowance alone, and the reply says so rather than silently
 * repeating a number the user might read as a change.
 *
 * A move into (or out of) a reserve wallet is different: it leaves the
 * spendable pool, so the allowance genuinely shifts. Printing "jatah tidak
 * berubah" there would be a lie on the same line as the changed number — the
 * one thing this app cannot afford (spec §2).
 */
export function formatTransfer(r: TransferReply): string {
  const second = r.allowanceChanged
    ? anchorLine(r.remainingAllowance, r.allowanceToday)
    : `Sisa hari ini: ${formatRupiah(r.remainingAllowance)} (jatah tidak berubah)`
  return [
    `🔄 Pindah ${formatRupiah(r.amount)}: ${r.fromWallet} → ${r.toWallet}`,
    second,
  ].join('\n')
}
