// db/autoBackup.ts — automatic local backups (spec §9.1).
//
// A finance app has exactly one unforgivable failure mode: losing records.
// IndexedDB inside a browser is durable in practice but not guaranteed — the
// browser may evict it under storage pressure. Backup therefore ships in
// Phase 1, not at the end: launching data entry before any backup exists is
// the wrong order.
//
// Capacitor's Filesystem plugin is not in scope yet, so snapshots are written
// to localStorage, which has a separate eviction policy from IndexedDB. That
// is meaningful redundancy, not a full answer — §9.1's filesystem and shared
// Documents copies still belong to a later phase.

import { db } from './schema'
import { serializeBackup, parseBackup, type BackupEnvelope } from './backup'

const DAILY_PREFIX = 'malasfinance.backup.day.'
const KEEP_DAILY = 7
const DEBOUNCE_MS = 30_000

export interface BackupStatus {
  lastBackupAt: number | null
  dailyCount: number
  stale: boolean
  /** Set when the last attempt threw — almost always an exhausted quota. */
  lastError: string | null
}

/**
 * Remembered across calls so a silent failure cannot stay silent. Swallowing
 * the exception keeps the user able to record transactions; discarding the
 * fact that it happened is what would lose their data.
 */
let lastError: string | null = null

/**
 * Read all four tables inside ONE Dexie read transaction. Four independent
 * reads can interleave with a concurrent write and produce a snapshot that is
 * internally inconsistent — a transaction referencing a wallet the snapshot
 * does not contain. A backup that restores to a broken state is worse than an
 * obviously missing one.
 */
async function snapshot(appVersion: string): Promise<string> {
  const [settings, wallets, commitments, transactions] = await db.transaction(
    'r',
    db.settings,
    db.wallets,
    db.commitments,
    db.transactions,
    async () =>
      Promise.all([
        db.settings.get('settings'),
        db.wallets.toArray(),
        db.commitments.toArray(),
        db.transactions.toArray()
      ])
  )
  if (!settings) throw new Error('settings row missing')
  return serializeBackup({ settings, wallets, commitments, transactions, appVersion })
}

function dailyKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(DAILY_PREFIX)) keys.push(k)
  }
  return keys.sort()
}

/** Keep the newest KEEP_DAILY dated snapshots, drop the rest. */
function rotate(): void {
  const keys = dailyKeys()
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAILY))) {
    localStorage.removeItem(k)
  }
}

/**
 * Write a snapshot now. Quota failures are swallowed deliberately: a backup
 * that cannot be written must never block the user from recording a
 * transaction. Status is surfaced instead via backupStatus().
 */
export async function backupNow(appVersion: string, todayKey: string): Promise<boolean> {
  try {
    const json = await snapshot(appVersion)
    // Rotate BEFORE writing so an exhausted quota has a chance to free space,
    // and store only the dated snapshot: LATEST_KEY used to hold a duplicate of
    // today's copy, doubling the space every backup consumed.
    rotate()
    localStorage.setItem(DAILY_PREFIX + todayKey, json)
    lastError = null
    return true
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    return false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced: a burst of edits produces one snapshot, 30s after the last one.
 * `onSettled` lets the caller refresh whatever surfaces the status, so a
 * failure reaches the screen instead of being dropped on the floor.
 */
export function scheduleBackup(
  appVersion: string,
  todayKey: string,
  onSettled?: () => void
): void {
  if (typeof localStorage === 'undefined') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void backupNow(appVersion, todayKey).then(() => onSettled?.())
  }, DEBOUNCE_MS)
}

/**
 * Walks the dated snapshots newest-first and reports the first one that still
 * parses. Checking only a single "latest" key would report "never backed up"
 * whenever that one key was truncated, even with six good snapshots beside it.
 */
export function latestBackup(): BackupEnvelope | null {
  if (typeof localStorage === 'undefined') return null
  for (const key of dailyKeys().reverse()) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    const parsed = parseBackup(raw)
    if (parsed.ok) return parsed.data
  }
  return null
}

export function backupStatus(): BackupStatus {
  if (typeof localStorage === 'undefined') {
    return { lastBackupAt: null, dailyCount: 0, stale: true, lastError }
  }
  const latest = latestBackup()
  const lastBackupAt = latest ? latest.exportedAt : null
  const stale = lastBackupAt === null || Date.now() - lastBackupAt > 3 * 86_400_000
  return { lastBackupAt, dailyCount: dailyKeys().length, stale, lastError }
}

/** Manual export: hand the user a downloadable file. */
export async function downloadBackup(appVersion: string): Promise<void> {
  const json = await snapshot(appVersion)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `malasfinance-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  // Revoking synchronously cancels the download on browsers that start it
  // asynchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
