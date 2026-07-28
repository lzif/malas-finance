// notify/schedule.ts — scheduling/rescheduling logic (spec §8.1, §8.2, §8.5).
// Pure orchestration: takes a Notifier + plain data, no Dexie/localStorage
// import here — that is what makes it testable against MockNotifier under
// vitest without a device (spec §8.3). The localStorage-backed glue
// (debounce timer, "already fired today" persistence, last-scheduled
// diagnostic) lives in db/notifySchedule.ts, mirroring how db/autoBackup.ts
// owns the browser-global-touching half of the fsBackup pattern.

import { addDays, parseDayKey } from '../domain/day'
import { ID_ALLOWANCE_EXCEEDED, ID_DAILY_SUMMARY, ID_WEEKLY_RECAP, NO_RECORDS_DAYS_AHEAD, noRecordsId } from './ids'
import { allowanceExceededMessage, dailySummaryMessage, noRecordsMessage, weeklyMessage } from './messages'
import type { Notifier } from './Notifier'

/** Wall-clock Date for `hour`:00 local time on the calendar day `dayKey` names. */
export function atLocalTime(dayKey: string, hour: number): Date {
  const { year, month, day } = parseDayKey(dayKey)
  return new Date(year, month - 1, day, hour, 0, 0, 0)
}

export interface NotifSettingsLike {
  allowanceExceeded: boolean
  noEntryReminder: boolean
  dailySummary: boolean
  weeklyRecap: boolean
  dailySummaryHour: number
  noEntryReminderHour: number
  /** JS Date#getDay() convention: 0 = Sunday .. 6 = Saturday. */
  weeklyRecapDay: number
  weeklyRecapHour: number
}

/* ---- Daily summary — spec §8.2: rescheduled with latest figures on every
   write (debounced elsewhere), for TODAY's occurrence only. ---- */

export interface DailySummaryInput {
  today: string
  hour: number
  nowMs: number
  spentToday: number
  tomorrowAllowanceRaw: number | null
}

/**
 * Reschedules today's daily-summary notification with the latest figures.
 * Deliberately a no-op once the scheduled hour is already past — spec §8.2
 * accepts that a summary recorded after it fired is stale ("this is
 * acceptable"); re-firing it retroactively would make it wrong twice.
 */
export async function rescheduleDailySummary(notifier: Notifier, input: DailySummaryInput): Promise<void> {
  const at = atLocalTime(input.today, input.hour)
  if (at.getTime() <= input.nowMs) return
  const msg = dailySummaryMessage(input.spentToday, input.tomorrowAllowanceRaw)
  await notifier.schedule(ID_DAILY_SUMMARY, at, msg.title, msg.body)
}

/* ---- No records yet — spec §8.2: scheduled at day start, cancelled on the
   first transaction of the day; spec §8.5: pre-scheduled several days ahead
   so an app that isn't opened for a few days still reminds. Content never
   depends on figures, which is exactly what makes scheduling it ahead honest
   (unlike the daily summary or weekly recap, nothing here can go stale). ---- */

export interface NoRecordsInput {
  today: string
  hour: number
  nowMs: number
  /** true if today already has at least one transaction — its slot is skipped. */
  hasRecordToday: boolean
}

/** Cancels just today's "no records yet" slot — call the moment the first transaction of the day is saved. */
export async function cancelNoRecordsToday(notifier: Notifier): Promise<void> {
  await notifier.cancel(noRecordsId(0))
}

export async function scheduleNoRecordsAhead(notifier: Notifier, input: NoRecordsInput): Promise<void> {
  const msg = noRecordsMessage()
  for (let offset = 0; offset < NO_RECORDS_DAYS_AHEAD; offset++) {
    if (offset === 0 && input.hasRecordToday) continue
    const dayKey = addDays(input.today, offset)
    const at = atLocalTime(dayKey, input.hour)
    if (at.getTime() <= input.nowMs) continue
    await notifier.schedule(noRecordsId(offset), at, msg.title, msg.body)
  }
}

/* ---- Allowance exceeded — spec §8.1: foreground, fires immediately. ---- */

export interface ExceededInput {
  nowMs: number
  isExceeded: boolean
  overspend: number
  tomorrowAllowance: number | null
  /** true if this dayKey already fired the exceeded notification once. */
  alreadyFiredToday: boolean
}

/**
 * Fires the allowance-exceeded notification immediately, at most once per
 * day. Spec §8.1 does not state a de-dup rule explicitly; firing again on
 * every subsequent transaction past the threshold would spam the rest of
 * the day for no new information — a pinned detail (see spec.md). Returns
 * true iff it fired, so the caller can persist the "fired today" flag.
 */
