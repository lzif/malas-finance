import { describe, expect, it } from 'vitest'
import { addDays } from './day'
import { hitungRunway } from './runway'
import type { HitungRunwayInput } from './runway'

function base(overrides: Partial<HitungRunwayInput> = {}): HitungRunwayInput {
  return {
    hariIni: '2025-06-15',
    startedAt: '2025-06-15',
    belanjaHarianMap: {},
    seedDailySpend: 50_000,
    saldoBelanja: 500_000,
    biayaKomitmenHarian: 0,
    ...overrides
  }
}

describe('hitungRunway — cold start', () => {
  it('nol hari data → seed murni, ditandai perkiraan, hasil bukan NaN', () => {
    const r = hitungRunway(base())
    expect(r).not.toBeNull()
    expect(r!.perkiraan).toBe(true)
    expect(Number.isNaN(r!.hari)).toBe(false)
    // rataHarian = seed murni (w=0) → runway = floor(saldoBelanja / seed)
    expect(r!.hari).toBe(Math.floor(500_000 / 50_000))
  })

  it('hari ke-7: campuran seed dan aktual (w = 0.5)', () => {
    const hariIni = '2025-06-22' // startedAt + 7
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    // 7 hari sebelum hariIni, masing-masing belanja 100.000 → rataAktual 100.000
    for (let i = 1; i <= 7; i++) map[addDays(hariIni, -i)] = 100_000
    const r = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: map, seedDailySpend: 50_000 }))
    expect(r!.perkiraan).toBe(true)
    // rataHarian = 0.5*100.000 + 0.5*50.000 = 75.000
    expect(r!.hari).toBe(Math.floor(500_000 / 75_000))
  })

  it('hari ke-14: seed berbobot nol (w = 1)', () => {
    const hariIni = '2025-06-29' // startedAt + 14
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    for (let i = 1; i <= 14; i++) map[addDays(hariIni, -i)] = 20_000
    const r = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: map, seedDailySpend: 999_999 }))
    expect(r!.perkiraan).toBe(false)
    expect(r!.hari).toBe(Math.floor(500_000 / 20_000))
  })

  it('hari ke-15: tetap seed berbobot nol (w tetap 1, N tetap dijepit 28)', () => {
    const hariIni = '2025-06-30' // startedAt + 15
    const startedAt = '2025-06-15'
    const map: Record<string, number> = {}
    for (let i = 1; i <= 15; i++) map[addDays(hariIni, -i)] = 20_000
    const r = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: map, seedDailySpend: 999_999 }))
    expect(r!.perkiraan).toBe(false)
    expect(r!.hari).toBe(Math.floor(500_000 / 20_000))
  })
})

describe('hitungRunway — penjagaan data tipis', () => {
  it('nol belanja dan nol komitmen → null, bukan Infinity', () => {
    const r = hitungRunway(base({ seedDailySpend: 0, belanjaHarianMap: {}, biayaKomitmenHarian: 0 }))
    expect(r).toBeNull()
  })

  it('hari tanpa belanja dihitung sebagai 0, bukan dilewati (mengencerkan rata-rata)', () => {
    const hariIni = '2025-06-20' // startedAt + 5, N = 5
    const startedAt = '2025-06-15'
    // Hanya satu dari lima hari terisi — sisanya harus dihitung 0.
    const map: Record<string, number> = { [addDays(hariIni, -1)]: 500_000 }
    const r = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: map, seedDailySpend: 0 }))
    // rataAktual = 500.000 / 5 = 100.000 (bukan 500.000 / 1)
    // w = 5/14, rataHarian = (5/14)*100.000 + (9/14)*0
    const expectedRataHarian = (5 / 14) * 100_000
    expect(r!.hari).toBe(Math.floor(500_000 / expectedRataHarian))
  })
})

describe('hitungRunway — jendela rata-rata mengecualikan hari ini', () => {
  it('runway tidak berubah saat transaksi hari ini disimpan', () => {
    const hariIni = '2025-06-25'
    const startedAt = '2025-06-01'
    const mapTanpaHariIni: Record<string, number> = {
      [addDays(hariIni, -1)]: 30_000,
      [addDays(hariIni, -2)]: 20_000
    }
    const sebelum = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: mapTanpaHariIni, seedDailySpend: 0 }))
    const mapDenganHariIni = { ...mapTanpaHariIni, [hariIni]: 9_999_999 }
    const sesudah = hitungRunway(base({ hariIni, startedAt, belanjaHarianMap: mapDenganHariIni, seedDailySpend: 0 }))
    expect(sesudah).toEqual(sebelum)
  })
})
