import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  anchorLine,
  formatExpense,
  formatIncome,
  formatTransfer,
  intentLabel,
} from './formatter.ts'

describe('formatExpense', () => {
  it('matches the spec §6.1 layout exactly', () => {
    const out = formatExpense({
      item: 'Rokok Surya',
      amount: 27_500,
      intent: 'impulse',
      categoryPath: 'Rokok & Sejenisnya > Rokok',
      remainingAllowance: 52_500,
      allowanceToday: 80_000,
    })
    expect(out).toBe(
      '💾 Rokok Surya — Rp 27.500 [IMPULSIF]\n' +
        '📁 Rokok & Sejenisnya > Rokok\n' +
        'Sisa hari ini: Rp 52.500 dari Rp 80.000',
    )
  })
})

describe('intentLabel', () => {
  it('carries the Indonesian taxonomy verbatim (AGENTS.md language rule)', () => {
    expect(intentLabel('planned')).toBe('📋 TERENCANA')
    expect(intentLabel('routine')).toBe('🔄 RUTIN')
    expect(intentLabel('impulse')).toBe('⚡ IMPULSIF')
    expect(intentLabel('emergency')).toBe('🚨 DARURAT')
  })
})

describe('anchorLine (K1 — anchor number in every response)', () => {
  it('shows remaining out of today total', () => {
    expect(anchorLine(52_500, 80_000)).toBe('Sisa hari ini: Rp 52.500 dari Rp 80.000')
  })
  it('keeps a negative sign when the allowance is blown through', () => {
    expect(anchorLine(-272_800, 80_000)).toBe('Sisa hari ini: -Rp 272.800 dari Rp 80.000')
  })
})

describe('formatIncome', () => {
  it('matches the spec §6.2 layout', () => {
    const out = formatIncome({
      item: 'Gajian',
      amount: 2_400_000,
      walletName: 'Bank',
      remainingAllowance: 100_000,
      allowanceToday: 100_000,
    })
    expect(out).toBe(
      '💰 Gajian — Rp 2.400.000 → Bank\nSisa hari ini: Rp 100.000 dari Rp 100.000',
    )
  })
})

describe('formatTransfer', () => {
  it('says the allowance did not change (spec §6.5)', () => {
    const out = formatTransfer({
      amount: 500_000,
      fromWallet: 'CASH',
      toWallet: 'GoPay',
      remainingAllowance: 77_200,
      allowanceToday: 104_347,
      allowanceChanged: false,
    })
    expect(out).toBe(
      '🔄 Pindah Rp 500.000: CASH → GoPay\nSisa hari ini: Rp 77.200 (jatah tidak berubah)',
    )
  })

  it('shows the real anchor line when the move crossed into a reserve wallet', () => {
    // Moving out of the spendable pool genuinely lowers the allowance (spec
    // §12), so claiming "jatah tidak berubah" here would contradict the very
    // number printed beside it.
    const out = formatTransfer({
      amount: 500_000,
      fromWallet: 'CASH',
      toWallet: 'Tabungan',
      remainingAllowance: 50_000,
      allowanceToday: 50_000,
      allowanceChanged: true,
    })
    expect(out).toBe(
      '🔄 Pindah Rp 500.000: CASH → Tabungan\nSisa hari ini: Rp 50.000 dari Rp 50.000',
    )
  })
})
