// bot/commands.ts — deterministic commands handled BEFORE the AI parser
// (spec §11, "fallback slash commands").
//
// Two reasons these do not go through Gemini: they have exact answers the model
// could only get wrong, and they must work when the model cannot be reached —
// `/start` greeting a new user must never depend on an API key or a quota.
//
// Everything here is pure: text in, intent out. The side effects live in
// webhook.ts, which keeps this file unit-testable without a bot or a database.
//
// LANGUAGE RULE (AGENTS.md): user-facing string literals are Bahasa Indonesia.

/** Indonesian weekday names → getUTCDay() numbering (0 = Sunday). */
const WEEKDAYS: Record<string, number> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
}

/** Display names, indexed by weekday number. */
export const WEEKDAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
]

export type Command =
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'allowance' }
  /** Set a weekly pay cycle on `weekday` (0 = Sunday … 6 = Saturday). */
  | { kind: 'set-weekly'; weekday: number }
  /** Set a monthly pay cycle anchored on `day` of the month. */
  | { kind: 'set-monthly'; day: number }
  /** Recognised as a pay-schedule statement, but the day is ambiguous. */
  | { kind: 'payday-unclear' }

/**
 * matchCommand — pure. Returns the command a message maps to, or null to let
 * the AI parser handle it as a transaction.
 *
 * Deliberately conservative: anything not clearly a command returns null, so a
 * mis-match can never swallow an expense the user meant to log.
 */
export function matchCommand(text: string): Command | null {
  const t = text.trim().toLowerCase()
  if (t.length === 0) return null

  // Slash commands, with or without the @botname Telegram appends in groups.
  const slash = t.match(/^\/([a-z]+)(?:@\w+)?$/)
  if (slash) {
    switch (slash[1]) {
      case 'start':
        return { kind: 'start' }
      case 'help':
      case 'bantuan':
        return { kind: 'help' }
      case 'jatah':
      case 'sisa':
        return { kind: 'allowance' }
      default:
        return null
    }
  }

  return matchPaySchedule(t)
}

/**
 * Pay-schedule statements like "gajian tiap sabtu" or "gajian tanggal 25".
 * Requires a pay word AND a recurrence word, so "sabtu beli kopi 20k" — a
 * perfectly ordinary expense — is never mistaken for configuration.
 */
function matchPaySchedule(t: string): Command | null {
  const paid = /\b(gajian|gaji|bayaran|upah|dibayar)\b/.test(t)
  if (!paid) return null

  const recurring = /\b(tiap|setiap|per)\b/.test(t)

  // "gajian tanggal 25" / "gajian tiap tanggal 25" — monthly on a date.
  const monthly = t.match(/\btanggal\s+(\d{1,2})\b/)
  if (monthly) {
    const day = Number(monthly[1])
    if (day >= 1 && day <= 31) return { kind: 'set-monthly', day }
    return { kind: 'payday-unclear' }
  }

  if (!recurring) return null

  // "gajian tiap hari sabtu" / "gajian tiap sabtu" — weekly on a weekday.
  // Matched on a word boundary so "sabtu" inside another word cannot trigger.
  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      // "tiap minggu" means "every week" as often as it means "every Sunday".
      // Only treat it as Sunday when the user said "hari minggu" explicitly.
      if (weekday === 0 && name === 'minggu' && !/\bhari\s+minggu\b/.test(t)) {
        return { kind: 'payday-unclear' }
      }
      return { kind: 'set-weekly', weekday }
    }
  }

  // "gajian tiap minggu" with no day named at all.
  if (/\b(minggu|mingguan|pekan)\b/.test(t)) return { kind: 'payday-unclear' }

  return null
}

/** The welcome shown on /start (spec §13 — no questionnaire, just start). */
export const START_TEXT = [
  '👋 Halo! Aku bantu catat pengeluaran biar kamu tau sisa jatah harian.',
  '',
  'Langsung aja tulis apa yang kamu keluarin, bahasa bebas:',
  '• `rokok surya 27.5k`',
  '• `makan siang 25rb`',
  '• `+gajian 700k` (buat nyatet duit masuk)',
  '',
  'Aku yang nentuin kategori sama labelnya — kamu gak usah mikir.',
  '',
  'Biar angkanya bener, kasih tau dulu:',
  '1. Duitmu sekarang berapa → tulis `+saldo 500k`',
  '2. Gajianmu kapan → tulis `gajian tiap sabtu` atau `gajian tanggal 25`',
].join('\n')

/** The /help text — same information, framed as a reference. */
export const HELP_TEXT = [
  '📖 *Cara pakai*',
  '',
  '*Nyatet pengeluaran* — tulis biasa:',
  '`kopi 18k` · `bensin 20rb` · `makan siang 25000`',
  '',
  '*Duit masuk* — pakai tanda +:',
  '`+gajian 700k` · `+saldo 2jt`',
  '',
  '*Pindah wallet:*',
  '`pindah 200k ke bank`',
  '',
  '*Atur jadwal gajian:*',
  '`gajian tiap sabtu` · `gajian tanggal 25`',
  '',
  '*Perintah:*',
  '/jatah — lihat sisa jatah hari ini',
  '/help — pesan ini',
].join('\n')

/**
 * The nudge appended while spendable balance is still zero. Without it the
 * anchor line reads "dari Rp 0" with no explanation — which looks broken
 * rather than un-configured (and was the first thing seen in real use).
 */
export const ZERO_BALANCE_HINT =
  'ℹ️ Saldomu masih Rp 0, jadi jatah harian belum kehitung. Tulis `+saldo 500k` (sesuai duitmu sekarang) biar akurat.'
