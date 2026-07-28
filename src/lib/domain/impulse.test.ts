import { describe, expect, it } from 'vitest'
import { impulseAmount, impulseRunwayDays, type ImpulseTransaction } from './impulse'

function tx(overrides: Partial<ImpulseTransaction> = {}): ImpulseTransaction {
  return { kind: 'out', intent: 'impulse', commitmentId: null, dayKey: '2026-07-15', amount: 10_000, ...overrides }
}

describe('impulseAmount', () => {
  it('sums only out + impulse + discretionary transactions inside the period', () => {
    const txs: ImpulseTransaction[] = [
      tx({ amount: 100_000 }),
      tx({ amount: 50_000, intent: 'routine' }), // wrong intent
      tx({ amount: 40_000, kind: 'in' }), // wrong kind
      tx({ amount: 30_000, commitmentId: 'c1' }), // not discretionary
      tx({ amount: 20_000, dayKey: '2026-06-01' }) // outside the cycle window
    ]
    expect(impulseAmount(txs, '2026-07-01', '2026-07-20')).toBe(100_000)
  })

  it('includes both window endpoints', () => {
    const txs: ImpulseTransaction[] = [
      tx({ amount: 1_000, dayKey: '2026-07-01' }),
      tx({ amount: 2_000, dayKey: '2026-07-20' })
    ]
    expect(impulseAmount(txs, '2026-07-01', '2026-07-20')).toBe(3_000)
  })

  it('empty input → 0', () => {
    expect(impulseAmount([], '2026-07-01', '2026-07-20')).toBe(0)
  })
})

describe('impulseRunwayDays', () => {
  it('converts a rupiah amount to floor(days) at the given daily cost', () => {
    expect(impulseRunwayDays(210_000, 50_000)).toBe(4)
  })

  it('totalDailyCost <= 0 → null, not Infinity/NaN', () => {
    expect(impulseRunwayDays(210_000, 0)).toBeNull()
    expect(impulseRunwayDays(210_000, -1)).toBeNull()
  })
})
