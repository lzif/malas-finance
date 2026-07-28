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

const LATEST_KEY = 'malasfinance.backup.latest'
const DAILY_PREFIX = 'malasfinance.backup.day.'
const KEEP_DAILY = 7
const DEBOUNCE_MS = 30_000

export interface BackupStatus {
  lastBackupAt: number | null
  dailyCount: number
  stale: boolean
}

async function snapshot(appVersion: string): Promise<string> {
  const [settings, wallets, commitments, transactions] = await Promise.all([
    db.settings.get('settings'),
    db.wallets.toArray(),
    db.commitments.toArray(),
    db.transactions.toArray()
  ])
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
    localStorage.setItem(LATEST_KEY, json)
    localStorage.setItem(DAILY_PREFIX + todayKey, json)
    rotate()
    return true
  } catch {
    return false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced: a burst of edits produces one snapshot, 30s after the last one. */
export function scheduleBackup(appVersion: string, todayKey: string): void {
  if (typeof localStorage === 'undefined') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void backupNow(appVersion, todayKey)
  }, DEBOUNCE_MS)
}

export function backupStatus(): BackupStatus {
  if (typeof localStorage === 'undefined') {
    return { lastBackupAt: null, dailyCount: 0, stale: true }
  }
  const raw = localStorage.getItem(LATEST_KEY)
  if (!raw) return { lastBackupAt: null, dailyCount: dailyKeys().length, stale: true }
  const parsed = parseBackup(raw)
  const lastBackupAt = parsed.ok ? parsed.data.exportedAt : null
  const stale = lastBackupAt === null || Date.now() - lastBackupAt > 3 * 86_400_000
  return { lastBackupAt, dailyCount: dailyKeys().length, stale }
}

export function latestBackup(): BackupEnvelope | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(LATEST_KEY)
  if (!raw) return null
  const parsed = parseBackup(raw)
  return parsed.ok ? parsed.data : null
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
  URL.revokeObjectURL(url)
}
