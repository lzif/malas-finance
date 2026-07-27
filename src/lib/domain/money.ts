// domain/money.ts — rupiah formatting and parsing. Pure functions.
// Money is stored as whole rupiah in a `number` (spec §5.2).

/** 1234500 → "Rp 1.234.500" */
export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const digits = Math.round(Math.abs(amount)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}Rp ${grouped}`
}

/** Format without "Rp", used in the large keypad slot: 1234500 → "1.234.500" */
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
