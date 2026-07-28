import { describe, expect, it } from 'vitest'
import { MockNotifier } from './mock'
import { ID_ALLOWANCE_EXCEEDED, ID_DAILY_SUMMARY, ID_WEEKLY_RECAP, noRecordsId } from './ids'
import {
  atLocalTime,
  cancelNoRecordsToday,
  maybeFireAllowanceExceeded,
  refreshAllOnOpen,
  rescheduleDailySummary,
  scheduleNoRecordsAhead,
  scheduleWeeklyIfWeekend,
  type NotifSettingsLike
} from './schedule'

const TODAY = '2026-07-15' // a Wednesday
const SATURDAY = '2026-07-18'
const SUNDAY = '2026-07-19'

function allEnabled(): NotifSettingsLike {
  return {
    allowanceExceeded: true,
    noEntryReminder: true,
    dailySummary: true,
    weeklyRecap: true,
    dailySummaryHour: 21,
    noEntryReminderHour: 20,
    weeklyRecapDay: 0,
    weeklyRecapHour: 20
  }
}

describe('rescheduleDailySummary', () => {
  it('schedules today at the configured hour with the latest figures', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 10).getTime() // 10:00, before the 21:00 slot
    await rescheduleDailySummary(notifier, { today: TODAY, hour: 21, nowMs, spentToday: 87_000, tomorrowAllowanceRaw: 120_000 })
    const scheduled = notifier.scheduled.get(ID_DAILY_SUMMARY)
    expect(scheduled).toBeDefined()
    expect(scheduled!.body).toBe('Hari ini habis Rp 87.000. Jatah besok Rp 120.000.')
    expect(scheduled!.at.getTime()).toBe(atLocalTime(TODAY, 21).getTime())
  })

  it('is a no-op once the scheduled hour has already passed today', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 22).getTime() // 22:00, past the 21:00 slot
    await rescheduleDailySummary(notifier, { today: TODAY, hour: 21, nowMs, spentToday: 87_000, tomorrowAllowanceRaw: 120_000 })
    expect(notifier.scheduled.size).toBe(0)
  })
})

describe('no-records scheduling', () => {
  it('cancelNoRecordsToday cancels only the day-0 slot', async () => {
    const notifier = new MockNotifier()
    notifier.scheduled.set(noRecordsId(0), { at: new Date(), title: 't', body: 'b' })
    notifier.scheduled.set(noRecordsId(1), { at: new Date(), title: 't', body: 'b' })
    await cancelNoRecordsToday(notifier)
    expect(notifier.scheduled.has(noRecordsId(0))).toBe(false)
    expect(notifier.scheduled.has(noRecordsId(1))).toBe(true)
  })

  it('schedules 7 days ahead, all with the identical fixed-text body', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 10).getTime()
    await scheduleNoRecordsAhead(notifier, { today: TODAY, hour: 20, nowMs, hasRecordToday: false })
    expect(notifier.scheduled.size).toBe(7)
    for (let offset = 0; offset < 7; offset++) {
      expect(notifier.scheduled.get(noRecordsId(offset))!.body).toBe('Belum ada catatan hari ini.')
    }
  })

  it('skips only today’s slot when today already has a record', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 10).getTime()
    await scheduleNoRecordsAhead(notifier, { today: TODAY, hour: 20, nowMs, hasRecordToday: true })
    expect(notifier.scheduled.has(noRecordsId(0))).toBe(false)
    expect(notifier.scheduled.size).toBe(6)
  })

  it('skips today’s slot when 20:00 has already passed, even with no record yet', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 21).getTime()
    await scheduleNoRecordsAhead(notifier, { today: TODAY, hour: 20, nowMs, hasRecordToday: false })
    expect(notifier.scheduled.has(noRecordsId(0))).toBe(false)
    expect(notifier.scheduled.size).toBe(6)
  })
})

describe('maybeFireAllowanceExceeded', () => {
  it('fires immediately with the latest overspend figures', async () => {
    const notifier = new MockNotifier()
    const nowMs = Date.now()
    const fired = await maybeFireAllowanceExceeded(notifier, {
      nowMs,
      isExceeded: true,
      overspend: 12_500,
      tomorrowAllowance: 33_100,
      alreadyFiredToday: false
    })
    expect(fired).toBe(true)
    const scheduled = notifier.scheduled.get(ID_ALLOWANCE_EXCEEDED)
    expect(scheduled!.body).toBe('Jatah hari ini lewat Rp 12.500. Jatah besok turun jadi Rp 33.100.')
    expect(scheduled!.at.getTime()).toBe(nowMs)
  })

  it('does not fire twice in the same day', async () => {
    const notifier = new MockNotifier()
    const fired = await maybeFireAllowanceExceeded(notifier, {
      nowMs: Date.now(),
      isExceeded: true,
      overspend: 12_500,
      tomorrowAllowance: null,
      alreadyFiredToday: true
    })
    expect(fired).toBe(false)
    expect(notifier.scheduled.size).toBe(0)
  })

  it('does not fire when the allowance is not exceeded', async () => {
    const notifier = new MockNotifier()
    const fired = await maybeFireAllowanceExceeded(notifier, {
      nowMs: Date.now(),
      isExceeded: false,
      overspend: 0,
      tomorrowAllowance: null,
      alreadyFiredToday: false
    })
    expect(fired).toBe(false)
  })
})

