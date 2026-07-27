// stores/appState.svelte.ts — menyambungkan db ke domain (spec §6, arsitektur).
// Satu-satunya tempat di aplikasi yang tahu baik Dexie maupun domain/ murni.

import { db, type Settings, type Transaction, type Wallet } from '../db/schema'
import { getSettings, updateSettings as repoUpdateSettings } from '../db/repo/settings'
import { activeWallets, createWallet, saldoBelanja as computeSaldoBelanja } from '../db/repo/wallets'
import {
  addTransaction,
  allActiveTransactions,
  softDelete as repoSoftDelete,
  restore as repoRestore,
  topTags as repoTopTags,
  type NewTransactionInput
} from '../db/repo/transactions'
import { dayKeyOf } from '../domain/day'
import { cycleFor } from '../domain/cycle'
import { hitungJatah, type HasilJatah } from '../domain/allowance'
import { hitungRunway, type HasilRunway } from '../domain/runway'
import type { CycleResult } from '../domain/types'

class AppState {
  settings = $state<Settings | null>(null)
  wallets = $state<Wallet[]>([])
  transactions = $state<Transaction[]>([])
  loaded = $state(false)

  /**
   * Jam reaktif. `hariIni` TIDAK boleh membaca `Date.now()` langsung: itu bukan
   * $state, jadi tidak ada yang memicu hitung ulang saat hari berganti. Aplikasi
   * yang dibiarkan terbuka melewati tengah malam akan terus menampilkan sisa
   * jatah kemarin — kegagalan total terhadap K1, karena angka jangkar yang salah
   * lebih buruk daripada tidak ada angka.
   */
  private now = $state(Date.now())

  /**
   * Denyut jam. 30 detik sekali sudah cukup halus untuk pergantian hari, dan
   * `visibilitychange` menutup celah utama di ponsel: timer di tab yang
   * dilatarbelakangi dilambatkan atau dibekukan browser, jadi saat pemakai
   * kembali membuka aplikasi esok paginya, timer saja tidak bisa diandalkan.
   */
  startClock(): void {
    if (typeof window === 'undefined') return
    setInterval(() => {
      this.now = Date.now()
    }, 30_000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.now = Date.now()
    })
  }

  async load(): Promise<void> {
    const [settings, wallets, transactions] = await Promise.all([
      getSettings(),
      activeWallets(),
      allActiveTransactions()
    ])
    this.settings = settings
    this.wallets = wallets
    this.transactions = transactions
    this.loaded = true
  }

  get dayStartHour(): number {
    return this.settings?.dayStartHour ?? 0
  }

  get hariIni(): string {
    return dayKeyOf(this.now, this.dayStartHour)
  }

  get onboarded(): boolean {
    return this.settings?.startedAt !== null && this.settings?.startedAt !== undefined
  }

  get cycle(): CycleResult | null {
    if (!this.settings || !this.settings.startedAt) return null
    return cycleFor(this.hariIni, this.settings)
  }

  get saldoBelanja(): number {
    return computeSaldoBelanja(this.wallets, this.transactions)
  }

  get transaksiHariIni(): Transaction[] {
    const hari = this.hariIni
    return this.transactions.filter((t) => t.dayKey === hari)
  }

  /** Peta dayKey → total belanja diskresioner (out, commitmentId == null) hari itu. */
  get belanjaHarianMap(): Record<string, number> {
    const map: Record<string, number> = {}
    for (const t of this.transactions) {
      if (t.kind !== 'out' || t.commitmentId !== null) continue
      map[t.dayKey] = (map[t.dayKey] ?? 0) + t.amount
    }
    return map
  }

  /** Angka jangkar (spec §4.4). komitmenBelumDibayar = 0 — komitmen di luar cakupan MVP. */
  get jatah(): HasilJatah | null {
    const cycle = this.cycle
    if (!cycle) return null
    return hitungJatah({
      saldoBelanja: this.saldoBelanja,
      transaksiHariIni: this.transaksiHariIni.map((t) => ({
        kind: t.kind,
        amount: t.amount,
        commitmentId: t.commitmentId
      })),
      komitmenBelumDibayar: 0,
      endBuffer: this.settings?.endBuffer ?? 0,
      sisaHari: cycle.sisaHari
    })
  }

  /** Runway (spec §4.5). biayaKomitmenHarian = 0 — komitmen di luar cakupan MVP. */
  get runway(): HasilRunway | null {
    if (!this.settings || !this.settings.startedAt) return null
    return hitungRunway({
      hariIni: this.hariIni,
      startedAt: this.settings.startedAt,
      belanjaHarianMap: this.belanjaHarianMap,
      seedDailySpend: this.settings.seedDailySpend,
      saldoBelanja: this.saldoBelanja,
      biayaKomitmenHarian: 0
    })
  }

  get recentTransactions(): Transaction[] {
    return [...this.transactions].sort((a, b) => b.at - a.at).slice(0, 3)
  }

  transactionsGroupedByDay(): { dayKey: string; items: Transaction[] }[] {
    const groups = new Map<string, Transaction[]>()
    for (const t of [...this.transactions].sort((a, b) => b.at - a.at)) {
      const arr = groups.get(t.dayKey) ?? []
      arr.push(t)
      groups.set(t.dayKey, arr)
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayKey, items]) => ({ dayKey, items }))
  }

  async topTags(kind: Transaction['kind']): Promise<string[]> {
    return repoTopTags(kind, 5)
  }

  async simpanTransaksi(input: NewTransactionInput): Promise<Transaction> {
    const tx = await addTransaction(input, this.dayStartHour)
    await this.load()
    return tx
  }

  async hapusTransaksi(id: string): Promise<void> {
    await repoSoftDelete(id)
    await this.load()
  }

  async pulihkanTransaksi(id: string): Promise<void> {
    await repoRestore(id)
    await this.load()
  }

  async selesaikanOnboarding(input: {
    saldoAwal: number
    seedDailySpend: number
    cycleMode: 'monthly-day' | 'rolling'
    cycleAnchorDay: number
  }): Promise<void> {
    await createWallet({ name: 'CASH', kind: 'spendable', initialBalance: input.saldoAwal })
    // Harus memakai dayStartHour yang berlaku, bukan 0 yang dipaku. Kalau keduanya
    // berbeda, `hariSejakMulai = selisihHari(hariIni, startedAt)` bisa jadi negatif
    // di jam-jam awal hari, dan bobot ramp cold-start runway ikut negatif.
    const startedAt = dayKeyOf(Date.now(), this.dayStartHour)
    await repoUpdateSettings({
      seedDailySpend: input.seedDailySpend,
      cycleMode: input.cycleMode,
      cycleAnchorDay: input.cycleAnchorDay,
      cycleManualEnd: null,
      startedAt
    })
    await this.load()
  }
}

export const appState = new AppState()

void db // memastikan schema.ts dievaluasi (membuka koneksi) segera saat modul ini diimpor
