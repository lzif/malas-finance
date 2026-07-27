import { describe, expect, it } from 'vitest'
import { allowanceBand, computeAllowance, projectedOverspend } from './allowance'
import type { AllowanceInput } from './allowance'

function base(overrides: Partial<AllowanceInput> = {}): AllowanceInput {
  return {
    spendableBalance: 500_000,
    transactionsToday: [],
    unpaidCommitments: 0,
    endBuffer: 0,
    daysRemaining: 10,
    ...overrides
  }
}

describe('computeAllowance — today\'s spending is not double-counted', () => {
  it('allowanceToday is stable against discretionary spending throughout the day', () => {
    const initialBalance = 500_000
    const daysRemaining = 10
    const beforeSpending = computeAllowance(base({ spendableBalance: initialBalance, daysRemaining }))
    const afterSpending = computeAllowance(
      base({
        spendableBalance: initialBalance - 50_000,
        transactionsToday: [{ kind: 'out', amount: 50_000, commitmentId: null }],
        daysRemaining
      })
    )
    expect(afterSpending.allowanceToday).toBe(beforeSpending.allowanceToday)
    expect(afterSpending.remainingAllowance).toBe(beforeSpending.remainingAllowance - 50_000)
  })

  it('several transactions today accumulate without moving allowanceToday', () => {
    const initialBalance = 500_000
    const daysRemaining = 10
    const zero = computeAllowance(base({ spendableBalance: initialBalance, daysRemaining }))
    const three = computeAllowance(
      base({
        spendableBalance: initialBalance - 30_000,
        transactionsToday: [
          { kind: 'out', amount: 10_000, commitmentId: null },
          { kind: 'out', amount: 15_000, commitmentId: null },
          { kind: 'out', amount: 5_000, commitmentId: null }
        ],
        daysRemaining
      })
    )
    expect(three.allowanceToday).toBe(zero.allowanceToday)
    expect(three.spentToday).toBe(30_000)
  })
})

describe('computeAllowance — income and the next day', () => {
  it('income received mid-day raises allowanceToday immediately (intentional)', () => {
    const daysRemaining = 10
    const before = computeAllowance(base({ spendableBalance: 300_000, daysRemaining }))
    const after = computeAllowance(
      base({
        spendableBalance: 300_000 + 200_000,
        transactionsToday: [{ kind: 'in', amount: 200_000, commitmentId: null }],
        daysRemaining
      })
    )
    expect(after.allowanceToday).toBeGreaterThan(before.allowanceToday)
  })

  it('overspending today lowers allowanceToday tomorrow', () => {
    const initialBalance = 500_000
    const daysRemainingTomorrow = 9 // one day has already passed
    const tomorrowOverspent = computeAllowance(
      base({ spendableBalance: initialBalance - 100_000, daysRemaining: daysRemainingTomorrow })
    ).allowanceToday
    const tomorrowFrugal = computeAllowance(
      base({ spendableBalance: initialBalance - 10_000, daysRemaining: daysRemainingTomorrow })
    ).allowanceToday
    expect(tomorrowOverspent).toBeLessThan(tomorrowFrugal)
  })
})

describe('computeAllowance — commitments (parameter stays even though out of MVP scope)', () => {
  it('unpaid commitments reduce the allowance from the first day of the cycle', () => {
    const withoutCommitment = computeAllowance(base({ spendableBalance: 3_000_000, daysRemaining: 26 }))
    const withCommitment = computeAllowance(
      base({ spendableBalance: 3_000_000, unpaidCommitments: 2_000_000, daysRemaining: 26 })
    )
    // Exact example from spec §4.4: funds = 3,000,000 - 2,000,000 = 1,000,000,
    // allowance = floor(1,000,000 / 26) = 38,461.
    expect(withCommitment.allowanceToday).toBe(38_461)
    expect(withCommitment.allowanceToday).toBeLessThan(withoutCommitment.allowanceToday)
  })

  it('paying a commitment mid-cycle causes neither a spike nor a cliff', () => {
    const daysRemaining = 6
    const balanceBeforePaying = 1_200_000 // wallet still holds the unpaid rent
    const before = computeAllowance(
      base({ spendableBalance: balanceBeforePaying, unpaidCommitments: 800_000, daysRemaining })
    )
    const balanceAfterPaying = balanceBeforePaying - 800_000 // rent paid, leaves the wallet
    const after = computeAllowance(
      base({
        spendableBalance: balanceAfterPaying,
        transactionsToday: [{ kind: 'out', amount: 800_000, commitmentId: 'rent' }],
        unpaidCommitments: 0,
        daysRemaining
      })
    )
    expect(after.allowanceToday).toBe(before.allowanceToday)
    // Commitment payments are excluded from discretionary spending.
    expect(after.spentToday).toBe(0)
  })
})

describe('computeAllowance — minus condition', () => {
  it('availableFunds <= 0 → allowance 0 and status minus, not a negative number', () => {
    const r = computeAllowance(base({ spendableBalance: 100, unpaidCommitments: 500, daysRemaining: 5 }))
    expect(r.allowanceToday).toBe(0)
    expect(r.status).toBe('minus')
    expect(r.availableFunds).toBeLessThan(0)
  })

  it('endBuffer larger than the balance → minus', () => {
    const r = computeAllowance(base({ spendableBalance: 50_000, endBuffer: 100_000, daysRemaining: 10 }))
    expect(r.status).toBe('minus')
    expect(r.allowanceToday).toBe(0)
  })

  it('zero spendable wallets → availableFunds 0, status minus, allowance 0', () => {
    const r = computeAllowance(base({ spendableBalance: 0, daysRemaining: 10 }))
    expect(r.availableFunds).toBe(0)
    expect(r.status).toBe('minus')
    expect(r.allowanceToday).toBe(0)
  })

  it('remainingAllowance < 0 with availableFunds > 0 → status lewat', () => {
    const r = computeAllowance(
      base({
        spendableBalance: 100_000,
        transactionsToday: [{ kind: 'out', amount: 200_000, commitmentId: null }],
        daysRemaining: 10
      })
    )
    expect(r.status).toBe('lewat')
    expect(r.remainingAllowance).toBeLessThan(0)
  })
})

describe('allowanceBand — anti-habituation visual treatment', () => {
  it('tenang below 60%', () => {
    expect(allowanceBand(0)).toBe('tenang')
    expect(allowanceBand(0.59)).toBe('tenang')
  })

  it('waspada 60–90%', () => {
    expect(allowanceBand(0.6)).toBe('waspada')
    expect(allowanceBand(0.89)).toBe('waspada')
  })

  it('mendesak 90–100%', () => {
    expect(allowanceBand(0.9)).toBe('mendesak')
    expect(allowanceBand(1)).toBe('mendesak')
  })

  it('terlampaui above 100%, and when null (minus condition)', () => {
    expect(allowanceBand(1.01)).toBe('terlampaui')
    expect(allowanceBand(null)).toBe('terlampaui')
  })
})

describe('projectedOverspend — intervention at the moment of decision', () => {
  it('0 when the amount does not exceed the remaining allowance', () => {
    expect(projectedOverspend(10_000, 20_000)).toBe(0)
    expect(projectedOverspend(20_000, 20_000)).toBe(0)
  })

  it('returns the overspend amount when the amount exceeds the remaining allowance', () => {
    expect(projectedOverspend(32_500, 20_000)).toBe(12_500)
  })
})
