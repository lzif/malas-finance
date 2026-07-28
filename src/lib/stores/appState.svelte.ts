// stores/appState.svelte.ts — connects db to domain (spec §6, architecture).
// The only place in the app that knows about both Dexie and pure domain/.

import { untrack } from 'svelte'
import { db, DEFAULT_NOTIF, type Commitment, type NotifSettings, type Settings, type Transaction, type Wallet } from '../db/schema'
import { backupNow, backupStatus, downloadBackup, scheduleBackup, type BackupStatus } from '../db/autoBackup'
import {
  notifyDiagnostics as readNotifyDiagnostics,
  refreshNotificationsOnOpen,
  touchNotifications,
  type NotifOpenInput
} from '../db/notifySchedule'
import { getSettings, updateSettings as repoUpdateSettings } from '../db/repo/settings'
import {
  activeWallets,
  createWallet,
  spendableBalance as computeSpendableBalance,
  walletBalance as computeWalletBalance
} from '../db/repo/wallets'
import { addCommitment, allCommitments, deactivateCommitment, type NewCommitmentInput } from '../db/repo/commitments'
import {
  addTransaction,
  allActiveTransactions,
  softDelete as repoSoftDelete,
  restore as repoRestore,
  trashedTransactions as repoTrashedTransactions,
  permanentDelete as repoPermanentDelete,
  topTags as repoTopTags,
  type NewTransactionInput
} from '../db/repo/transactions'
import { dayKeyOf, daysBetween, weekdayOf } from '../domain/day'
import { cycleFor } from '../domain/cycle'
import { computeAllowance, projectedTomorrowAllowance, type AllowanceResult } from '../domain/allowance'
import { settlingKind, unpaidCommitments as computeUnpaidCommitments } from '../domain/commitment'
import { computeRunway, computeTotalDailyCost, type RunwayResult } from '../domain/runway'
import { impulseAmount, impulseRunwayDays } from '../domain/impulse'
import { computeWeekComparison } from '../domain/weekComparison'
import { getNotifier } from '../notify'
import { todayBannerMessage, type NotifyMessage } from '../notify/messages'
import type { CycleResult } from '../domain/types'

class AppState {
  settings = $state<Settings | null>(null)
  wallets = $state<Wallet[]>([])
  transactions = $state<Transaction[]>([])
  commitments = $state<Commitment[]>([])
  loaded = $state(false)

