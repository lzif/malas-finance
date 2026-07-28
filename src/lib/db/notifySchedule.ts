// db/notifySchedule.ts — the localStorage-backed glue around notify/schedule.ts
// (spec §8.1, §8.2, §8.5), mirroring how db/autoBackup.ts owns the
// browser-global-touching half of the fsBackup pattern while the pure fan-out
// logic stays in fsBackup/ itself. notify/schedule.ts must stay
// Dexie/localStorage-free so it can be unit-tested against MockNotifier
// under vitest (node env, no localStorage) — this file is where that state
// actually lives.

import { getNotifier } from '../notify'
import {
  cancelNoRecordsToday,
  maybeFireAllowanceExceeded,
  refreshAllOnOpen,
  rescheduleDailySummary,
  type NotifSettingsLike,
  type RefreshOnOpenInput
} from '../notify/schedule'

const EXCEEDED_FIRED_ON_KEY = 'malasfinance.notif.exceededFiredOn'
const LAST_SCHEDULED_AT_KEY = 'malasfinance.notif.lastScheduledAt'

/** Debounce window for rescheduling the daily-summary notification on write (spec §8.2). */
const DEBOUNCE_MS = 5_000

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/**
 * dayKey the exceeded-allowance push last fired on, or null. At-most-once
 * per day, keyed only on the day: undo-then-re-exceed within the same day
 * (5s snackbar undo deletes the transaction that tripped it, a later one
 * trips it again) does NOT re-fire the push. Deliberate — spec §8.1 states
 * no de-dup rule at all, so this is the pinned interpretation (see spec.md).
 * The in-app "today" banner (§8.4) is unaffected: it recomputes live from
 * the current allowance on every render, so the safety-net principle still
 * holds even on a day where the push notification itself stays silent.
 */
function exceededFiredOn(): string | null {
  if (!hasLocalStorage()) return null
  return localStorage.getItem(EXCEEDED_FIRED_ON_KEY)
}

function markExceededFired(todayKey: string): void {
  if (!hasLocalStorage()) return
  localStorage.setItem(EXCEEDED_FIRED_ON_KEY, todayKey)
}

function markLastScheduled(nowMs: number): void {
  if (!hasLocalStorage()) return
  localStorage.setItem(LAST_SCHEDULED_AT_KEY, String(nowMs))
}

/** Diagnostic for Settings (spec §8.5): when notifications were last (re)scheduled. */
export function notifyDiagnostics(): { lastScheduledAt: number | null } {
  if (!hasLocalStorage()) return { lastScheduledAt: null }
  const raw = localStorage.getItem(LAST_SCHEDULED_AT_KEY)
  return { lastScheduledAt: raw ? Number(raw) : null }
}

export interface NotifWriteInput {
  notif: NotifSettingsLike
  today: string
  nowMs: number
  hasRecordToday: boolean
  spentToday: number
  tomorrowAllowanceRaw: number | null
  isExceeded: boolean
  overspend: number
  tomorrowAllowanceIfLower: number | null
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Cancels a pending debounced daily-summary reschedule, if one is queued.
 * Without this, `refreshNotificationsOnOpen` (Settings toggle, app reopen)
 * can run `cancelAll()` + reschedule, and THEN the still-pending timer from
 * an earlier `touchNotifications()` fires with its stale closed-over input —
 * concretely: record a transaction, then within 5s open Settings and turn
 * `dailySummary` off; without this clear, the old timer still fires and
 * reschedules the very notification the user just disabled.
 */
function clearPendingDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/**
 * Called on every write (spec §8.2 — allowance-exceeded and the "cancel on
 * first entry of the day" reaction must be immediate; the daily-summary
 * reschedule is debounced 5s so a burst of edits produces one reschedule,
 * not one per keystroke of saving).
 */
export function touchNotifications(input: NotifWriteInput): void {
  const notifier = getNotifier()

  // Immediate: cancelling today's "no records yet" reminder the moment the
  // first transaction of the day lands must not wait — a debounced cancel
  // could lose the race against the 20:00 alarm on a slow connection... in
  // practice this is a same-process call, but the point stands: there is no
  // reason to delay a cancellation.
  if (input.hasRecordToday) {
    void cancelNoRecordsToday(notifier)
  }

  // Immediate: "foreground, fires immediately" (spec §8.1) — a debounced
  // exceeded-allowance push would mean the user closes the app before it
  // ever fires.
  if (input.notif.allowanceExceeded && input.isExceeded && exceededFiredOn() !== input.today) {
    void maybeFireAllowanceExceeded(notifier, {
      nowMs: input.nowMs,
      isExceeded: input.isExceeded,
      overspend: input.overspend,
      tomorrowAllowance: input.tomorrowAllowanceIfLower,
      alreadyFiredToday: false
    }).then((fired) => {
      if (fired) {
        markExceededFired(input.today)
        markLastScheduled(input.nowMs)
      }
    })
  }

  // Debounced: the 21:00 (configurable) daily summary is rescheduled with
  // the latest figures (spec §8.2).
  if (!input.notif.dailySummary) return
  clearPendingDebounce()
  debounceTimer = setTimeout(() => {
    const now = Date.now()
    void rescheduleDailySummary(notifier, {
      today: input.today,
      hour: input.notif.dailySummaryHour,
      nowMs: now,
      spentToday: input.spentToday,
      tomorrowAllowanceRaw: input.tomorrowAllowanceRaw
    }).then(() => markLastScheduled(now))
  }, DEBOUNCE_MS)
}

export interface NotifOpenInput extends NotifWriteInput {
  todayWeekday: number
  comparison: { percentChange: number } | null
  impulseAmountRp: number
  impulseDays: number | null
}

/**
 * Called when the app opens, and again on every calendar-day rollover while
 * it stays open (spec §8.5 — reschedule everything, recover from OS kills).
 * Clears any pending debounced write-reschedule first — see
 * `clearPendingDebounce`'s doc comment for the race this closes.
 */
export async function refreshNotificationsOnOpen(input: NotifOpenInput): Promise<void> {
  clearPendingDebounce()
  const notifier = getNotifier()
  const refreshInput: RefreshOnOpenInput = {
    notif: input.notif,
    today: input.today,
    nowMs: input.nowMs,
    hasRecordToday: input.hasRecordToday,
    spentToday: input.spentToday,
    tomorrowAllowanceRaw: input.tomorrowAllowanceRaw,
    isExceeded: input.isExceeded,
    overspend: input.overspend,
    tomorrowAllowanceIfLower: input.tomorrowAllowanceIfLower,
    alreadyFiredToday: exceededFiredOn() === input.today,
    todayWeekday: input.todayWeekday,
    comparison: input.comparison,
    impulseAmountRp: input.impulseAmountRp,
    impulseDays: input.impulseDays
  }
  const result = await refreshAllOnOpen(notifier, refreshInput)
  if (result.exceededFired) markExceededFired(input.today)
  markLastScheduled(input.nowMs)
}
