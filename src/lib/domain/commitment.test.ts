import { describe, it, expect } from 'vitest'
import {
  commitmentWindow,
  dueOccurrence,
  isPaid,
  unpaidCommitments,
  type Commitment,
  type CommitmentTransaction
} from './commitment'

describe('commitment logic (§4.3)', () => {
  const sampleCommitment: Commitment = {
    id: 'comm-1',
    name: 'Electricity',
    amount: 500000,
    kind: 'bill',
    dueDay: 5,
    walletId: 'w-1',
    active: true
  }

  it('calculates commitment window starting at the first day of current month', () => {
    const window = commitmentWindow('2026-07-15', '2026-07-31')
    expect(window).toEqual({ start: '2026-07-01', end: '2026-07-31' })
  })

  it('counts overdue-but-unpaid commitments', () => {
    const today = '2026-07-15'
    const cycleEnd = '2026-07-31'
    const txs: CommitmentTransaction[] = []

    const total = unpaidCommitments([sampleCommitment], txs, today, cycleEnd)
    expect(total).toBe(500000)
  })

  it('marks commitment as paid when payment transaction exists in window', () => {
    const window = commitmentWindow('2026-07-15', '2026-07-31')
    const txs: CommitmentTransaction[] = [
      { commitmentId: 'comm-1', dayKey: '2026-07-05', kind: 'out' }
    ]

    expect(isPaid(sampleCommitment, txs, window)).toBe(true)

    const total = unpaidCommitments([sampleCommitment], txs, '2026-07-15', '2026-07-31')
    expect(total).toBe(0)
  })

  it('makes commitment unpaid again when the payment transaction is removed', () => {
    const today = '2026-07-15'
    const cycleEnd = '2026-07-31'
    const txs: CommitmentTransaction[] = [
      { commitmentId: 'comm-1', dayKey: '2026-07-05', kind: 'out' }
    ]

    expect(unpaidCommitments([sampleCommitment], txs, today, cycleEnd)).toBe(0)

    const activeTxs: CommitmentTransaction[] = []
    expect(unpaidCommitments([sampleCommitment], activeTxs, today, cycleEnd)).toBe(500000)
  })

  it('clamps dueDay 31 in February for leap and non-leap years', () => {
    const febCommitment: Commitment = {
      ...sampleCommitment,
      dueDay: 31
    }

    expect(dueOccurrence(febCommitment, '2026-02-10')).toBe('2026-02-28')
    expect(dueOccurrence(febCommitment, '2024-02-10')).toBe('2024-02-29')
  })

  it('counts commitment created mid-cycle if its due date is in the window', () => {
    const midCycleCommitment: Commitment = {
      id: 'comm-2',
      name: 'Internet',
      amount: 300000,
      kind: 'bill',
      dueDay: 20,
      walletId: 'w-1',
      active: true
    }

    const total = unpaidCommitments([midCycleCommitment], [], '2026-07-15', '2026-07-31')
    expect(total).toBe(300000)
  })

  it('excludes inactive commitments', () => {
    const inactiveCommitment: Commitment = {
      ...sampleCommitment,
      active: false
    }

    const total = unpaidCommitments([inactiveCommitment], [], '2026-07-15', '2026-07-31')
    expect(total).toBe(0)
  })

  it('returns 0 for an empty commitment list', () => {
    const total = unpaidCommitments([], [], '2026-07-15', '2026-07-31')
    expect(total).toBe(0)
  })

  it('sums commitment amount larger than any balance', () => {
    const hugeCommitment: Commitment = {
      id: 'comm-huge',
      name: 'Rent',
      amount: 50000000,
      kind: 'bill',
      dueDay: 10,
      walletId: 'w-1',
      active: true
    }

    const total = unpaidCommitments([hugeCommitment], [], '2026-07-15', '2026-07-31')
    expect(total).toBe(50000000)
  })
})
