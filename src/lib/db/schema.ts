// db/schema.ts — Dexie schema (spec §5.2). The only place allowed to know
// IndexedDB exists. domain/ must not import this file.

import Dexie, { type Table } from 'dexie'
import type { Kind } from '../domain/types'

export type Intent = 'planned' | 'routine' | 'impulse' | 'emergency'

export interface Transaction {
  id: string
  kind: Kind
  amount: number
  intent: Intent | null
  tag: string | null
  note: string | null
  walletId: string
  toWalletId: string | null
  commitmentId: string | null
  at: number
  dayKey: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Wallet {
  id: string
  name: string
  kind: 'spendable' | 'reserve'
  initialBalance: number
  archived: boolean
  order: number
}

export interface Commitment {
  id: string
  name: string
  amount: number
  kind: 'bill' | 'saving'
  dueDay: number
  walletId: string | null
  active: boolean
}

export interface NotifSettings {
  allowanceExceeded: boolean
  noEntryReminder: boolean
  dailySummary: boolean
  weeklyRecap: boolean
  dailySummaryHour: number
  noEntryReminderHour: number
  weeklyRecapDay: number
  weeklyRecapHour: number
}

export interface Settings {
  key: 'settings'
  cycleMode: 'monthly-day' | 'manual' | 'rolling'
  cycleAnchorDay: number
  cycleManualEnd: string | null
  endBuffer: number
  dayStartHour: number
  seedDailySpend: number
  startedAt: string | null
  notif: NotifSettings
  bigDeleteThreshold: number
  schemaVersion: number
}

export const DEFAULT_NOTIF: NotifSettings = {
  allowanceExceeded: false,
  noEntryReminder: false,
  dailySummary: false,
  weeklyRecap: false,
  dailySummaryHour: 21,
  noEntryReminderHour: 20,
  weeklyRecapDay: 0,
  weeklyRecapHour: 20
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  cycleMode: 'monthly-day',
  cycleAnchorDay: 1,
  cycleManualEnd: null,
  endBuffer: 0,
  dayStartHour: 0,
  seedDailySpend: 0,
  startedAt: null,
  notif: DEFAULT_NOTIF,
  bigDeleteThreshold: 1_000_000,
  schemaVersion: 1
}

export class MalasFinanceDB extends Dexie {
  transactions!: Table<Transaction, string>
  wallets!: Table<Wallet, string>
  commitments!: Table<Commitment, string>
  settings!: Table<Settings, string>

  constructor() {
    super('malas-finance')
    this.version(1).stores({
      transactions: 'id, dayKey, kind, intent, walletId, toWalletId, commitmentId, deletedAt, at',
      wallets: 'id, order, archived',
      commitments: 'id, active, dueDay',
      settings: 'key'
    })
  }
}

export const db = new MalasFinanceDB()
