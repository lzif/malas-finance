// domain/money.ts — rupiah formatting and parsing. Pure functions.
// Money is stored as whole rupiah in a `number` (spec §4.1, "Integer rupiah").

/** 1234500 → "Rp 1.234.500" */
export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const digits = Math.round(Math.abs(amount)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}Rp ${grouped}`
}

/** Format without "Rp": 1234500 → "1.234.500" */
export function formatNumber(amount: number): string {
  const digits = Math.round(Math.abs(amount)).toString()
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Strip everything but digits, then parse as an integer. "" → 0. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  if (digits === '') return 0
  return parseInt(digits, 10)
}

/**
 * parseAmount — the money parser the bot's natural-language input needs (spec §6).
 * Understands the Indonesian shorthand a user actually types:
 *
 *   "27.5k"   → 27500       (k / rb / ribu = ×1.000)
 *   "27,5k"   → 27500       (comma is a decimal separator here, not a grouper)
 *   "2.4jt"   → 2_400_000   (jt / juta = ×1.000.000)
 *   "600k"    → 600000
 *   "1.500"   → 1500        (dotted grouping, no suffix → literal rupiah)
 *   "50000"   → 50000
 *
 * Returns null when no amount can be read, so callers can fall back to
 * asking the user (spec §6.6 "Amount only, no context") rather than saving 0.
 *
 * The ambiguity this resolves: a bare "1.500" means one-thousand-five-hundred
 * rupiah (dot = thousands grouping), but "1.5k" means the dot is a decimal
 * point scaled by the suffix. The suffix is what disambiguates: with a
 * multiplier suffix the separator is decimal; without one it is grouping.
 */
export function parseAmount(input: string): number | null {
  const lower = input.toLowerCase()
  // First number-ish run with an optional k/rb/ribu/jt/juta suffix.
  const m = lower.match(/(\d[\d.,]*)\s*(jt|juta|rb|ribu|k)?/)
  if (!m) return null

  const rawNumber = m[1]
  const suffix = m[2] ?? ''

  const multiplier = suffix === 'k' || suffix === 'rb' || suffix === 'ribu'
    ? 1_000
    : suffix === 'jt' || suffix === 'juta'
    ? 1_000_000
    : 1

  let value: number
  if (multiplier === 1) {
    // No suffix: dots and commas are thousands grouping. "1.500" → 1500.
    const digits = rawNumber.replace(/[.,]/g, '')
    if (digits === '') return null
    value = parseInt(digits, 10)
  } else {
    // Suffixed: the last dot/comma is a decimal point. "27,5k" / "2.4jt".
    const normalized = rawNumber.replace(/,/g, '.')
    const parts = normalized.split('.')
    // Join all but the last group as the integer part; the last is the fraction.
    const fraction = parts.length > 1 ? parts.pop()! : ''
    const integer = parts.join('') || '0'
    const asFloat = parseFloat(`${integer}.${fraction || '0'}`)
    if (Number.isNaN(asFloat)) return null
    value = asFloat * multiplier
  }

  const rounded = Math.round(value)
  return rounded > 0 ? rounded : null
}
