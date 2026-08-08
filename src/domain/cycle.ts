// domain/cycle.ts — income cycle boundaries. Pure functions. (spec §4.2)

import { addDays, clampDay, daysBetween, formatDayKey, parseDayKey } from './day.ts'
import type { CycleResult, CycleSettings } from './types.ts'

/**
 * cycleFor(today, settings) → { start, end, length, daysRemaining, status }
 *
 * Three modes:
 * - 'monthly-day': the cycle runs from `cycleAnchorDay` this month until the
 *   day before the same date next month. `cycleAnchorDay` is clamped to the
 *   last day of the month when that month is shorter (e.g. 31 in February).
 * - 'rolling': cycleEnd = today + 29, always a 30-day horizon, start = today.
 * - 'manual': cycleEnd = settings.cycleManualEnd. If that date has already
 *   passed, status becomes 'cycle-expired' and the app temporarily falls
 *   back to 'rolling' behavior so the anchor number is never empty.
 *
 * daysRemaining = max(1, daysBetween(end, today) + 1) — an absolute clamp
 * against division by zero on the last day of the cycle.
 */
export function cycleFor(today: string, settings: CycleSettings): CycleResult {
  if (settings.cycleMode === 'monthly-day') {
    const { start, end } = monthlyDayBounds(today, settings.cycleAnchorDay)
    return finish(today, start, end, 'active')
  }

  if (settings.cycleMode === 'manual') {
    const manualEnd = settings.cycleManualEnd
    const expired = manualEnd === null || daysBetween(manualEnd, today) < 0
    if (expired) {
      // Falls back to rolling behavior so the anchor number is never empty.
      return finish(today, today, addDays(today, 29), 'cycle-expired')
    }
    return finish(today, today, manualEnd, 'active')
  }

  // 'rolling': always a 30-day horizon.
  return finish(today, today, addDays(today, 29), 'active')
}

function monthlyDayBounds(today: string, cycleAnchorDay: number): { start: string; end: string } {
  const { year, month, day } = parseDayKey(today)
  const anchorThisMonth = clampDay(cycleAnchorDay, year, month)

  if (day >= anchorThisMonth) {
    const start = formatDayKey(year, month, anchorThisMonth)
    const { year: ny, month: nm } = nextMonth(year, month)
    const nextAnchor = clampDay(cycleAnchorDay, ny, nm)
    const end = addDays(formatDayKey(ny, nm, nextAnchor), -1)
    return { start, end }
  }

  const { year: py, month: pm } = prevMonth(year, month)
  const prevAnchor = clampDay(cycleAnchorDay, py, pm)
  const start = formatDayKey(py, pm, prevAnchor)
  const end = addDays(formatDayKey(year, month, anchorThisMonth), -1)
  return { start, end }
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function finish(
  today: string,
  start: string,
  end: string,
  status: CycleResult['status'],
): CycleResult {
  return {
    start,
    end,
    length: daysBetween(end, start) + 1,
    daysRemaining: Math.max(1, daysBetween(end, today) + 1),
    status,
  }
}
