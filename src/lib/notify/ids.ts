// notify/ids.ts — fixed notification identifiers (spec §8.3: `schedule(id, ...)`
// always re-uses the same id for a given notification "slot" so rescheduling
// replaces the previous occurrence instead of stacking duplicates).
//
// The "no records yet" reminder is pre-scheduled up to 7 days ahead (spec
// §8.5 — surviving an app that is not opened for a few days), so it needs one
// id per day offset, not a single id.

export const ID_ALLOWANCE_EXCEEDED = 1
export const ID_DAILY_SUMMARY = 2
export const ID_WEEKLY_RECAP = 3

/** Days ahead the "no records yet" reminder is pre-scheduled (spec §8.5). */
export const NO_RECORDS_DAYS_AHEAD = 7

const ID_NO_RECORDS_BASE = 10

/** id for the "no records yet" reminder `offset` days from today (0..6). */
export function noRecordsId(offset: number): number {
  return ID_NO_RECORDS_BASE + offset
}
