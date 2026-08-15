// repo/commitments.ts — persistence for recurring bills and savings targets
// (spec §4.3). The math lives in domain/commitment.ts; this module only reads
// and writes rows.
//
// Paid status is deliberately NOT stored here. domain/commitment.ts derives it
// from the transactions that carry a matching commitment_id, so soft-deleting
// a payment un-pays the bill with no second write to keep in sync.

import { getSql } from '../connection.ts'
import type { Commitment } from '../../domain/commitment.ts'

type Row = Record<string, unknown>

function rowToCommitment(row: Record<string, unknown>): Commitment {
  return {
    id: row.id as string,
    name: row.name as string,
    amount: row.amount as number,
    kind: row.kind as 'bill' | 'saving',
    dueDay: row.due_day as number,
    walletId: (row.wallet_id ?? null) as string | null,
    active: row.active as boolean,
  }
}

export async function listCommitments(includeInactive = false): Promise<Commitment[]> {
  const sql = getSql()
  const rows = includeInactive
    ? await sql`SELECT * FROM commitments ORDER BY due_day, created_at` as Row[]
    : await sql`
      SELECT * FROM commitments WHERE active = true ORDER BY due_day, created_at
    ` as Row[]
  return rows.map(rowToCommitment)
}

export async function createCommitment(
  name: string,
  amount: number,
  kind: 'bill' | 'saving',
  dueDay: number,
  walletId: string | null = null,
): Promise<Commitment> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer (whole rupiah)')
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error('dueDay must be an integer between 1 and 31')
  }
  const sql = getSql()
  const rows = await sql`
    INSERT INTO commitments (name, amount, kind, due_day, wallet_id)
    VALUES (${name}, ${amount}, ${kind}, ${dueDay}, ${walletId})
    RETURNING *
  ` as Row[]
  return rowToCommitment(rows[0])
}

/**
 * The active commitment this payment settles, or null.
 *
 * Matched on name, case-insensitively, because that is all the user gives us
 * when they type "Wifi 85k" — there is no id in a chat message. Exact match
 * first, then a containment match so "bayar wifi" still finds "Wifi". Amount
 * is deliberately NOT part of the match: a bill whose amount varies month to
 * month (a metered utility) is still the same bill, and refusing to link it
 * would silently charge it to the day instead.
 */
export async function findCommitmentByName(name: string): Promise<Commitment | null> {
  const needle = name.trim().toLowerCase()
  if (needle === '') return null
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM commitments
    WHERE active = true
      AND (
        lower(name) = ${needle}
        OR position(lower(name) in ${needle}) > 0
      )
    ORDER BY length(name) DESC, created_at
    LIMIT 1
  ` as Row[]
  return rows.length > 0 ? rowToCommitment(rows[0]) : null
}

export async function deactivateCommitment(id: string): Promise<void> {
  const sql = getSql()
  await sql`UPDATE commitments SET active = false WHERE id = ${id}`
}
