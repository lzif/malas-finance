import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { formatNumber, formatRupiah, parseAmount, parseRupiah } from './money.ts'

describe('formatRupiah', () => {
  it('groups thousands with dots and prefixes Rp', () => {
    expect(formatRupiah(1_234_500)).toBe('Rp 1.234.500')
    expect(formatRupiah(0)).toBe('Rp 0')
  })
  it('keeps the sign for negatives', () => {
    expect(formatRupiah(-272_800)).toBe('-Rp 272.800')
  })
})

describe('formatNumber', () => {
  it('groups without the Rp prefix', () => {
    expect(formatNumber(1_234_500)).toBe('1.234.500')
  })
})

describe('parseRupiah', () => {
  it('strips non-digits', () => {
    expect(parseRupiah('Rp 27.500')).toBe(27500)
    expect(parseRupiah('')).toBe(0)
  })
})

describe('parseAmount — plain rupiah with dotted grouping', () => {
  it('"1.500" is one-thousand-five-hundred, not 1.5', () => {
    expect(parseAmount('1.500')).toBe(1500)
  })
  it('"50000" and "50.000" are the same amount', () => {
    expect(parseAmount('50000')).toBe(50_000)
    expect(parseAmount('50.000')).toBe(50_000)
  })
})

describe('parseAmount — k/ribu suffix means thousands', () => {
  it('"27.5k" → 27500 (dot is a decimal point here)', () => {
    expect(parseAmount('27.5k')).toBe(27_500)
  })
  it('"27,5k" → 27500 (comma is also a decimal point)', () => {
    expect(parseAmount('27,5k')).toBe(27_500)
  })
  it('"600k" → 600000', () => {
    expect(parseAmount('600k')).toBe(600_000)
  })
  it('"85rb" and "85 ribu" → 85000', () => {
    expect(parseAmount('85rb')).toBe(85_000)
    expect(parseAmount('85 ribu')).toBe(85_000)
  })
})

describe('parseAmount — jt/juta suffix means millions', () => {
  it('"2.4jt" → 2400000', () => {
    expect(parseAmount('2.4jt')).toBe(2_400_000)
  })
  it('"2jt" and "2 juta" → 2000000', () => {
    expect(parseAmount('2jt')).toBe(2_000_000)
    expect(parseAmount('2 juta')).toBe(2_000_000)
  })
})

describe('parseAmount — embedded in a sentence', () => {
  it('reads the amount out of "rokok surya 27.5k"', () => {
    expect(parseAmount('rokok surya 27.5k')).toBe(27_500)
  })
  it('reads the amount out of "+gajian 2.4jt bank"', () => {
    expect(parseAmount('+gajian 2.4jt bank')).toBe(2_400_000)
  })
})

describe('parseAmount — no amount present', () => {
  it('returns null so the caller can ask (spec §6.6)', () => {
    expect(parseAmount('rokok surya')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
