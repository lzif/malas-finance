// domain/day.ts — hari kalender lokal dan aritmetika dayKey.
// Fungsi murni. TIDAK BOLEH mengimpor db/svelte/capacitor. (spec §6.1)
//
// `dayKey` adalah string 'YYYY-MM-DD'. Seluruh aritmetika tanggal di aplikasi
// ini bekerja di atas dayKey, bukan di atas epoch ms, supaya seluruh kelas
// bug zona waktu / DST hilang di akar (spec §4.1).

const MS_PER_DAY = 86_400_000

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Jumlah hari di bulan `month` (1..12) tahun `year`. */
export function daysInMonth(year: number, month: number): number {
  // Hari ke-0 bulan berikutnya == hari terakhir bulan ini.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Jepit `day` ke hari terakhir bulan bila melewatinya (mis. 31 di Februari). */
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
 * dayKeyOf(at, dayStartHour) — hari kalender lokal yang memuat epoch ms `at`,
 * digeser oleh `dayStartHour` (0..6) supaya jajan tengah malam masuk hitungan
 * "kemarin" bila dayStartHour > 0. (spec §4.1)
 */
export function dayKeyOf(at: number, dayStartHour: number): string {
  const shifted = new Date(at - dayStartHour * 3_600_000)
  return formatDayKey(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate())
}

/** Epoch ms UTC tengah-malam dari sebuah dayKey. Dipakai hanya untuk selisih hari. */
function utcMidnightOf(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return Date.UTC(year, month - 1, day)
}

/**
 * selisihHari(a, b) = floor((tanggalDari(a) − tanggalDari(b)) / 86_400_000)
 *
 * Kedua argumen adalah dayKey. selisihHari(x, x) === 0 secara definisi —
 * seluruh rumus siklus dan cold-start bergantung padanya (spec §4.1, U-01).
 */
export function selisihHari(a: string, b: string): number {
  return Math.floor((utcMidnightOf(a) - utcMidnightOf(b)) / MS_PER_DAY)
}

/** dayKey setelah menambah (atau mengurangi, bila negatif) `delta` hari. */
export function addDays(dayKey: string, delta: number): string {
  const { year, month, day } = parseDayKey(dayKey)
  const shifted = new Date(Date.UTC(year, month - 1, day + delta))
  return formatDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Seluruh dayKey dari `start` sampai `end`, inklusif kedua ujung. */
export function rentangHari(start: string, end: string): string[] {
  const n = selisihHari(end, start)
  if (n < 0) return []
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}
