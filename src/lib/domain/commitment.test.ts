import { describe, expect, it } from 'vitest'
import {
  commitmentWindow,
  dueOccurrence,
  dueOccurrences,
  isOccurrencePaid,
  isPaid,
  monthsInWindow,
  settlingKind,
  unpaidCommitments,
  type Commitment,
  type CommitmentTransaction
} from './commitment'

function bill(over: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c1',
    name: 'Listrik',
    amount: 500_000,
    kind: 'bill',
    dueDay: 10,
    walletId: null,
    active: true,
    ...over
  }
}

function tx(over: Partial<CommitmentTransaction> = {}): CommitmentTransaction {
  return { commitmentId: 'c1', dayKey: '2026-07-10', kind: 'out', ...over }
}

describe('settlingKind', () => {
  it('bill is settled by out, saving by move', () => {
    expect(settlingKind(bill())).toBe('out')
    expect(settlingKind(bill({ kind: 'saving' }))).toBe('move')
  })
})

describe('commitmentWindow', () => {
  it('is exactly the cycle', () => {
    expect(commitmentWindow('2026-07-01', '2026-07-31')).toEqual({
      start: '2026-07-01',
      end: '2026-07-31'
    })
    expect(commitmentWindow('2026-07-10', '2026-08-09')).toEqual({
      start: '2026-07-10',
      end: '2026-08-09'
    })
  })
})

describe('monthsInWindow', () => {
  it('lists a single month', () => {
    expect(monthsInWindow({ start: '2026-07-01', end: '2026-07-31' })).toEqual(['2026-07'])
  })

  it('lists both months of a cross-month window', () => {
    expect(monthsInWindow({ start: '2026-07-10', end: '2026-08-09' })).toEqual([
      '2026-07',
      '2026-08'
    ])
  })

  it('crosses a year boundary', () => {
    expect(monthsInWindow({ start: '2026-12-20', end: '2027-01-19' })).toEqual([
      '2026-12',
      '2027-01'
    ])
  })
})

describe('dueOccurrence', () => {
  it('clamps day 31 in February', () => {
    expect(dueOccurrence(bill({ dueDay: 31 }), '2026-02')).toBe('2026-02-28')
  })

  it('clamps day 31 in a leap February', () => {
    expect(dueOccurrence(bill({ dueDay: 31 }), '2028-02')).toBe('2028-02-29')
  })

  it('clamps day 31 in a 30-day month', () => {
    expect(dueOccurrence(bill({ dueDay: 31 }), '2026-04')).toBe('2026-04-30')
  })
})

describe('dueOccurrences', () => {
  it('skips an occurrence falling before the cycle started', () => {
    const w = { start: '2026-07-10', end: '2026-08-09' }
    expect(dueOccurrences(bill({ dueDay: 5 }), w)).toEqual(['2026-08-05'])
    expect(dueOccurrences(bill({ dueDay: 20 }), w)).toEqual(['2026-07-20'])
  })

  it('includes an occurrence from each month when both fall inside', () => {
    const w = { start: '2026-07-01', end: '2026-08-31' }
    expect(dueOccurrences(bill({ dueDay: 15 }), w)).toEqual(['2026-07-15', '2026-08-15'])
  })
})

describe('isOccurrencePaid', () => {
  it('requires the settling kind - an income tagged with the id does not pay a bill', () => {
    expect(isOccurrencePaid(bill(), [tx({ kind: 'in' })], '2026-07-10')).toBe(false)
    expect(isOccurrencePaid(bill(), [tx({ kind: 'out' })], '2026-07-10')).toBe(true)
  })

  it('requires a move to settle a saving commitment', () => {
    const s = bill({ kind: 'saving' })
    expect(isOccurrencePaid(s, [tx({ kind: 'out' })], '2026-07-10')).toBe(false)
    expect(isOccurrencePaid(s, [tx({ kind: 'move' })], '2026-07-10')).toBe(true)
  })

  it('does not let a July payment settle the August occurrence', () => {
    expect(isOccurrencePaid(bill(), [tx({ dayKey: '2026-07-10' })], '2026-08-10')).toBe(false)
  })
})

describe('isPaid', () => {
  it('reports the occurrence due in today month', () => {
    expect(isPaid(bill(), [tx({ dayKey: '2026-07-09' })], '2026-07-20')).toBe(true)
    expect(isPaid(bill(), [], '2026-07-20')).toBe(false)
  })
})

describe('unpaidCommitments', () => {
  const cycleStart = '2026-07-01'
  const cycleEnd = '2026-07-31'

  it('returns 0 for an empty list', () => {
    expect(unpaidCommitments([], [], cycleStart, cycleEnd)).toBe(0)
  })

  it('counts an overdue unpaid bill - forgetting to pay must not raise the allowance', () => {
    expect(unpaidCommitments([bill()], [], cycleStart, cycleEnd)).toBe(500_000)
  })

  it('stops counting once paid, and counts again once the payment is removed', () => {
    const paidTxs = [tx({ dayKey: '2026-07-10' })]
    expect(unpaidCommitments([bill()], paidTxs, cycleStart, cycleEnd)).toBe(0)
    expect(unpaidCommitments([bill()], [], cycleStart, cycleEnd)).toBe(500_000)
  })

  it('excludes inactive commitments even when unpaid', () => {
    expect(unpaidCommitments([bill({ active: false })], [], cycleStart, cycleEnd)).toBe(
      0
    )
  })

  it('counts the occurrence in the later month of a cross-month cycle', () => {
    expect(
      unpaidCommitments([bill({ dueDay: 5 })], [], '2026-07-10', '2026-08-09')
    ).toBe(500_000)
  })

  it('keeps an overdue bill from earlier in the cycle after the month has rolled over', () => {
    expect(
      unpaidCommitments([bill({ dueDay: 25 })], [], '2026-07-10', '2026-08-09')
    ).toBe(500_000)
  })

  it('counts both occurrences when a two-month window contains two', () => {
    expect(
      unpaidCommitments([bill({ dueDay: 15 })], [], '2026-07-01', '2026-08-31')
    ).toBe(1_000_000)
  })

  it('an amount larger than any balance is still just summed', () => {
    expect(
      unpaidCommitments([bill({ amount: 99_000_000 })], [], cycleStart, cycleEnd)
    ).toBe(99_000_000)
  })
})
