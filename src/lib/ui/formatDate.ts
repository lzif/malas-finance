// ui/formatDate.ts — short date formatting for display, e.g. "25 Agu".
// Not part of domain/ (purely cosmetic UI), but has no dependency on db/svelte.

import { parseDayKey } from '../domain/day'

// Indonesian month abbreviations — deliberately kept in Indonesian: this is
// user-facing display text (spec's UI-copy exception), not an identifier.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

export function formatDateShort(dayKey: string): string {
  const { month, day } = parseDayKey(dayKey)
  return `${day} ${MONTHS[month - 1]}`
}
