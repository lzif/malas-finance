// domain/allowance.ts — jatah harian, angka jangkar aplikasi. Fungsi murni.
// (spec §4.4). Ini bagian paling penting: kalau angka ini berbohong sekali
// saja, pemakainya berhenti percaya dan aplikasinya mati.

import type { Kind } from './types'

export interface JatahTransaksi {
  kind: Kind
  amount: number
  /** null bila bukan pembayaran komitmen. */
  commitmentId: string | null
}

export interface HitungJatahInput {
  /** Σ saldoDompet(w) untuk seluruh dompet spendable, tidak diarsipkan. */
  saldoBelanja: number
  /** Transaksi aktif (belum terhapus) dengan dayKey === hari ini. */
  transaksiHariIni: JatahTransaksi[]
  /**
   * Σ tagihan komitmen yang belum dibayar dan jatuh tempo di jendela siklus
   * berjalan. Parameter ini WAJIB ada meski komitmen di luar cakupan MVP —
   * caller mengirim 0. Jangan hapus dari signature: menambah komitmen nanti
   * tidak boleh mengubah bentuk domain/.
   */
  komitmenBelumDibayar: number
  endBuffer: number
  /** max(1, selisihHari(cycleEnd, hariIni) + 1) — dari cycle.ts. */
  sisaHari: number
}

export type StatusJatah = 'normal' | 'minus' | 'lewat'

export interface HasilJatah {
  terpakaiHariIni: number
  basisJatah: number
  danaTersedia: number
  jatahHariIni: number
  sisaJatah: number
  status: StatusJatah
  /** null bila jatahHariIni === 0 (kondisi minus) — persentase tidak terdefinisi. */
  persenTerpakai: number | null
}

/**
 * hitungJatah(input) → { jatah, terpakai, sisa, status }
 *
 * terpakaiHariIni = Σ amount  untuk out, dayKey == hariIni, commitmentId == null
 * basisJatah      = saldoBelanja + terpakaiHariIni
 * danaTersedia    = basisJatah − komitmenBelumDibayar − endBuffer
 * jatahHariIni    = danaTersedia > 0 ? floor(danaTersedia / sisaHari) : 0
 * sisaJatah       = jatahHariIni − terpakaiHariIni
 */
export function hitungJatah(input: HitungJatahInput): HasilJatah {
  const terpakaiHariIni = input.transaksiHariIni
    .filter((t) => t.kind === 'out' && t.commitmentId === null)
    .reduce((sum, t) => sum + t.amount, 0)

  const basisJatah = input.saldoBelanja + terpakaiHariIni
  const danaTersedia = basisJatah - input.komitmenBelumDibayar - input.endBuffer
  const jatahHariIni = danaTersedia > 0 ? Math.floor(danaTersedia / input.sisaHari) : 0
  const sisaJatah = jatahHariIni - terpakaiHariIni

  let status: StatusJatah = 'normal'
  if (danaTersedia <= 0) status = 'minus'
  else if (sisaJatah < 0) status = 'lewat'

  const persenTerpakai = jatahHariIni > 0 ? terpakaiHariIni / jatahHariIni : null

  return { terpakaiHariIni, basisJatah, danaTersedia, jatahHariIni, sisaJatah, status, persenTerpakai }
}

export type BandJatah = 'tenang' | 'waspada' | 'mendesak' | 'terlampaui'

/**
 * Perlakuan visual anti-pembiasaan (spec §7.1, mekanisme 1): warna dan bobot
 * huruf mengikuti persentase jatah yang terpakai, bukan hanya digitnya.
 * tenang 0–60%, waspada 60–90%, mendesak 90–100%, terlampaui >100%.
 */
export function bandJatah(persenTerpakai: number | null): BandJatah {
  if (persenTerpakai === null) return 'terlampaui'
  if (persenTerpakai > 1) return 'terlampaui'
  if (persenTerpakai >= 0.9) return 'mendesak'
  if (persenTerpakai >= 0.6) return 'waspada'
  return 'tenang'
}

/**
 * Mekanisme anti-pembiasaan 2 (spec §7.1): intervensi di detik keputusan.
 * Berapa rupiah nominal yang sedang diketik akan melewati sisa jatah —
 * 0 bila tidak melewati. Dipakai untuk baris peringatan sebelum simpan:
 * "Ini akan melewati jatah Rp <hasil>."
 */
export function perkiraanLewatJatah(nominal: number, sisaJatahSaatIni: number): number {
  const sisaSetelah = sisaJatahSaatIni - nominal
  return sisaSetelah < 0 ? -sisaSetelah : 0
}
