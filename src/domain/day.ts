// domain/day.ts — local calendar day and dayKey arithmetic.
// Pure functions. MUST NOT import db/svelte/capacitor. (spec §6.1)
//
// `dayKey` is a 'YYYY-MM-DD' string. All date arithmetic in this app works on
// dayKey, not on epoch ms, so that the entire class of timezone/DST bugs
// disappears at the root (spec §4.1).

const MS_PER_DAY = 86_400_000

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Number of days in `month` (1..12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month == the last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Clamp `day` to the last day of the month if it overflows (e.g. 31 in February). */
export function clampDay(day: number, year: number, month: number): number {
  return Math.min(day, daysInMonth(year, month))
}

export function formatDayKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split('-').map(Number)
  return { year, month, day }
}

/**
 * The zone the user's calendar day is measured in. Hard-coded rather than read
 * from the `TZ` environment variable: the process timezone is invisible from
 * inside the app, and getting it wrong does not raise an error — it silently
 * files transactions against the wrong day. This is a single-user app for one
 * person in Jakarta (spec §8 schedules everything in WIB), so naming the zone
 * in code is both simpler and safer than depending on deployment config.
 *
 * If this ever needs to vary, promote it to a `timezone` column on `settings`
 * and pass it through the `timeZone` parameter below — which is why that
 * parameter exists rather than the constant being read directly.
 */
export const APP_TIME_ZONE = 'Asia/Jakarta'

/**
 * dayKeyOf(at, dayStartHour) — the calendar day containing epoch ms `at` *in
 * the user's timezone*, shifted by `dayStartHour` (0..6) so that a midnight
 * snack counts as "yesterday" when dayStartHour > 0. (spec §4.1)
 *
 * The zone is named explicitly instead of using Date's local-time accessors
 * (getFullYear/getMonth/getDate), which resolve against whatever timezone the
 * process happens to run in — UTC on Deno Deploy. Under that, everything
 * logged between 00:00 and 07:00 WIB was stamped with the previous day.
 */
export function dayKeyOf(at: number, dayStartHour: number, timeZone = APP_TIME_ZONE): string {
  const shifted = new Date(at - dayStartHour * 3_600_000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted)
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
  return formatDayKey(part('year'), part('month'), part('day'))
}

/** UTC midnight epoch ms of a dayKey. Used only for day differences. */
function utcMidnightOf(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return Date.UTC(year, month - 1, day)
}

/**
 * daysBetween(a, b) = floor((dateOf(a) − dateOf(b)) / 86_400_000)
 *
 * Both arguments are dayKeys. daysBetween(x, x) === 0 by definition — every
 * cycle and cold-start formula depends on this (spec §4.1, U-01).
 */
export function daysBetween(a: string, b: string): number {
  return Math.floor((utcMidnightOf(a) - utcMidnightOf(b)) / MS_PER_DAY)
}

/** dayKey after adding (or subtracting, if negative) `delta` days. */
export function addDays(dayKey: string, delta: number): string {
  const { year, month, day } = parseDayKey(dayKey)
  const shifted = new Date(Date.UTC(year, month - 1, day + delta))
  return formatDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/**
 * Day of week for a dayKey: 0 = Sunday … 6 = Saturday, matching
 * `Date.prototype.getUTCDay`.
 *
 * Computed from the dayKey's own calendar fields (via UTC), never from the
 * process clock — a dayKey already *is* a local calendar day, so reinterpreting
 * it in another zone would be the timezone bug this module exists to avoid.
 */
export function dayOfWeek(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * The next occurrence of `weekday` (0=Sun..6=Sat) strictly after `dayKey`.
 * Always 1..7 days ahead, so on the anchor day itself it returns next week's.
 */
export function nextWeekday(dayKey: string, weekday: number): string {
  const delta = ((weekday - dayOfWeek(dayKey) + 7) % 7) || 7
  return addDays(dayKey, delta)
}

/** All dayKeys from `start` to `end`, inclusive of both ends. */
export function dayRange(start: string, end: string): string[] {
  const n = daysBetween(end, start)
  if (n < 0) return []
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}
