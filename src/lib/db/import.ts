// db/import.ts — applying a parsed backup envelope to the database (spec §9.2).
//
// Two modes: Merge (every transaction gets a fresh id, no dedup; wallets and
// commitments are inserted only if their id isn't already present locally) and
// Full replace (the database is cleared, then populated verbatim from the
// file — this is what makes "uninstall, reinstall, import the backup" produce
// identical data, spec §12/§16).
//
// Split into pure planning functions + thin Dexie-only wrappers, mirroring the
// fsBackup/ split (writeToAllTargets.ts/rotate.ts pure + unit-tested,
// capacitor.ts the untested native adapter) — fake-indexeddb is not a
// dependency of this project, so the planning logic must be testable without
// touching Dexie at all.

import { db, DEFAULT_SETTINGS, type Commitment, type Settings, type Transaction, type Wallet } from './schema'
import type { BackupEnvelope } from './backup'
import { dayKeyOf } from '../domain/day'

export interface MergePlan {
  walletsToAdd: Wallet[]
  commitmentsToAdd: Commitment[]
  transactionsToAdd: Transaction[]
}

/**
 * Pure planning function for Merge mode. `newId` is injected (not
 * crypto.randomUUID() called directly) so tests can pass a predictable
 * sequence and assert on it.
 */
export function planMergeImport(
  env: BackupEnvelope,
  current: { wallets: Wallet[]; commitments: Commitment[] },
  dayStartHour: number,
  newId: () => string
): MergePlan {
  const currentWalletIds = new Set(current.wallets.map((w) => w.id))
  const envWalletsById = new Map<string, Wallet>()
  for (const w of env.wallets) envWalletsById.set(w.id, w)
  const walletsToAdd = [...envWalletsById.values()].filter((w) => !currentWalletIds.has(w.id))

  const currentCommitmentIds = new Set(current.commitments.map((c) => c.id))
  const envCommitmentsById = new Map<string, Commitment>()
  for (const c of env.commitments ?? []) envCommitmentsById.set(c.id, c)
  const commitmentsToAdd = [...envCommitmentsById.values()].filter(
    (c) => !currentCommitmentIds.has(c.id)
  )

  // "No dedup" (spec §9.2): every transaction in the file becomes a new row,
  // deleted or not. dayKey is recomputed under the LOCAL dayStartHour — the
  // file may have been produced on a device with a different setting, and
  // trusting its stored dayKey would violate spec §5.1's "dayKey always
  // derived from at + dayStartHour, recalculated on write".
  const transactionsToAdd: Transaction[] = env.transactions.map((t) => ({
    ...t,
    id: newId(),
    dayKey: dayKeyOf(t.at, dayStartHour)
  }))

  return { walletsToAdd, commitmentsToAdd, transactionsToAdd }
}

export interface ReplacePlan {
  settings: Settings
  wallets: Wallet[]
  commitments: Commitment[]
  transactions: Transaction[]
}

/**
 * Pure planning function for Full replace mode. Restores the file's contents
 * verbatim (same ids, same deletedAt) — this mode's entire purpose is exact
 * restoration, not merging.
 */
export function planFullReplaceImport(env: BackupEnvelope): ReplacePlan {
  // Defends against a backup whose settings object is missing/malformed:
  // Dexie's settings table is keyed on `key`, so a row without it would be
  // unfindable by getSettings() and silently re-trigger onboarding.
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...env.settings,
    key: 'settings'
  }

  const walletsById = new Map<string, Wallet>()
  for (const w of env.wallets) walletsById.set(w.id, w)

  const commitmentsById = new Map<string, Commitment>()
  for (const c of env.commitments ?? []) commitmentsById.set(c.id, c)

  const transactionsById = new Map<string, Transaction>()
  for (const t of env.transactions) transactionsById.set(t.id, t)

  return {
    settings,
    wallets: [...walletsById.values()],
    commitments: [...commitmentsById.values()],
    transactions: [...transactionsById.values()]
  }
}

/** Merge mode: additive only, wrapped in one Dexie transaction for atomicity. */
export async function applyMergeImport(
  env: BackupEnvelope,
  dayStartHour: number
): Promise<{ importedCount: number }> {
  return db.transaction('rw', db.wallets, db.commitments, db.transactions, async () => {
    const [currentWallets, currentCommitments] = await Promise.all([
      db.wallets.toArray(),
      db.commitments.toArray()
    ])

    const plan = planMergeImport(
      env,
      { wallets: currentWallets, commitments: currentCommitments },
      dayStartHour,
      () => crypto.randomUUID()
    )

    if (plan.walletsToAdd.length > 0) await db.wallets.bulkAdd(plan.walletsToAdd)
    if (plan.commitmentsToAdd.length > 0) await db.commitments.bulkAdd(plan.commitmentsToAdd)
    if (plan.transactionsToAdd.length > 0) await db.transactions.bulkAdd(plan.transactionsToAdd)

    return { importedCount: plan.transactionsToAdd.length }
  })
}

/**
 * Full replace mode: clear everything, then restore verbatim. Wrapped in one
 * Dexie transaction so a mid-way failure can never leave the database emptied
 * without the replacement data — a financial app's one unforgivable failure
 * mode is losing records (spec §9).
 */
export async function applyFullReplaceImport(
  env: BackupEnvelope
): Promise<{ importedCount: number }> {
  // Computed before the transaction opens: this is a pure, synchronous
  // function, so there's no reason to hold the Dexie transaction open any
  // longer than the writes themselves need.
  const plan = planFullReplaceImport(env)

  return db.transaction('rw', db.settings, db.wallets, db.commitments, db.transactions, async () => {
    await Promise.all([
      db.transactions.clear(),
      db.wallets.clear(),
      db.commitments.clear(),
      db.settings.clear()
    ])

    await db.settings.put(plan.settings)
    // bulkPut, not bulkAdd: deliberately tolerant of a corrupted backup file
    // (already deduped by planFullReplaceImport above) rather than throwing
    // mid-restore and leaving the database cleared with nothing in it.
    if (plan.wallets.length > 0) await db.wallets.bulkPut(plan.wallets)
    if (plan.commitments.length > 0) await db.commitments.bulkPut(plan.commitments)
    if (plan.transactions.length > 0) await db.transactions.bulkPut(plan.transactions)

    return { importedCount: plan.transactions.length }
  })
}
