// domain/cycle.ts — batas siklus penghasilan. Fungsi murni. (spec §4.2)

import { addDays, clampDay, formatDayKey, parseDayKey, selisihHari } from './day'
import type { CycleResult, CycleSettings } from './types'

/**
 * cycleFor(hariIni, settings) → { start, end, panjang, sisaHari, status }
 *
 * Tiga mode:
 * - 'monthly-day': siklus berjalan dari `cycleAnchorDay` bulan ini sampai
 *   sehari sebelum tanggal yang sama bulan depan. `cycleAnchorDay` dijepit ke
 *   hari terakhir bulan bila bulan itu lebih pendek (mis. 31 di Februari).
 * - 'rolling': cycleEnd = hariIni + 29, horizon 30 hari selalu, start = hariIni.
 * - 'manual': cycleEnd = settings.cycleManualEnd. Bila tanggal itu sudah
 *   lewat, status jadi 'cycle-expired' dan aplikasi sementara memakai
 *   perilaku 'rolling' supaya angka jangkar tidak pernah kosong.
 *
 * sisaHari = max(1, selisihHari(end, hariIni) + 1) — penjepitan mutlak
 * terhadap pembagian nol di hari terakhir siklus.
 */
export function cycleFor(hariIni: string, settings: CycleSettings): CycleResult {
  if (settings.cycleMode === 'monthly-day') {
    const { start, end } = monthlyDayBounds(hariIni, settings.cycleAnchorDay)
    return finish(hariIni, start, end, 'active')
  }

  if (settings.cycleMode === 'manual') {
    const manualEnd = settings.cycleManualEnd
    const expired = manualEnd === null || selisihHari(manualEnd, hariIni) < 0
    if (expired) {
      // Jatuh ke perilaku rolling supaya angka jangkar tidak pernah kosong.
      return finish(hariIni, hariIni, addDays(hariIni, 29), 'cycle-expired')
    }
    return finish(hariIni, hariIni, manualEnd, 'active')
  }

  // 'rolling': horizon 30 hari selalu.
  return finish(hariIni, hariIni, addDays(hariIni, 29), 'active')
}

function monthlyDayBounds(hariIni: string, cycleAnchorDay: number): { start: string; end: string } {
  const { year, month, day } = parseDayKey(hariIni)
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

function finish(hariIni: string, start: string, end: string, status: CycleResult['status']): CycleResult {
  return {
    start,
    end,
    panjang: selisihHari(end, start) + 1,
    sisaHari: Math.max(1, selisihHari(end, hariIni) + 1),
    status
  }
}
