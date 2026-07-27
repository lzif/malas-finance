// db/repo/transactions.ts — satu-satunya jalur tulis ke tabel transactions.
// Menegakkan aturan integritas §5.1 di lapisan repository, bukan hanya UI —
// UI bisa dilewati, repository tidak.

import { db, type Intent, type Transaction } from '../schema'
import { dayKeyOf } from '../../domain/day'

export class ValidationError extends Error {}

export interface NewTransactionInput {
  kind: Transaction['kind']
  amount: number
  intent: Intent | null
  tag: string | null
  note: string | null
  walletId: string
  toWalletId: string | null
  commitmentId: string | null
  /** epoch ms. Default: sekarang. */
  at?: number
}

function validate(input: NewTransactionInput, dayStartHour: number, now: number): void {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ValidationError('amount harus bilangan bulat positif')
  }

  const requiresIntent = input.kind === 'out'
  const hasIntent = input.intent !== null
  if (requiresIntent !== hasIntent) {
    throw new ValidationError('intent wajib bila dan hanya bila kind === "out"')
  }

  const requiresToWallet = input.kind === 'move'
  const hasToWallet = input.toWalletId !== null
  if (requiresToWallet !== hasToWallet) {
    throw new ValidationError('toWalletId wajib bila dan hanya bila kind === "move"')
  }

  if (input.toWalletId !== null && input.toWalletId === input.walletId) {
    throw new ValidationError('walletId dan toWalletId tidak boleh sama')
  }

  if (input.note !== null && input.note.length > 200) {
    throw new ValidationError('note maksimal 200 karakter')
  }

  const at = input.at ?? now
  const dayKeyOfAt = dayKeyOf(at, dayStartHour)
  const dayKeyOfNow = dayKeyOf(now, dayStartHour)
  if (dayKeyOfAt > dayKeyOfNow) {
    throw new ValidationError('at tidak boleh melewati akhir hari ini')
  }
}

export async function addTransaction(
  input: NewTransactionInput,
  dayStartHour: number
): Promise<Transaction> {
  const now = Date.now()
  validate(input, dayStartHour, now)

  const at = input.at ?? now
  const tx: Transaction = {
    id: crypto.randomUUID(),
    kind: input.kind,
    amount: input.amount,
    intent: input.intent,
    tag: input.tag,
    note: input.note,
    walletId: input.walletId,
    toWalletId: input.toWalletId,
    commitmentId: input.commitmentId,
    at,
    dayKey: dayKeyOf(at, dayStartHour),
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }

  await db.transactions.add(tx)
  return tx
}

/** Soft-delete: tandai deletedAt, tidak pernah menghapus baris sungguhan. */
export async function softDelete(id: string): Promise<void> {
  await db.transactions.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

/** Pulihkan entri dari trash. */
export async function restore(id: string): Promise<void> {
  await db.transactions.update(id, { deletedAt: null, updatedAt: Date.now() })
}

export async function activeTransactionsForDay(dayKey: string): Promise<Transaction[]> {
  const rows = await db.transactions.where('dayKey').equals(dayKey).toArray()
  return rows.filter((t) => t.deletedAt === null)
}

/** Seluruh transaksi aktif, diurutkan terbaru dulu. Cukup untuk MVP (tanpa filter). */
export async function allActiveTransactions(): Promise<Transaction[]> {
  const rows = await db.transactions.toArray()
  return rows.filter((t) => t.deletedAt === null).sort((a, b) => b.at - a.at)
}

export async function recentTransactions(limit: number): Promise<Transaction[]> {
  const rows = await allActiveTransactions()
  return rows.slice(0, limit)
}

/**
 * Tag yang paling sering dipakai 30 hari terakhir untuk `kind` tertentu.
 * Dipakai untuk chip tag yang "dipelajari dari riwayat" (spec §7.1).
 */
export async function topTags(kind: Transaction['kind'], limit: number): Promise<string[]> {
  const rows = await allActiveTransactions()
  const cutoff = Date.now() - 30 * 86_400_000
  const counts = new Map<string, number>()
  for (const t of rows) {
    if (t.kind !== kind || t.tag === null || t.at < cutoff) continue
    counts.set(t.tag, (counts.get(t.tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag)
}
