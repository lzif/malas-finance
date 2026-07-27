// stores/appState.svelte.ts — connects db to domain (spec §6, architecture).
// The only place in the app that knows about both Dexie and pure domain/.

import { db, type Settings, type Transaction, type Wallet } from '../db/schema'
import { getSettings, updateSettings as repoUpdateSettings } from '../db/repo/settings'
import { activeWallets, createWallet, spendableBalance as computeSpendableBalance } from '../db/repo/wallets'
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
import { computeAllowance, type AllowanceResult } from '../domain/allowance'
import { computeRunway, type RunwayResult } from '../domain/runway'
import type { CycleResult } from '../domain/types'

class AppState {
  settings = $state<Settings | null>(null)
  wallets = $state<Wallet[]>([])
  transactions = $state<Transaction[]>([])
  loaded = $state(false)

  /**
   * Reactive clock. `today` MUST NOT read `Date.now()` directly: that isn't
   * $state, so nothing triggers a recompute when the day rolls over. An app
   * left open past midnight would keep showing yesterday's remaining
   * allowance — a total failure of K1, since a wrong anchor number is worse
   * than no number at all.
   */
  private now = $state(Date.now())

  /**
   * Clock tick. Once every 30 seconds is smooth enough for a day rollover,
   * and `visibilitychange` closes the main gap on phones: a timer in a
   * backgrounded tab gets throttled or frozen by the browser, so when the
   * user reopens the app the next morning, the timer alone can't be trusted.
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

  get today(): string {
    return dayKeyOf(this.now, this.dayStartHour)
  }

  get onboarded(): boolean {
    return this.settings?.startedAt !== null && this.settings?.startedAt !== undefined
  }

  get cycle(): CycleResult | null {
    if (!this.settings || !this.settings.startedAt) return null
    return cycleFor(this.today, this.settings)
  }

  get spendableBalance(): number {
    return computeSpendableBalance(this.wallets, this.transactions)
  }

  get transactionsToday(): Transaction[] {
    const day = this.today
    return this.transactions.filter((t) => t.dayKey === day)
  }

  /** Map of dayKey → total discretionary spend (out, commitmentId == null) for that day. */
  get dailySpendMap(): Record<string, number> {
    const map: Record<string, number> = {}
    for (const t of this.transactions) {
      if (t.kind !== 'out' || t.commitmentId !== null) continue
      map[t.dayKey] = (map[t.dayKey] ?? 0) + t.amount
    }
    return map
  }

  /** Anchor number (spec §4.4). unpaidCommitments = 0 — commitments are out of MVP scope. */
  get allowance(): AllowanceResult | null {
    const cycle = this.cycle
    if (!cycle) return null
    return computeAllowance({
      spendableBalance: this.spendableBalance,
      transactionsToday: this.transactionsToday.map((t) => ({
        kind: t.kind,
        amount: t.amount,
        commitmentId: t.commitmentId
      })),
      unpaidCommitments: 0,
      endBuffer: this.settings?.endBuffer ?? 0,
      daysRemaining: cycle.daysRemaining
    })
  }

  /** Runway (spec §4.5). dailyCommitmentCost = 0 — commitments are out of MVP scope. */
  get runway(): RunwayResult | null {
    if (!this.settings || !this.settings.startedAt) return null
    return computeRunway({
      today: this.today,
      startedAt: this.settings.startedAt,
      dailySpendMap: this.dailySpendMap,
      seedDailySpend: this.settings.seedDailySpend,
      spendableBalance: this.spendableBalance,
      dailyCommitmentCost: 0
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

  async saveTransaction(input: NewTransactionInput): Promise<Transaction> {
    const tx = await addTransaction(input, this.dayStartHour)
    await this.load()
    return tx
  }

  async deleteTransaction(id: string): Promise<void> {
    await repoSoftDelete(id)
    await this.load()
  }

  async restoreTransaction(id: string): Promise<void> {
    await repoRestore(id)
    await this.load()
  }

  async completeOnboarding(input: {
    initialBalance: number
    seedDailySpend: number
    cycleMode: 'monthly-day' | 'rolling'
    cycleAnchorDay: number
  }): Promise<void> {
    await createWallet({ name: 'CASH', kind: 'spendable', initialBalance: input.initialBalance })
    // Must use the effective dayStartHour, not a hardcoded 0. If the two
    // differ, `daysSinceStart = daysBetween(today, startedAt)` could go
    // negative in the early hours of the day, and the runway cold-start
    // ramp weight would go negative with it.
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

void db // ensures schema.ts is evaluated (opens the connection) as soon as this module is imported
