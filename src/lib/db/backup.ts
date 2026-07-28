import type { Commitment, Settings, Transaction, Wallet } from './schema'

/** Current DB state to diff a backup against, for accurate "new X" preview counts (spec §9.2). */
export interface CurrentState {
  wallets: Wallet[]
  commitments: Commitment[]
}

/** Current supported backup schema version (spec §9.1). */
export const CURRENT_SCHEMA_VERSION = 1

/** Backup file envelope structure (spec §9.1). */
export interface BackupEnvelope {
  format: 'malasfinance-backup'
  schemaVersion: number
  appVersion: string
  exportedAt: number
  settings: Settings
  wallets: Wallet[]
  commitments: Commitment[]
  transactions: Transaction[]
}

export type ParseError =
  | 'invalid-json'
  | 'not-a-backup'
  | 'unsupported-version'
  | 'empty'

export type ParseResult =
  | { ok: true; data: BackupEnvelope }
  | { ok: false; reason: ParseError }

export interface SerializeBackupInput {
  settings: Settings
  wallets: Wallet[]
  commitments?: Commitment[]
  transactions: Transaction[]
  appVersion: string
}

export interface BackupPreview {
  count: number
  earliest: string | null
  latest: string | null
  totalIn: number
  totalOut: number
  walletCount: number
  /**
   * How many of env.wallets are not already present locally (matched by id).
   * Without a `current` argument to previewBackup, every wallet in the file
   * counts as "new" — the only answer computable without knowing local state
   * (see the `previewBackup.walletCount` entry in TODO.md's known-defects list,
   * which this field replaces now that the import UI exists to supply `current`).
   */
  newWalletCount: number
  /** Same idea as newWalletCount, for env.commitments. */
  newCommitmentCount: number
}

/**
 * Serializes application data into a JSON backup envelope (spec §9.1).
 *
 * Deleted transactions ARE included with their deletedAt timestamp — this is a full
 * backup snapshot, not a report export.
 */
export function serializeBackup(input: SerializeBackupInput): string {
  const envelope: BackupEnvelope = {
    format: 'malasfinance-backup',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: input.appVersion,
    exportedAt: Date.now(),
    settings: input.settings,
    wallets: input.wallets,
    commitments: input.commitments ?? [],
    transactions: input.transactions
  }
  return JSON.stringify(envelope, null, 2)
}

/**
 * Parses and validates a raw backup string (spec §9.1, §9.2).
 *
 * Returns a discriminated union indicating success with the parsed envelope,
 * or failure with a specific ParseError reason:
 * - 'invalid-json': String is not valid JSON.
 * - 'not-a-backup': Missing or incorrect `format` field or invalid structure.
 * - 'unsupported-version': `schemaVersion` outside the supported range (currently exactly 1).
 * - 'empty': Zero valid transactions in the backup.
 */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-a-backup' }
  }

  const obj = parsed as Record<string, unknown>

  if (obj.format !== 'malasfinance-backup') {
    return { ok: false, reason: 'not-a-backup' }
  }

  if (typeof obj.schemaVersion !== 'number') {
    return { ok: false, reason: 'not-a-backup' }
  }

  // Both directions. A version below 1 has no defined shape and no migration
  // path, and the casts further down would happily accept fields that mean
  // something else entirely.
  if (obj.schemaVersion > CURRENT_SCHEMA_VERSION || obj.schemaVersion < 1) {
    return { ok: false, reason: 'unsupported-version' }
  }

  if (!Array.isArray(obj.transactions)) {
    return { ok: false, reason: 'not-a-backup' }
  }

  if (obj.transactions.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  if (!obj.settings || typeof obj.settings !== 'object' || !Array.isArray(obj.wallets)) {
    return { ok: false, reason: 'not-a-backup' }
  }

  const envelope: BackupEnvelope = {
    format: 'malasfinance-backup',
    schemaVersion: obj.schemaVersion,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : '',
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
    settings: obj.settings as Settings,
    wallets: obj.wallets as Wallet[],
    commitments: (Array.isArray(obj.commitments) ? obj.commitments : []) as Commitment[],
    transactions: obj.transactions as Transaction[]
  }

  return { ok: true, data: envelope }
}

/**
 * Computes preview statistics for a backup envelope prior to import (spec §9.2).
 *
 * Counts only non-deleted transactions. Returns earliest and latest dayKey strings,
 * total income, total outgoing spend, and wallet count.
 */
export function previewBackup(env: BackupEnvelope, current?: CurrentState): BackupPreview {
  const walletCount = env.wallets?.length ?? 0
  const newWalletCount = current
    ? countNew(env.wallets, current.wallets)
    : walletCount
  const newCommitmentCount = current
    ? countNew(env.commitments ?? [], current.commitments)
    : (env.commitments ?? []).length

  const activeTx = (env.transactions ?? []).filter((t) => t.deletedAt === null)
  const count = activeTx.length

  if (count === 0) {
    return {
      count: 0,
      earliest: null,
      latest: null,
      totalIn: 0,
      totalOut: 0,
      walletCount,
      newWalletCount,
      newCommitmentCount
    }
  }

  let totalIn = 0
  let totalOut = 0
  const dayKeys: string[] = []

  for (const t of activeTx) {
    if (t.kind === 'in') {
      totalIn += t.amount
    } else if (t.kind === 'out') {
      totalOut += t.amount
    }
    if (t.dayKey) {
      dayKeys.push(t.dayKey)
    }
  }

  dayKeys.sort()
  const earliest = dayKeys.length > 0 ? dayKeys[0] : null
  const latest = dayKeys.length > 0 ? dayKeys[dayKeys.length - 1] : null

  return {
    count,
    earliest,
    latest,
    totalIn,
    totalOut,
    walletCount,
    newWalletCount,
    newCommitmentCount
  }
}

/**
 * Count of `incoming` rows whose `id` is not present in `existing` (matched
 * by id only). Dedupes `incoming` by id first — a corrupted file with two
 * rows sharing an id must report the same count here as the number of rows
 * planMergeImport will actually insert (it dedupes the same way), or the
 * preview shown before import would overstate what's about to happen.
 */
function countNew(
  incoming: { id: string }[] | undefined,
  existing: { id: string }[]
): number {
  const existingIds = new Set(existing.map((row) => row.id))
  const uniqueIncomingIds = new Set((incoming ?? []).map((row) => row.id))
  let count = 0
  for (const id of uniqueIncomingIds) {
    if (!existingIds.has(id)) count++
  }
  return count
}
