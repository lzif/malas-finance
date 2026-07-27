// domain/runway.ts — berapa lama saldo belanja bertahan pada laju sekarang.
// Fungsi murni. (spec §4.5)

import { addDays, selisihHari } from './day'

export interface HitungRunwayInput {
  hariIni: string
  /** dayKey hari pertama pemakaian aplikasi (settings.startedAt). */
  startedAt: string
  /**
   * Peta dayKey → total belanja diskresioner (out, commitmentId == null)
   * hari itu. Hari yang tidak ada di peta dihitung 0, bukan dilewati.
   */
  belanjaHarianMap: Record<string, number>
  /** Diisi saat onboarding: "sehari kira-kira habis berapa?". */
  seedDailySpend: number
  saldoBelanja: number
  /**
   * Σ(komitmen aktif) / panjangSiklus. WAJIB tetap jadi parameter meski
   * komitmen di luar cakupan MVP — caller mengirim 0.
   */
  biayaKomitmenHarian: number
}

export interface HasilRunway {
  hari: number
  /** true selama bobot seed (w) < 1 — UI wajib memberi label "perkiraan". */
  perkiraan: boolean
}

/**
 * hitungRunway(input) → { hari, perkiraan } | null
 *
 * N                 = min(28, hariSejakMulai)
 * jendelaRata       = [hariIni − N, hariIni − 1]     // TIDAK termasuk hari ini
 * rataAktual        = N > 0 ? mean(belanjaHarian(d)) untuk d di jendela : 0
 * w                 = min(1, hariSejakMulai / 14)
 * rataHarian        = w × rataAktual + (1 − w) × seedDailySpend
 * biayaHarianTotal  = rataHarian + biayaKomitmenHarian
 * runway            = biayaHarianTotal > 0 ? floor(saldoBelanja / biayaHarianTotal) : null
 *
 * Penjagaan `N > 0` mutlak: tanpanya mean([]) === NaN, dan 0 × NaN tetap NaN
 * di JavaScript — bobot nol TIDAK menyelamatkan hari pertama (spec §4.5).
 */
export function hitungRunway(input: HitungRunwayInput): HasilRunway | null {
  const hariSejakMulai = selisihHari(input.hariIni, input.startedAt)
  const N = Math.min(28, hariSejakMulai)

  let rataAktual = 0
  if (N > 0) {
    let total = 0
    for (let i = 1; i <= N; i++) {
      const d = addDays(input.hariIni, -i)
      total += input.belanjaHarianMap[d] ?? 0
    }
    rataAktual = total / N
  }

  const w = Math.min(1, hariSejakMulai / 14)
  const rataHarian = w * rataAktual + (1 - w) * input.seedDailySpend
  const biayaHarianTotal = rataHarian + input.biayaKomitmenHarian

  if (biayaHarianTotal <= 0) return null

  return {
    hari: Math.floor(input.saldoBelanja / biayaHarianTotal),
    perkiraan: w < 1
  }
}
