// notify/messages.ts — the exact sentences behind every notification (spec
// §8.1's catalog) AND the home-screen "today" banner (spec §8.4). Both call
// the SAME builder functions here so the banner can never drift from what a
// notification actually says — see AGENTS.md's "review is part of finishing"
// discipline: this file exists specifically so wording lives in one place.
//
// Pure functions only — formatRupiah is the only import, no db/Svelte/Capacitor.

import { formatRupiah } from '../domain/money'

export interface NotifyMessage {
  title: string
  body: string
}

/**
 * "Allowance exceeded" (spec §8.1, row 1) — foreground, fires immediately the
 * moment a transaction pushes today's status to 'lewat'.
 *
 * `tomorrowAllowance` must already be the "only if lower" value (the same
 * rule `appState.tomorrowAllowance` applies) — null omits the second
 * sentence rather than claim a drop that isn't real.
 */
export function allowanceExceededMessage(overspend: number, tomorrowAllowance: number | null): NotifyMessage {
  let body = `Jatah hari ini lewat ${formatRupiah(overspend)}.`
  if (tomorrowAllowance !== null) {
    body += ` Jatah besok turun jadi ${formatRupiah(tomorrowAllowance)}.`
  }
  return { title: 'Jatah harian', body }
}

/** "No records yet" (spec §8.1, row 2) — fixed text, no figures. */
export function noRecordsMessage(): NotifyMessage {
  return { title: 'Belum ada catatan', body: 'Belum ada catatan hari ini.' }
}

/**
 * "Daily summary" (spec §8.1, row 3) — rescheduled with the latest figures on
 * every write (spec §8.2). `tomorrowAllowance` here is the RAW projection
 * (`projectedTomorrowAllowance`, not the "only if lower" value) — the
 * example ("Jatah besok Rp 120.000") states tomorrow's allowance plainly,
 * it does not require it to be a decrease. null (last day of the cycle, no
 * "tomorrow" to project) omits the second sentence.
 */
export function dailySummaryMessage(spentToday: number, tomorrowAllowance: number | null): NotifyMessage {
  let body = `Hari ini habis ${formatRupiah(spentToday)}.`
  if (tomorrowAllowance !== null) {
    body += ` Jatah besok ${formatRupiah(tomorrowAllowance)}.`
  }
  return { title: 'Rekap hari ini', body }
}

/**
 * "Weekly recap" (spec §8.1, row 4) — computed and scheduled only when the
 * app is opened on Saturday or Sunday (spec §8.2), and only when
 * domain/weekComparison.ts's thin-data guard did not return null/no-percent
 * (the caller is responsible for not calling this otherwise — a wrong
 * notification is worse than a missing one, spec §4.7).
 *
 * `impulseDays` is `impulseRunwayDays()`'s result — null when totalDailyCost
 * is 0, in which case the sentence states the rupiah amount alone.
 */
export function weeklyMessage(percentChange: number, impulseAmountRp: number, impulseDays: number | null): NotifyMessage {
  const pct = Math.round(Math.abs(percentChange) * 100)
  const direction = percentChange >= 0 ? 'lebih boros' : 'lebih hemat'
  const impulsePart =
    impulseDays !== null
      ? `Impuls ${formatRupiah(impulseAmountRp)} = ${impulseDays} hari runway.`
      : `Impuls ${formatRupiah(impulseAmountRp)}.`
  return { title: 'Rekap mingguan', body: `Minggu ini ${pct}% ${direction}. ${impulsePart}` }
}

/**
 * The home-screen "today" banner (spec §8.4): whichever of the three
 * daily-scoped notifications is most relevant right now, rendered with the
 * exact same builder used for the real notification. Priority: an already
 * (or about-to-be) exceeded allowance outranks "no records yet", which
 * outranks the plain daily summary.
 */
export type TodayBannerState =
  | { kind: 'exceeded'; overspend: number; tomorrowAllowance: number | null }
  | { kind: 'noRecords' }
  | { kind: 'summary'; spentToday: number; tomorrowAllowance: number | null }

export function todayBannerMessage(state: TodayBannerState): NotifyMessage {
  if (state.kind === 'exceeded') return allowanceExceededMessage(state.overspend, state.tomorrowAllowance)
  if (state.kind === 'noRecords') return noRecordsMessage()
  return dailySummaryMessage(state.spentToday, state.tomorrowAllowance)
}