  /**
   * Trashed entries, loaded only when the Trash tab is opened — unlike
   * `transactions`, this never feeds a formula, so it has no reason to be
   * kept warm on every load().
   */
  trash = $state<Transaction[]>([])

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
    return computeUnpaidCommitments(
      this.commitments,
      this.transactions,
      cycle.start,
      cycle.end
    )
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
    const allowance = this.allowance
    if (!cycle || !allowance) return null
    // On the last day of the cycle, "tomorrow" belongs to the next cycle with a
    // fresh balance and a fresh commitment set. Any figure here would be a
    // guess dressed as a fact.
    if (cycle.daysRemaining <= 1) return null
    const projected = projectedTomorrowAllowance({
      spendableBalance: this.spendableBalance,
      unpaidCommitments: this.unpaidCommitments,
      endBuffer: this.settings?.endBuffer ?? 0,
      daysRemaining: cycle.daysRemaining
    })
    // The line reads "jatah besok turun jadi X". If X is not lower, saying so
    // is simply false, so show nothing.
    return projected < allowance.allowanceToday ? projected : null
  }

  /**
   * Same projection as `tomorrowAllowance`, but WITHOUT the "only if lower"
   * filter — the daily-summary notification and its banner counterpart
   * (spec §8.1, "Jatah besok Rp 120.000") state tomorrow's allowance
   * plainly, they do not require it to be a decrease.
   */
  private get rawTomorrowAllowance(): number | null {
    const cycle = this.cycle
    if (!cycle || cycle.daysRemaining <= 1) return null
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

  /** The four notification toggles + timing (spec §7.4, §8.1). Falls back to all-off. */
  get notifSettings(): NotifSettings {
    return this.settings?.notif ?? DEFAULT_NOTIF
  }

  /**
   * Home-screen "today" banner (spec §8.4) — the exact sentence a
   * notification would send, built from the SAME functions in
   * notify/messages.ts so wording can never drift from what actually gets
   * scheduled. Priority: an exceeded allowance outranks "no records yet",
   * which outranks the plain daily summary. The weekly recap has no daily
   * "today" banner slot — it belongs to the (Phase 2, not yet built) Sadar
   * dashboard, see TODO.md.
   */
  get todayBanner(): NotifyMessage | null {
    const allowance = this.allowance
    if (!allowance) return null
    if (allowance.status === 'lewat') {
      return todayBannerMessage({
        kind: 'exceeded',
        overspend: -allowance.remainingAllowance,
        tomorrowAllowance: this.tomorrowAllowance
      })
    }
    if (this.transactionsToday.length === 0) {
      return todayBannerMessage({ kind: 'noRecords' })
    }
    return todayBannerMessage({
      kind: 'summary',
      spentToday: allowance.spentToday,
      tomorrowAllowance: this.rawTomorrowAllowance
    })
  }

  /** Settings diagnostics (spec §8.5): when notifications were last (re)scheduled. */
  get notifyDiagnostics(): { lastScheduledAt: number | null } {
    return readNotifyDiagnostics()
  }

  /**
   * Assembles the plain data bag notify/schedule.ts's pure functions need,
   * from whatever appState already has loaded/computed. Keeps notify/ itself
   * free of Dexie/Svelte (architecture, spec §6.1) — this is the one place
   * that bridges the two, mirroring how this class is already "the only
   * module that knows about both Dexie and domain/".
   */
  private buildNotifInput(): NotifOpenInput {
    const cycle = this.cycle
    const allowance = this.allowance
    const isExceeded = allowance?.status === 'lewat'
    const overspend = isExceeded ? -allowance!.remainingAllowance : 0

    const startedAt = this.settings?.startedAt ?? null
    const daysSinceStart = startedAt ? daysBetween(this.today, startedAt) : 0
    const weekComparison = computeWeekComparison(this.dailySpendMap, this.today, daysSinceStart)
    const comparison = weekComparison && weekComparison.percentChange !== null
      ? { percentChange: weekComparison.percentChange }
      : null

    const impulseTxs = this.transactions.map((t) => ({
      kind: t.kind,
      intent: t.intent,
      commitmentId: t.commitmentId,
      dayKey: t.dayKey,
      amount: t.amount
    }))
    const impulseAmountRp = cycle ? impulseAmount(impulseTxs, cycle.start, this.today) : 0
    const totalDailyCost = startedAt
      ? computeTotalDailyCost({
          today: this.today,
          startedAt,
          dailySpendMap: this.dailySpendMap,
          seedDailySpend: this.settings?.seedDailySpend ?? 0,
          dailyCommitmentCost: this.dailyCommitmentCost
        }).totalDailyCost
      : 0

    return {
      notif: this.notifSettings,
      today: this.today,
      nowMs: Date.now(),
      hasRecordToday: this.transactionsToday.length > 0,
      spentToday: allowance?.spentToday ?? 0,
      tomorrowAllowanceRaw: this.rawTomorrowAllowance,
      isExceeded,
      overspend,
      tomorrowAllowanceIfLower: this.tomorrowAllowance,
      todayWeekday: weekdayOf(this.today),
      comparison,
      impulseAmountRp,
      impulseDays: impulseRunwayDays(impulseAmountRp, totalDailyCost)
    }
  }

  /**
   * Called once when the app opens, after the first successful load() (spec
   * §8.5 — reschedule everything so an OS-level cancellation, reboot, or OEM
   * kill recovers automatically). A no-op before onboarding, since there is
   * no cycle/allowance to notify about yet.
   */
  async initNotifications(): Promise<void> {
    if (!this.onboarded) return
    await refreshNotificationsOnOpen(this.buildNotifInput())
  }

  /** Onboarding screen 4 and Settings both go through this (spec §7.5, §8.5). */
  async requestNotificationPermission(): Promise<boolean> {
    return getNotifier().requestPermission()
  }

  /** Settings toggle (spec §7.4) — persists the patch, then reschedules to match immediately. */
  async updateNotifSetting(patch: Partial<NotifSettings>): Promise<void> {
    const current = this.notifSettings
    await repoUpdateSettings({ notif: { ...current, ...patch } })
    await this.load()
    await refreshNotificationsOnOpen(this.buildNotifInput())
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
    scheduleBackup(__APP_VERSION__, this.today, () => this.invalidateBackupStatus())
    if (this.onboarded) touchNotifications(this.buildNotifInput())
  }

  /**
   * Cached: backupStatus() parses the entire backup JSON, and this getter is
   * read from a $derived, so an uncached version re-parses megabytes on every
   * render that touches appState.
   */
  private backupStatusCache = $state<BackupStatus | null>(null)

  get backupStatus(): BackupStatus {
    if (this.backupStatusCache === null) {
      // Read from a $derived (Commitments.svelte) — Svelte 5 forbids writing
      // state as a side effect of a derived's evaluation, so the cache-fill
      // write is untracked. The read that follows still establishes the
      // normal reactive dependency on backupStatusCache.
      const computed = backupStatus()
      untrack(() => {
        this.backupStatusCache = computed
      })
      return computed
    }
    return this.backupStatusCache
  }

  private invalidateBackupStatus(): void {
    this.backupStatusCache = null
  }

  async backupNow(): Promise<boolean> {
    const ok = await backupNow(__APP_VERSION__, this.today)
    this.invalidateBackupStatus()
    return ok
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
    if (this.trash.length > 0) await this.loadTrash()
    this.touch()
  }

  /** Populates `trash`. Called when the Trash tab is opened, not on every load(). */
  async loadTrash(): Promise<void> {
    this.trash = await repoTrashedTransactions()
  }

  /** Bypasses soft-delete entirely — only reachable from the Trash tab (spec §9.4). */
  async permanentlyDeleteTransaction(id: string): Promise<void> {
    await repoPermanentDelete(id)
    await this.loadTrash()
  }

  /** Empties the whole trash. Always requires typed confirmation in the UI (spec §9.4). */
  async emptyTrash(): Promise<void> {
    await Promise.all(this.trash.map((t) => repoPermanentDelete(t.id)))
    await this.loadTrash()
  }

  async createCommitment(input: NewCommitmentInput): Promise<void> {
    await addCommitment(input)
    await this.load()
    this.touch()
  }

  async removeCommitment(id: string): Promise<void> {
    await deactivateCommitment(id)
    await this.load()
    this.touch()
  }

  /** Pay a commitment: one write, one table. Paid status is derived (spec §4.3). */
  async payCommitment(c: Commitment): Promise<void> {
    const kind = settlingKind(c)
    const source = this.wallets.find((w) => w.kind === 'spendable' && !w.archived)
    if (!source) throw new Error('no spendable wallet to pay from')

    if (kind === 'move') {
      // A saving commitment MOVES money to a reserve wallet. Recording it as an
      // `out` would destroy the money instead of setting it aside, defeating the
      // entire reason the `saving` kind exists (spec §4.3).
      const reserve = this.wallets.find((w) => w.kind === 'reserve' && !w.archived)
      if (!reserve) throw new Error('no reserve wallet to save into')
      await this.saveTransaction({
        kind: 'move',
        amount: c.amount,
        intent: null,
        tag: null,
        note: null,
        walletId: c.walletId ?? source.id,
        toWalletId: reserve.id,
        commitmentId: c.id
      })
      return
    }

    await this.saveTransaction({
      kind: 'out',
      amount: c.amount,
      intent: 'routine',
      tag: null,
      note: null,
      walletId: c.walletId ?? source.id,
      toWalletId: null,
      commitmentId: c.id
    })
  }

  /** Current balance of one wallet, from the loaded transaction set (spec §4.1). */
  walletBalance(wallet: Wallet): number {
    return computeWalletBalance(wallet, this.transactions)
  }

  /**
   * "sesuaikan saldo" (spec §7.4): the user reports what a wallet's balance
   * actually is, and the app records the difference as a visible correction
   * transaction — never a silent overwrite, since that would erase the
   * discrepancy the user most needs to see.
   */
  async adjustWalletBalance(walletId: string, actualBalance: number): Promise<void> {
    if (!Number.isInteger(actualBalance) || actualBalance < 0) {
      throw new Error('actualBalance must be a non-negative integer')
    }
    const wallet = this.wallets.find((w) => w.id === walletId)
    if (!wallet) throw new Error('wallet not found')

    const diff = actualBalance - computeWalletBalance(wallet, this.transactions)
    if (diff === 0) return

    // The repository requires intent iff kind === 'out' (§5.1) — that rule
    // outranks §7.4's flat "intent = 'routine'", which only ever anticipated
    // the downward (out) direction.
    await this.saveTransaction({
      kind: diff > 0 ? 'in' : 'out',
      amount: Math.abs(diff),
      intent: diff > 0 ? null : 'routine',
      tag: 'koreksi',
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: null
    })
  }

  async completeOnboarding(input: {
    initialBalance: number
    seedDailySpend: number
    cycleMode: 'monthly-day' | 'manual' | 'rolling'
    cycleAnchorDay: number
    cycleManualEnd: string | null
    /** Set only when onboarding screen 4's permission request was granted (spec §7.5, §8.5). */
    notif?: Partial<NotifSettings>
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
      cycleManualEnd: input.cycleManualEnd,
      startedAt,
      notif: input.notif ? { ...DEFAULT_NOTIF, ...input.notif } : DEFAULT_NOTIF
    })
    await this.load()
    await this.initNotifications()
  }
}

export const appState = new AppState()

void db // ensures schema.ts is evaluated (opens the connection) as soon as this module is imported
