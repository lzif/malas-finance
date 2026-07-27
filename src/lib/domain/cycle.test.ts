import { describe, expect, it } from 'vitest'
import { cycleFor } from './cycle'
import type { CycleSettings } from './types'

function monthlyDay(anchor: number): CycleSettings {
  return { cycleMode: 'monthly-day', cycleAnchorDay: anchor, cycleManualEnd: null }
}

describe('cycleFor — monthly-day', () => {
  it('cycleAnchorDay = 31 di Februari tahun biasa (28 hari) dijepit', () => {
    // 2025 bukan kabisat. Hari ini di tengah Februari → siklus mulai dari
    // 31 Januari (dijepit valid) sampai 27 Februari (28 - 1).
    const r = cycleFor('2025-02-15', monthlyDay(31))
    expect(r.start).toBe('2025-01-31')
    expect(r.end).toBe('2025-02-27')
  })

  it('cycleAnchorDay = 31 di Februari tahun kabisat (29 hari) dijepit', () => {
    const r = cycleFor('2024-02-15', monthlyDay(31))
    expect(r.start).toBe('2024-01-31')
    expect(r.end).toBe('2024-02-28')
  })

  it('cycleAnchorDay = 31 saat siklus berikutnya juga masuk Februari kabisat', () => {
    const r = cycleFor('2024-03-01', monthlyDay(31))
    expect(r.start).toBe('2024-02-29')
    expect(r.end).toBe('2024-03-30')
  })

  it('cycleAnchorDay = 30 di Februari dijepit ke hari terakhir bulan', () => {
    const r = cycleFor('2025-02-10', monthlyDay(30))
    expect(r.start).toBe('2025-01-30')
    expect(r.end).toBe('2025-02-27')
  })

  it('hari terakhir siklus → sisaHari === 1, tidak pernah 0', () => {
    const r = cycleFor('2025-02-27', monthlyDay(31))
    expect(r.end).toBe('2025-02-27')
    expect(r.sisaHari).toBe(1)
  })

  it('sehari sebelum akhir siklus → sisaHari === 2', () => {
    const r = cycleFor('2025-02-26', monthlyDay(31))
    expect(r.sisaHari).toBe(2)
  })

  it('pergantian tahun: anchor akhir Desember menyeberang ke Januari', () => {
    const r = cycleFor('2025-12-28', monthlyDay(25))
    expect(r.start).toBe('2025-12-25')
    expect(r.end).toBe('2026-01-24')
  })

  it('hari tepat di tanggal anchor memulai siklus baru', () => {
    const r = cycleFor('2025-06-10', monthlyDay(10))
    expect(r.start).toBe('2025-06-10')
    expect(r.end).toBe('2025-07-09')
  })
})

describe('cycleFor — manual', () => {
  it('tanggal akhir belum lewat → status active', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-30' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('active')
    expect(r.end).toBe('2025-06-30')
  })

  it('tanggal akhir sudah lewat → cycle-expired, jatuh ke perilaku rolling (horizon 30 hari)', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-10' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('cycle-expired')
    expect(r.end).toBe('2025-07-14') // 2025-06-15 + 29
    expect(r.sisaHari).toBe(30)
  })

  it('cycleManualEnd === hari ini masih dianggap belum lewat', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-15' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('active')
    expect(r.sisaHari).toBe(1)
  })
})

describe('cycleFor — rolling', () => {
  it('cycleEnd selalu hari ini + 29, horizon 30 hari', () => {
    const settings: CycleSettings = { cycleMode: 'rolling', cycleAnchorDay: 1, cycleManualEnd: null }
    const r = cycleFor('2025-06-15', settings)
    expect(r.end).toBe('2025-07-14')
    expect(r.sisaHari).toBe(30)
    expect(r.status).toBe('active')
  })

  it('menyeberang tahun tetap horizon 30 hari', () => {
    const settings: CycleSettings = { cycleMode: 'rolling', cycleAnchorDay: 1, cycleManualEnd: null }
    const r = cycleFor('2025-12-20', settings)
    expect(r.end).toBe('2026-01-18')
    expect(r.sisaHari).toBe(30)
  })
})
