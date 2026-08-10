import { getSql } from '../connection.ts'
import { toIso, toIsoOrNull } from '../rows.ts'
import { dayKeyOf } from '../../domain/day.ts'
import type { Intent, Kind } from '../../domain/types.ts'

type Row = Record<string, unknown>

export interface Transaction {
  id: string
  kind: Kind
  amount: number
  intent: Intent | null
  categoryId: string | null
  note: string | null
  walletId: string
  toWalletId: string | null
  commitmentId: string | null
  at: string
  dayKey: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    kind: row.kind as Kind,
    amount: row.amount as number,
    intent: (row.intent as Intent) ?? null,
    categoryId: (row.category_id as string) ?? null,
    note: (row.note as string) ?? null,
    walletId: row.wallet_id as string,
    toWalletId: (row.to_wallet_id as string) ?? null,
    commitmentId: (row.commitment_id as string) ?? null,
    at: toIso(row.at),
    dayKey: row.day_key as string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: toIsoOrNull(row.deleted_at),
  }
}

export interface CreateTransactionInput {
  kind: Kind
  amount: number
  intent?: Intent | null
  categoryId?: string | null
  note?: string | null
  walletId: string
  toWalletId?: string | null
  commitmentId?: string | null
  at?: Date
}

export async function createTransaction(
  input: CreateTransactionInput,
  dayStartHour: number,
): Promise<Transaction> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('amount must be a positive integer')
  }

  if (input.kind === 'out' && !input.intent) {
    throw new Error('intent is required for expenses')
  }
  if (input.kind !== 'out' && input.intent) {
    throw new Error('intent must be null for non-expense transactions')
  }

  if (input.kind === 'move' && !input.toWalletId) {
    throw new Error('to_wallet_id is required for transfers')
  }
  if (input.kind !== 'move' && input.toWalletId) {
    throw new Error('to_wallet_id must be null for non-transfer transactions')
  }

  if (input.toWalletId && input.walletId === input.toWalletId) {
    throw new Error('cannot transfer to the same wallet')
  }

  const now = new Date()
  const at = input.at ?? now

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  if (at.getTime() > endOfToday.getTime()) {
    throw new Error('future-dated transactions are forbidden')
  }

  const dayKey = dayKeyOf(at.getTime(), dayStartHour)
  const intent = input.intent ?? null
  const categoryId = input.categoryId ?? null
  const note = input.note ?? null
  const toWalletId = input.toWalletId ?? null
  const commitmentId = input.commitmentId ?? null

  const sql = getSql()
  const rows = await sql`
    INSERT INTO transactions
      (kind, amount, intent, category_id, note, wallet_id, to_wallet_id, commitment_id, at, day_key)
    VALUES
      (${input.kind}, ${input.amount}, ${intent}, ${categoryId}, ${note},
       ${input.walletId}, ${toWalletId}, ${commitmentId}, ${at.toISOString()}, ${dayKey})
    RETURNING *
  ` as Row[]
  return rowToTransaction(rows[0])
}

export async function softDelete(id: string): Promise<Transaction> {
  const sql = getSql()
  const rows = await sql`
    UPDATE transactions
    SET deleted_at = now(), updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  ` as Row[]
  if (rows.length === 0) {
    throw new Error(`Transaction ${id} not found or already deleted`)
  }
  return rowToTransaction(rows[0])
}

export async function getTransactionsForDay(dayKey: string): Promise<Transaction[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM transactions
    WHERE day_key = ${dayKey} AND deleted_at IS NULL
    ORDER BY at
  ` as Row[]
  return rows.map(rowToTransaction)
}

export async function getDaySpend(dayKey: string): Promise<number> {
  const sql = getSql()
  const rows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE day_key = ${dayKey}
      AND kind = 'out'
      AND commitment_id IS NULL
      AND deleted_at IS NULL
  ` as Row[]
  return Number(rows[0].total)
}

export async function getTransactionsForCycle(
  startDayKey: string,
  endDayKey: string,
): Promise<Transaction[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM transactions
    WHERE day_key >= ${startDayKey}
      AND day_key <= ${endDayKey}
      AND deleted_at IS NULL
    ORDER BY at
  ` as Row[]
  return rows.map(rowToTransaction)
}
