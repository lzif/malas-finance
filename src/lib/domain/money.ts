// domain/money.ts — format dan parsing rupiah. Fungsi murni.
// Uang disimpan sebagai rupiah bulat dalam `number` (spec §5.2).

/** 1234500 → "Rp 1.234.500" */
export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const digits = Math.round(Math.abs(amount)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}Rp ${grouped}`
}

/** Format tanpa "Rp", dipakai di slot keypad besar: 1234500 → "1.234.500" */
export function formatAngka(amount: number): string {
  const digits = Math.round(Math.abs(amount)).toString()
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Buang semua kecuali digit lalu parse ke integer. "" → 0. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  if (digits === '') return 0
  return parseInt(digits, 10)
}
