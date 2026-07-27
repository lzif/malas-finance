import { describe, expect, it } from 'vitest'
import { addDays, clampDay, daysInMonth, dayKeyOf, rentangHari, selisihHari } from './day'

describe('selisihHari', () => {
  it('selisihHari(x, x) === 0 — dikunci karena seluruh rumus siklus bergantung padanya', () => {
    expect(selisihHari('2025-06-15', '2025-06-15')).toBe(0)
    expect(selisihHari('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('positif ketika a setelah b, negatif ketika a sebelum b', () => {
    expect(selisihHari('2025-06-20', '2025-06-15')).toBe(5)
    expect(selisihHari('2025-06-15', '2025-06-20')).toBe(-5)
  })

  it('konsisten melewati pergantian bulan dan tahun', () => {
    expect(selisihHari('2025-02-01', '2025-01-31')).toBe(1)
    expect(selisihHari('2026-01-01', '2025-12-31')).toBe(1)
  })
})

describe('dayKeyOf', () => {
  it('dayStartHour = 3: transaksi pukul 01:30 masuk dayKey kemarin', () => {
    const at = new Date(2025, 5, 15, 1, 30, 0).getTime() // 15 Juni 2025, 01:30 lokal
    expect(dayKeyOf(at, 3)).toBe('2025-06-14')
  })

  it('dayStartHour = 3: transaksi pukul 03:30 masuk dayKey hari ini', () => {
    const at = new Date(2025, 5, 15, 3, 30, 0).getTime()
    expect(dayKeyOf(at, 3)).toBe('2025-06-15')
  })

  it('dayStartHour = 0 (default): tengah malam langsung masuk hari baru', () => {
    const at = new Date(2025, 5, 15, 0, 5, 0).getTime()
    expect(dayKeyOf(at, 0)).toBe('2025-06-15')
  })
})

describe('addDays', () => {
  it('pergantian bulan', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
  })

  it('pergantian tahun', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('mundur melewati awal bulan', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28')
  })
})

describe('daysInMonth / clampDay', () => {
  it('Februari tahun kabisat punya 29 hari', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(clampDay(31, 2024, 2)).toBe(29)
  })

  it('Februari tahun biasa punya 28 hari', () => {
    expect(daysInMonth(2025, 2)).toBe(28)
    expect(clampDay(31, 2025, 2)).toBe(28)
    expect(clampDay(30, 2025, 2)).toBe(28)
  })
})

describe('rentangHari', () => {
  it('inklusif kedua ujung', () => {
    expect(rentangHari('2025-06-01', '2025-06-03')).toEqual([
      '2025-06-01',
      '2025-06-02',
      '2025-06-03'
    ])
  })

  it('satu hari saja bila start === end', () => {
    expect(rentangHari('2025-06-01', '2025-06-01')).toEqual(['2025-06-01'])
  })
})
