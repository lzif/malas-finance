// domain/types.ts — tipe data murni dipakai lintas domain/. Tidak ada import.

export type CycleMode = 'monthly-day' | 'manual' | 'rolling'

export interface CycleSettings {
  cycleMode: CycleMode
  /** 1..31, dijepit ke akhir bulan bila perlu. Dipakai untuk mode 'monthly-day'. */
  cycleAnchorDay: number
  /** dayKey akhir siklus berikutnya, dipakai untuk mode 'manual'. */
  cycleManualEnd: string | null
}

export type CycleStatus = 'active' | 'cycle-expired'

export interface CycleResult {
  /** dayKey awal siklus. */
  start: string
  /** dayKey akhir siklus. */
  end: string
  /** panjang siklus dalam hari, inklusif kedua ujung. */
  panjang: number
  /** hari tersisa termasuk hari ini, minimal 1 (spec §4.2). */
  sisaHari: number
  status: CycleStatus
}

export type Kind = 'out' | 'in' | 'move'
