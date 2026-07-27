import { describe, expect, it } from 'vitest'
import { bandJatah, hitungJatah, perkiraanLewatJatah } from './allowance'
import type { HitungJatahInput } from './allowance'

function base(overrides: Partial<HitungJatahInput> = {}): HitungJatahInput {
  return {
    saldoBelanja: 500_000,
    transaksiHariIni: [],
    komitmenBelumDibayar: 0,
    endBuffer: 0,
    sisaHari: 10,
    ...overrides
  }
}

describe('hitungJatah — belanja hari ini tidak dihitung dua kali', () => {
  it('jatahHariIni stabil terhadap pengeluaran diskresioner sepanjang hari', () => {
    const saldoAwal = 500_000
    const sisaHari = 10
    const belumBelanja = hitungJatah(base({ saldoBelanja: saldoAwal, sisaHari }))
    const sudahBelanja = hitungJatah(
      base({
        saldoBelanja: saldoAwal - 50_000,
        transaksiHariIni: [{ kind: 'out', amount: 50_000, commitmentId: null }],
        sisaHari
      })
    )
    expect(sudahBelanja.jatahHariIni).toBe(belumBelanja.jatahHariIni)
    expect(sudahBelanja.sisaJatah).toBe(belumBelanja.sisaJatah - 50_000)
  })

  it('beberapa transaksi hari ini terakumulasi tanpa menggerakkan jatahHariIni', () => {
    const saldoAwal = 500_000
    const sisaHari = 10
    const nol = hitungJatah(base({ saldoBelanja: saldoAwal, sisaHari }))
    const tiga = hitungJatah(
      base({
        saldoBelanja: saldoAwal - 30_000,
        transaksiHariIni: [
          { kind: 'out', amount: 10_000, commitmentId: null },
          { kind: 'out', amount: 15_000, commitmentId: null },
          { kind: 'out', amount: 5_000, commitmentId: null }
        ],
        sisaHari
      })
    )
    expect(tiga.jatahHariIni).toBe(nol.jatahHariIni)
    expect(tiga.terpakaiHariIni).toBe(30_000)
  })
})

describe('hitungJatah — pemasukan dan hari berikutnya', () => {
  it('pemasukan di tengah hari menaikkan jatahHariIni seketika (disengaja)', () => {
    const sisaHari = 10
    const sebelum = hitungJatah(base({ saldoBelanja: 300_000, sisaHari }))
    const sesudah = hitungJatah(
      base({
        saldoBelanja: 300_000 + 200_000,
        transaksiHariIni: [{ kind: 'in', amount: 200_000, commitmentId: null }],
        sisaHari
      })
    )
    expect(sesudah.jatahHariIni).toBeGreaterThan(sebelum.jatahHariIni)
  })

  it('boros hari ini menurunkan jatahHariIni besok', () => {
    const saldoAwal = 500_000
    const sisaHariBesok = 9 // satu hari sudah lewat
    const jatahBesokBoros = hitungJatah(
      base({ saldoBelanja: saldoAwal - 100_000, sisaHari: sisaHariBesok })
    ).jatahHariIni
    const jatahBesokHemat = hitungJatah(
      base({ saldoBelanja: saldoAwal - 10_000, sisaHari: sisaHariBesok })
    ).jatahHariIni
    expect(jatahBesokBoros).toBeLessThan(jatahBesokHemat)
  })
})

