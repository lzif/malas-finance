// db/schema.ts — skema Dexie (spec §5.2). Ini satu-satunya tempat yang boleh
// tahu bahwa IndexedDB ada. domain/ tidak boleh mengimpor berkas ini.

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
  jatahTerlampaui: boolean
  belumMencatat: boolean
  ringkasanHarian: boolean
  rekapMingguan: boolean
  jamHarian: number
  jamBelumMencatat: number
  hariRekap: number
  jamRekap: number
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
  jatahTerlampaui: false,
  belumMencatat: false,
  ringkasanHarian: false,
  rekapMingguan: false,
  jamHarian: 21,
  jamBelumMencatat: 20,
  hariRekap: 0,
  jamRekap: 20
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
