// ui/formatTanggal.ts — format tanggal pendek untuk tampilan, mis. "25 Agu".
// Bukan bagian domain/ (murni kosmetik UI), tapi tidak bergantung pada db/svelte.

import { parseDayKey } from '../domain/day'

const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

export function formatTanggalPendek(dayKey: string): string {
  const { month, day } = parseDayKey(dayKey)
  return `${day} ${BULAN[month - 1]}`
}
