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
 * dayKeyOf(at, dayStartHour) — the local calendar day containing epoch ms
 * `at`, shifted by `dayStartHour` (0..6) so that a midnight snack counts as
 * "yesterday" when dayStartHour > 0. (spec §4.1)
 */
export function dayKeyOf(at: number, dayStartHour: number): string {
  const shifted = new Date(at - dayStartHour * 3_600_000)
  return formatDayKey(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate())
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

/** All dayKeys from `start` to `end`, inclusive of both ends. */
export function dayRange(start: string, end: string): string[] {
  const n = daysBetween(end, start)
  if (n < 0) return []
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}

/**
 * Day of week for a dayKey, JS `Date#getDay()` convention: 0 = Sunday .. 6 =
 * Saturday. Computed from the UTC calendar date the key already names (see
 * `utcMidnightOf`), so it does not depend on the caller's local timezone —
 * only on which calendar date the string spells out (spec §8.2, weekly
 * recap "opened on Saturday or Sunday").
 */
export function weekdayOf(dayKey: string): number {
  return new Date(utcMidnightOf(dayKey)).getUTCDay()
}