export async function maybeFireAllowanceExceeded(notifier: Notifier, input: ExceededInput): Promise<boolean> {
  if (!input.isExceeded || input.alreadyFiredToday) return false
  const msg = allowanceExceededMessage(input.overspend, input.tomorrowAllowance)
  await notifier.schedule(ID_ALLOWANCE_EXCEEDED, new Date(input.nowMs), msg.title, msg.body)
  return true
}

/* ---- Weekly recap — spec §8.2: computed + scheduled only when opened on
   the recap day or the day before it (spec's literal example: Sat or Sun,
   for the default weeklyRecapDay = 0/Sunday). ---- */

export interface WeeklyInput {
  today: string
  hour: number
  recapDay: number
  nowMs: number
  /** JS Date#getDay() of `today`: 0 = Sunday .. 6 = Saturday. */
  todayWeekday: number
  /** null when domain/weekComparison.ts's thin-data guard applies, or its percentChange is null. */
  comparison: { percentChange: number } | null
  impulseAmountRp: number
  impulseDays: number | null
}

/**
 * Schedules the weekly recap for `recapDay` at `hour`:00, only when `today`
 * is that day or the day immediately before it, and only when there is
 * enough data for an honest percentage (spec §4.7's thin-data guard) — a
 * fabricated "NaN% lebih boros" is worse than no notification at all.
 */
export async function scheduleWeeklyIfWeekend(notifier: Notifier, input: WeeklyInput): Promise<void> {
  const dayBefore = (input.recapDay + 6) % 7
  const isRecapDay = input.todayWeekday === input.recapDay
  const isDayBefore = input.todayWeekday === dayBefore
  if ((!isRecapDay && !isDayBefore) || input.comparison === null) return

  const recapDayKey = isRecapDay ? input.today : addDays(input.today, 1)
  const at = atLocalTime(recapDayKey, input.hour)
  if (at.getTime() <= input.nowMs) return
  const msg = weeklyMessage(input.comparison.percentChange, input.impulseAmountRp, input.impulseDays)
  await notifier.schedule(ID_WEEKLY_RECAP, at, msg.title, msg.body)
}

/* ---- App-open refresh — spec §8.5: reschedule everything every time the
   app is opened, so an OS-level cancellation (reboot, OEM kill) recovers
   automatically. ---- */

export interface RefreshOnOpenInput {
  notif: NotifSettingsLike
  today: string
  nowMs: number
  hasRecordToday: boolean
  spentToday: number
  tomorrowAllowanceRaw: number | null
  isExceeded: boolean
  overspend: number
  tomorrowAllowanceIfLower: number | null
  alreadyFiredToday: boolean
  todayWeekday: number
  comparison: { percentChange: number } | null
  impulseAmountRp: number
  impulseDays: number | null
}

export interface RefreshOnOpenResult {
  exceededFired: boolean
}

/**
 * cancelAll() then reschedule everything enabled. Doing it this way — rather
 * than only rewriting future no-records slots — avoids a stale fixed id
 * meaning a different date tomorrow: `noRecordsId(3)` means "3 days from
 * whenever this last ran", so a partial reschedule can leave a previous
 * day's schedule sitting under an id that now names a different date.
 */
export async function refreshAllOnOpen(notifier: Notifier, input: RefreshOnOpenInput): Promise<RefreshOnOpenResult> {
  await notifier.cancelAll()

  let exceededFired = false
  if (input.notif.allowanceExceeded) {
    exceededFired = await maybeFireAllowanceExceeded(notifier, {
      nowMs: input.nowMs,
      isExceeded: input.isExceeded,
      overspend: input.overspend,
      tomorrowAllowance: input.tomorrowAllowanceIfLower,
      alreadyFiredToday: input.alreadyFiredToday
    })
  }

  if (input.notif.noEntryReminder) {
    await scheduleNoRecordsAhead(notifier, {
      today: input.today,
      hour: input.notif.noEntryReminderHour,
      nowMs: input.nowMs,
      hasRecordToday: input.hasRecordToday
    })
  }

  if (input.notif.dailySummary) {
    await rescheduleDailySummary(notifier, {
      today: input.today,
      hour: input.notif.dailySummaryHour,
      nowMs: input.nowMs,
      spentToday: input.spentToday,
      tomorrowAllowanceRaw: input.tomorrowAllowanceRaw
    })
  }

  if (input.notif.weeklyRecap) {
    await scheduleWeeklyIfWeekend(notifier, {
      today: input.today,
      hour: input.notif.weeklyRecapHour,
      recapDay: input.notif.weeklyRecapDay,
      nowMs: input.nowMs,
      todayWeekday: input.todayWeekday,
      comparison: input.comparison,
      impulseAmountRp: input.impulseAmountRp,
      impulseDays: input.impulseDays
    })
  }

  return { exceededFired }
}
