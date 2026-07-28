// stores/appState.svelte.ts — connects db to domain (spec §6, architecture).
// The only place in the app that knows about both Dexie and pure domain/.

import { db, type Commitment, type Settings, type Transaction, type Wallet } from '../db/schema'
import { backupNow, backupStatus, downloadBackup, scheduleBackup, type BackupStatus } from '../db/autoBackup'
import { getSettings, updateSettings as repoUpdateSettings } from '../db/repo/settings'
import { activeWallets, createWallet, spendableBalance as computeSpendableBalance } from '../db/repo/wallets'
import { addCommitment, allCommitments, deactivateCommitment, type NewCommitmentInput } from '../db/repo/commitments'
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
import { computeAllowance, projectedTomorrowAllowance, type AllowanceResult } from '../domain/allowance'
import { unpaidCommitments as computeUnpaidCommitments } from '../domain/commitment'
import { computeRunway, type RunwayResult } from '../domain/runway'
import type { CycleResult } from '../domain/types'

class AppState {
  settings = $state<Settings | null>(null)
  wallets = $state<Wallet[]>([])
  transactions = $state<Transaction[]>([])
  commitments = $state<Commitment[]>([])
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

  /**
   * Generation counter guarding against concurrent loads. Every mutation calls
   * load(), so two rapid saves start two overlapping reads; whichever resolves
   * last would win regardless of which started last, and the anchor number
   * could end up missing the newest transaction. Each load claims a generation
   * and discards its own result if a newer load has started meanwhile.
   */
  private loadGeneration = 0

  async load(): Promise<void> {
    const generation = ++this.loadGeneration
    const [settings, wallets, transactions, commitments] = await Promise.all([
      getSettings(),
      activeWallets(),
      allActiveTransactions(),
      allCommitments()
    ])
    if (generation !== this.loadGeneration) return
    this.settings = settings
    this.wallets = wallets
    this.transactions = transactions
    this.commitments = commitments
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

  /** Σ of active commitments due in this cycle's window and not yet paid (spec §4.3). */
  get unpaidCommitments(): number {
    const cycle = this.cycle
    if (!cycle) return 0
    return computeUnpaidCommitments(this.commitments, this.transactions, this.today, cycle.end)
  }

  /** Per-day share of every active commitment across the cycle (spec §4.5). */
  get dailyCommitmentCost(): number {
    const cycle = this.cycle
    if (!cycle || cycle.length <= 0) return 0
    const total = this.commitments.filter((c) => c.active).reduce((sum, c) => sum + c.amount, 0)
    return total / cycle.length
  }

  /** Anchor number (spec §4.4). */
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
      unpaidCommitments: this.unpaidCommitments,
      endBuffer: this.settings?.endBuffer ?? 0,
      daysRemaining: cycle.daysRemaining
    })
  }

  /**
   * Third anti-habituation mechanism (spec §7.1): what today's overspending
   * costs tomorrow, stated outright rather than left for the user to infer.
   */
  get tomorrowAllowance(): number | null {
    const cycle = this.cycle
    if (!cycle) return null
    return projectedTomorrowAllowance({
      spendableBalance: this.spendableBalance,
      unpaidCommitments: this.unpaidCommitments,
      endBuffer: this.settings?.endBuffer ?? 0,
      daysRemaining: cycle.daysRemaining
    })
  }

  /** Runway (spec §4.5). */
  get runway(): RunwayResult | null {
    if (!this.settings || !this.settings.startedAt) return null
    return computeRunway({
      today: this.today,
      startedAt: this.settings.startedAt,
      dailySpendMap: this.dailySpendMap,
      seedDailySpend: this.settings.seedDailySpend,
      spendableBalance: this.spendableBalance,
      dailyCommitmentCost: this.dailyCommitmentCost
    })
  }

  /**
   * `allActiveTransactions()` already returns newest-first, so neither this
   * getter nor the grouping below needs to clone and re-sort the whole array
   * on every reactive read.
   */
  get recentTransactions(): Transaction[] {
    return this.transactions.slice(0, 3)
  }

  transactionsGroupedByDay(): { dayKey: string; items: Transaction[] }[] {
    const groups = new Map<string, Transaction[]>()
    for (const t of this.transactions) {
      const arr = groups.get(t.dayKey) ?? []
      arr.push(t)
      groups.set(t.dayKey, arr)
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayKey, items]) => ({ dayKey, items }))
  }

  async topTags(kind: Transaction['kind']): Promise<string[]> {
    return repoTopTags(kind, 5, this.today)
  }

  /** Every mutation schedules a debounced snapshot (spec §9.1). */
  private touch(): void {
    scheduleBackup(__APP_VERSION__, this.today)
  }

  get backupStatus(): BackupStatus {
    return backupStatus()
  }

  async backupNow(): Promise<boolean> {
    return backupNow(__APP_VERSION__, this.today)
  }

  async exportBackup(): Promise<void> {
    await downloadBackup(__APP_VERSION__)
  }

  async saveTransaction(input: NewTransactionInput): Promise<Transaction> {
    const tx = await addTransaction(input, this.dayStartHour)
    await this.load()
    this.touch()
    return tx
  }

  async deleteTransaction(id: string): Promise<void> {
    await repoSoftDelete(id)
    await this.load()
    this.touch()
  }

  async restoreTransaction(id: string): Promise<void> {
    await repoRestore(id)
    await this.load()
    this.touch()
  }

  async createCommitment(input: NewCommitmentInput): Promise<void> {
    await addCommitment(input)
    await this.load()
    this.touch()
  }

  async removeCommitment(id: string): Promise<void> {
    await deactivateCommitment(id)
    await this.load()
  }

  /** Pay a commitment: one write, one table. Paid status is derived (spec §4.3). */
  async payCommitment(c: Commitment): Promise<void> {
    const walletId = c.walletId ?? this.wallets[0]?.id
    if (!walletId) throw new Error('no wallet available to pay from')
    await this.saveTransaction({
      kind: 'out',
      amount: c.amount,
      intent: 'routine',
      tag: null,
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: c.id
    })
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
