import { describe, expect, it } from 'vitest'
import { cycleFor } from './cycle'
import type { CycleSettings } from './types'

function monthlyDay(anchor: number): CycleSettings {
  return { cycleMode: 'monthly-day', cycleAnchorDay: anchor, cycleManualEnd: null }
}

describe('cycleFor — monthly-day', () => {
  it('cycleAnchorDay = 31 in February of a common year (28 days) is clamped', () => {
    // 2025 is not a leap year. Today is mid-February → the cycle starts on
    // January 31 (clamped valid) through February 27 (28 - 1).
    const r = cycleFor('2025-02-15', monthlyDay(31))
    expect(r.start).toBe('2025-01-31')
    expect(r.end).toBe('2025-02-27')
  })

  it('cycleAnchorDay = 31 in February of a leap year (29 days) is clamped', () => {
    const r = cycleFor('2024-02-15', monthlyDay(31))
    expect(r.start).toBe('2024-01-31')
    expect(r.end).toBe('2024-02-28')
  })

  it('cycleAnchorDay = 31 when the next cycle also lands in a leap February', () => {
    const r = cycleFor('2024-03-01', monthlyDay(31))
    expect(r.start).toBe('2024-02-29')
    expect(r.end).toBe('2024-03-30')
  })

  it('cycleAnchorDay = 30 in February is clamped to the last day of the month', () => {
    const r = cycleFor('2025-02-10', monthlyDay(30))
    expect(r.start).toBe('2025-01-30')
    expect(r.end).toBe('2025-02-27')
  })

  it('last day of the cycle → daysRemaining === 1, never 0', () => {
    const r = cycleFor('2025-02-27', monthlyDay(31))
    expect(r.end).toBe('2025-02-27')
    expect(r.daysRemaining).toBe(1)
  })

  it('the day before the cycle ends → daysRemaining === 2', () => {
    const r = cycleFor('2025-02-26', monthlyDay(31))
    expect(r.daysRemaining).toBe(2)
  })

  it('year boundary: an anchor near the end of December crosses into January', () => {
    const r = cycleFor('2025-12-28', monthlyDay(25))
    expect(r.start).toBe('2025-12-25')
    expect(r.end).toBe('2026-01-24')
  })

  it('a day exactly on the anchor date starts a new cycle', () => {
    const r = cycleFor('2025-06-10', monthlyDay(10))
    expect(r.start).toBe('2025-06-10')
    expect(r.end).toBe('2025-07-09')
  })
})

describe('cycleFor — manual', () => {
  it('end date not yet passed → active status', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-30' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('active')
    expect(r.end).toBe('2025-06-30')
  })

  it('end date already passed → cycle-expired, falls back to rolling behavior (30-day horizon)', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-10' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('cycle-expired')
    expect(r.end).toBe('2025-07-14') // 2025-06-15 + 29
    expect(r.daysRemaining).toBe(30)
  })

  it('cycleManualEnd === today is still considered not yet passed', () => {
    const settings: CycleSettings = { cycleMode: 'manual', cycleAnchorDay: 1, cycleManualEnd: '2025-06-15' }
    const r = cycleFor('2025-06-15', settings)
    expect(r.status).toBe('active')
    expect(r.daysRemaining).toBe(1)
  })
})

describe('cycleFor — rolling', () => {
  it('cycleEnd is always today + 29, a 30-day horizon', () => {
    const settings: CycleSettings = { cycleMode: 'rolling', cycleAnchorDay: 1, cycleManualEnd: null }
    const r = cycleFor('2025-06-15', settings)
    expect(r.end).toBe('2025-07-14')
    expect(r.daysRemaining).toBe(30)
    expect(r.status).toBe('active')
  })

  it('crossing a year boundary keeps the 30-day horizon', () => {
    const settings: CycleSettings = { cycleMode: 'rolling', cycleAnchorDay: 1, cycleManualEnd: null }
    const r = cycleFor('2025-12-20', settings)
    expect(r.end).toBe('2026-01-18')
    expect(r.daysRemaining).toBe(30)
  })
})