describe('scheduleWeeklyIfWeekend', () => {
  const comparison = { percentChange: 0.23 }

  it('schedules on Saturday for Sunday 20:00 (default recapDay = 0)', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(SATURDAY, 10).getTime()
    await scheduleWeeklyIfWeekend(notifier, {
      today: SATURDAY,
      hour: 20,
      recapDay: 0,
      nowMs,
      todayWeekday: 6,
      comparison,
      impulseAmountRp: 210_000,
      impulseDays: 4
    })
    const scheduled = notifier.scheduled.get(ID_WEEKLY_RECAP)
    expect(scheduled).toBeDefined()
    expect(scheduled!.at.getTime()).toBe(atLocalTime(SUNDAY, 20).getTime())
    expect(scheduled!.body).toBe('Minggu ini 23% lebih boros. Impuls Rp 210.000 = 4 hari runway.')
  })

  it('schedules on Sunday itself for that same day 20:00', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(SUNDAY, 10).getTime()
    await scheduleWeeklyIfWeekend(notifier, {
      today: SUNDAY,
      hour: 20,
      recapDay: 0,
      nowMs,
      todayWeekday: 0,
      comparison,
      impulseAmountRp: 210_000,
      impulseDays: 4
    })
    expect(notifier.scheduled.get(ID_WEEKLY_RECAP)!.at.getTime()).toBe(atLocalTime(SUNDAY, 20).getTime())
  })

  it('does nothing on a weekday', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 10).getTime()
    await scheduleWeeklyIfWeekend(notifier, {
      today: TODAY,
      hour: 20,
      recapDay: 0,
      nowMs,
      todayWeekday: 3,
      comparison,
      impulseAmountRp: 210_000,
      impulseDays: 4
    })
    expect(notifier.scheduled.size).toBe(0)
  })

  it('does nothing when there is not enough data for a percentage (thin-data guard)', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(SATURDAY, 10).getTime()
    await scheduleWeeklyIfWeekend(notifier, {
      today: SATURDAY,
      hour: 20,
      recapDay: 0,
      nowMs,
      todayWeekday: 6,
      comparison: null,
      impulseAmountRp: 0,
      impulseDays: null
    })
    expect(notifier.scheduled.size).toBe(0)
  })
})

describe('refreshAllOnOpen', () => {
  it('cancels everything first, then reschedules every enabled type', async () => {
    const notifier = new MockNotifier()
    // Pre-seed a stale schedule to prove cancelAll() actually runs first.
    notifier.scheduled.set(999, { at: new Date(), title: 'stale', body: 'stale' })
    const nowMs = atLocalTime(TODAY, 10).getTime()

    const result = await refreshAllOnOpen(notifier, {
      notif: allEnabled(),
      today: TODAY,
      nowMs,
      hasRecordToday: false,
      spentToday: 50_000,
      tomorrowAllowanceRaw: 100_000,
      isExceeded: true,
      overspend: 12_500,
      tomorrowAllowanceIfLower: 33_100,
      alreadyFiredToday: false,
      todayWeekday: 3, // Wednesday — weekly recap should NOT be scheduled
      comparison: { percentChange: 0.1 },
      impulseAmountRp: 10_000,
      impulseDays: 1
    })

    expect(result.exceededFired).toBe(true)
    expect(notifier.scheduled.has(999)).toBe(false) // stale entry gone
    expect(notifier.scheduled.has(ID_ALLOWANCE_EXCEEDED)).toBe(true)
    expect(notifier.scheduled.has(ID_DAILY_SUMMARY)).toBe(true)
    expect(notifier.scheduled.has(noRecordsId(0))).toBe(true)
    expect(notifier.scheduled.has(ID_WEEKLY_RECAP)).toBe(false) // not a weekend
  })

  it('skips every disabled notification type entirely', async () => {
    const notifier = new MockNotifier()
    const nowMs = atLocalTime(TODAY, 10).getTime()
    const off: NotifSettingsLike = {
      allowanceExceeded: false,
      noEntryReminder: false,
      dailySummary: false,
      weeklyRecap: false,
      dailySummaryHour: 21,
      noEntryReminderHour: 20,
      weeklyRecapDay: 0,
      weeklyRecapHour: 20
    }
    const result = await refreshAllOnOpen(notifier, {
      notif: off,
      today: TODAY,
      nowMs,
      hasRecordToday: false,
      spentToday: 50_000,
      tomorrowAllowanceRaw: 100_000,
      isExceeded: true,
      overspend: 12_500,
      tomorrowAllowanceIfLower: 33_100,
      alreadyFiredToday: false,
      todayWeekday: 6,
      comparison: { percentChange: 0.1 },
      impulseAmountRp: 10_000,
      impulseDays: 1
    })
    expect(result.exceededFired).toBe(false)
    expect(notifier.scheduled.size).toBe(0)
  })
})
