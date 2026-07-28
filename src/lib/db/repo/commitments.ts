// db/repo/commitments.ts — commitment rows (spec §4.3).
//
// Paid status is deliberately NOT stored here. It is derived from the
// transactions table by domain/commitment.ts. That removes three defects at
// once: no dual-table write to keep atomic, no reverse sync when a payment is
// soft-deleted, and no cycle key to define for `manual` and `rolling` modes.

import { db, type Commitment } from '../schema'

export class ValidationError extends Error {}

export interface NewCommitmentInput {
  name: string
  amount: number
  kind: Commitment['kind']
  dueDay: number
  walletId?: string | null
}

function validate(input: NewCommitmentInput): void {
  if (input.name.trim() === '') {
    throw new ValidationError('commitment name must not be empty')
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ValidationError('amount must be a positive integer')
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new ValidationError('dueDay must be an integer between 1 and 31')
  }
}

export async function addCommitment(input: NewCommitmentInput): Promise<Commitment> {
  validate(input)
  const commitment: Commitment = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    amount: input.amount,
    kind: input.kind,
    dueDay: input.dueDay,
    walletId: input.walletId ?? null,
    active: true
  }
  await db.commitments.add(commitment)
  return commitment
}

export async function allCommitments(): Promise<Commitment[]> {
  const rows = await db.commitments.toArray()
  return rows.sort((a, b) => a.dueDay - b.dueDay)
}

export async function activeCommitments(): Promise<Commitment[]> {
  const rows = await allCommitments()
  return rows.filter((c) => c.active)
}

/**
 * Deactivate rather than delete. A deleted commitment would silently orphan the
 * `commitmentId` on every transaction that ever paid it, and those transactions
 * must stay excluded from discretionary spend.
 */
export async function deactivateCommitment(id: string): Promise<void> {
  await db.commitments.update(id, { active: false })
}

export async function reactivateCommitment(id: string): Promise<void> {
  await db.commitments.update(id, { active: true })
}
