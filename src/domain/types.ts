// domain/types.ts — pure data types shared across domain/. No imports.

export type CycleMode = 'monthly-day' | 'weekly' | 'manual' | 'rolling'

export interface CycleSettings {
  cycleMode: CycleMode
  /**
   * For 'monthly-day': 1..31, clamped to the end of the month when needed.
   * For 'weekly': 0..6 (0 = Sunday … 6 = Saturday), the payday weekday.
   */
  cycleAnchorDay: number
  /** dayKey of the next cycle end, used for 'manual' mode. */
  cycleManualEnd: string | null
}

export type CycleStatus = 'active' | 'cycle-expired'

export interface CycleResult {
  /** dayKey of the cycle start. */
  start: string
  /** dayKey of the cycle end. */
  end: string
  /** cycle length in days, inclusive of both ends. */
  length: number
  /** days remaining including today, minimum 1 (spec §4.2). */
  daysRemaining: number
  status: CycleStatus
}

export type Kind = 'out' | 'in' | 'move'

/** Why an expense happened (spec §7.1). AI-assigned in v3. */
export type Intent = 'planned' | 'routine' | 'impulse' | 'emergency'