describe('hitungJatah — komitmen (parameter tetap ada meski di luar cakupan MVP)', () => {
  it('komitmen belum dibayar mengurangi jatah sejak hari pertama siklus', () => {
    const tanpaKomitmen = hitungJatah(base({ saldoBelanja: 3_000_000, sisaHari: 26 }))
    const denganKomitmen = hitungJatah(
      base({ saldoBelanja: 3_000_000, komitmenBelumDibayar: 2_000_000, sisaHari: 26 })
    )
    // Contoh persis dari spec §4.4: dana = 3.000.000 - 2.000.000 = 1.000.000,
    // jatah = floor(1.000.000 / 26) = 38.461.
    expect(denganKomitmen.jatahHariIni).toBe(38_461)
    expect(denganKomitmen.jatahHariIni).toBeLessThan(tanpaKomitmen.jatahHariIni)
  })

  it('membayar komitmen di tengah siklus tidak menimbulkan lonjakan maupun tebing', () => {
    const sisaHari = 6
    const saldoSebelumBayar = 1_200_000 // dompet masih memuat dana sewa yang belum dibayar
    const sebelum = hitungJatah(
      base({ saldoBelanja: saldoSebelumBayar, komitmenBelumDibayar: 800_000, sisaHari })
    )
    const saldoSesudahBayar = saldoSebelumBayar - 800_000 // sewa dibayar, keluar dari dompet
    const sesudah = hitungJatah(
      base({
        saldoBelanja: saldoSesudahBayar,
        transaksiHariIni: [{ kind: 'out', amount: 800_000, commitmentId: 'sewa' }],
        komitmenBelumDibayar: 0,
        sisaHari
      })
    )
    expect(sesudah.jatahHariIni).toBe(sebelum.jatahHariIni)
    // Pembayaran komitmen dikecualikan dari belanja diskresioner.
    expect(sesudah.terpakaiHariIni).toBe(0)
  })
})

describe('hitungJatah — kondisi minus', () => {
  it('danaTersedia <= 0 → jatah 0 dan status minus, bukan angka negatif', () => {
    const r = hitungJatah(base({ saldoBelanja: 100, komitmenBelumDibayar: 500, sisaHari: 5 }))
    expect(r.jatahHariIni).toBe(0)
    expect(r.status).toBe('minus')
    expect(r.danaTersedia).toBeLessThan(0)
  })

  it('endBuffer lebih besar dari saldo → minus', () => {
    const r = hitungJatah(base({ saldoBelanja: 50_000, endBuffer: 100_000, sisaHari: 10 }))
    expect(r.status).toBe('minus')
    expect(r.jatahHariIni).toBe(0)
  })

  it('nol dompet spendable → danaTersedia 0, status minus, jatah 0', () => {
    const r = hitungJatah(base({ saldoBelanja: 0, sisaHari: 10 }))
    expect(r.danaTersedia).toBe(0)
    expect(r.status).toBe('minus')
    expect(r.jatahHariIni).toBe(0)
  })

  it('sisaJatah < 0 dengan danaTersedia > 0 → status lewat', () => {
    const r = hitungJatah(
      base({
        saldoBelanja: 100_000,
        transaksiHariIni: [{ kind: 'out', amount: 200_000, commitmentId: null }],
        sisaHari: 10
      })
    )
    expect(r.status).toBe('lewat')
    expect(r.sisaJatah).toBeLessThan(0)
  })
})

describe('bandJatah — perlakuan visual anti-pembiasaan', () => {
  it('tenang di bawah 60%', () => {
    expect(bandJatah(0)).toBe('tenang')
    expect(bandJatah(0.59)).toBe('tenang')
  })

  it('waspada 60–90%', () => {
    expect(bandJatah(0.6)).toBe('waspada')
    expect(bandJatah(0.89)).toBe('waspada')
  })

  it('mendesak 90–100%', () => {
    expect(bandJatah(0.9)).toBe('mendesak')
    expect(bandJatah(1)).toBe('mendesak')
  })

  it('terlampaui di atas 100%, dan saat null (kondisi minus)', () => {
    expect(bandJatah(1.01)).toBe('terlampaui')
    expect(bandJatah(null)).toBe('terlampaui')
  })
})

describe('perkiraanLewatJatah — intervensi di detik keputusan', () => {
  it('0 bila nominal tidak melewati sisa jatah', () => {
    expect(perkiraanLewatJatah(10_000, 20_000)).toBe(0)
    expect(perkiraanLewatJatah(20_000, 20_000)).toBe(0)
  })

  it('mengembalikan besaran lewatnya bila nominal melewati sisa jatah', () => {
    expect(perkiraanLewatJatah(32_500, 20_000)).toBe(12_500)
  })
})
