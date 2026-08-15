// bot/parser.ts — the AI input parser (spec §6, §7). Turns a free-text Telegram
// message ("rokok surya 27.5k abis lembur") into a structured intent the router
// can act on, with the AI assigning both the "why" (intent) and the "what"
// (category) — the core of the v3 pivot (spec §1, K2).
//
// Transport note: this calls Google AI Studio's Gemini REST endpoint directly
// (JSON mode via responseSchema) rather than the Vercel AI SDK named in spec
// §3. The prompt, schema, and post-processing — the parts that carry the
// product logic — are transport-independent; swapping in the AI SDK later is a
// tracked refinement (TODO.md), not a redesign. The primary model is
// gemini-2.5-flash; the caller handles fallback/retry (spec §15 #8).
//
// The deterministic pieces (hard-rule enforcement, amount backfill) are pure
// functions, unit-tested without touching the network. Only `parseMessage`
// reaches out to the model.

import type { Intent } from '../domain/types.ts'
import { parseAmount } from '../domain/money.ts'

/** What kind of thing the user's message is (spec §6). */
export type ParsedKind = 'expense' | 'income' | 'transfer' | 'commitment' | 'clarify'

export interface ParsedInput {
  kind: ParsedKind
  /** Whole rupiah. null only for `clarify`. */
  amount: number | null
  /** Cleaned item/label, e.g. "Rokok Surya". */
  item: string
  /** AI-assigned intent for expenses; null otherwise (spec §7). */
  intent: Intent | null
  /** Top-level category name from the taxonomy (spec §5.3). */
  category: string | null
  /** Subcategory name under `category`. */
  subcategory: string | null
  /** Wallet the user named, or null to mean the default (spec §12). */
  wallet: string | null
  /** For commitments: day of month it recurs (spec §6.4). */
  dueDay: number | null
  /** Free-text context the AI pulled out (spec §6.8). */
  notes: string | null
  /** The question to ask, only when kind === 'clarify' (spec §6.7). */
  question: string | null
}

export interface ParserContext {
  /** Top-level category names the AI must prefer to reuse (spec §5.3 rule 1). */
  categories: string[]
  /** Wallet names that exist; a single wallet means "never ask which" (spec §6.7). */
  wallets: string[]
}

/**
 * Items that are ALWAYS impulsif and cannot be relabelled by the model
 * (spec §7.2 "Always IMPULSIF"). Matched case-insensitively as substrings of
 * the item text. This is a hard rule enforced in code, not a suggestion to the
 * AI — the whole point of the pivot is that the label is not negotiable for
 * these (spec §1, K2).
 */
const ALWAYS_IMPULSE = ['rokok', 'vape', 'liquid', 'alkohol', 'alcohol', 'bir', 'miras']

/**
 * enforceHardRules — pure. Overrides the model's intent to `impulse` when the
 * item is on the non-negotiable list, regardless of what the AI returned.
 * Applied to every expense after parsing.
 */
export function enforceHardRules(parsed: ParsedInput): ParsedInput {
  if (parsed.kind !== 'expense') return parsed
  const hay = `${parsed.item} ${parsed.notes ?? ''}`.toLowerCase()
  if (ALWAYS_IMPULSE.some((w) => hay.includes(w))) {
    return { ...parsed, intent: 'impulse' }
  }
  return parsed
}

/**
 * backfillAmount — pure. If the model failed to return a numeric amount but the
 * text plainly contains one, recover it with the deterministic parser
 * (spec §6.2) rather than falling back to a needless clarify round.
 */
export function backfillAmount(parsed: ParsedInput, text: string): ParsedInput {
  if (parsed.amount !== null || parsed.kind === 'clarify') return parsed
  const recovered = parseAmount(text)
  return recovered === null ? parsed : { ...parsed, amount: recovered }
}

const SYSTEM_PROMPT =
  `Kamu adalah parser transaksi keuangan untuk bot Telegram pribadi berbahasa Indonesia.
Tugasmu mengubah pesan bebas jadi data terstruktur. Kamu yang memutuskan intent, BUKAN user.

Aturan intent (spec §7.2):
- SELALU impulse: rokok, vape, liquid, alkohol, dan barang adiktif.
- SELALU routine: makan pokok (bukan restoran mahal), bensin harian, toiletries/kebutuhan rumah.
- planned: hanya kalau user menyebut sudah direncanakan, atau jelas barang pertimbangan (elektronik, furnitur).
- emergency: hanya darurat sungguhan (medis, ban bocor). "pengen banget" itu impulse, bukan emergency.
- Sisanya, nilai dari konteks: makan di luar, kopi beli, pakaian dadakan cenderung impulse.

Aturan kategori (spec §5.3): cocokkan ke kategori yang sudah ada dulu, jangan bikin yang tumpang tindih.

Kind:
- expense: pengeluaran biasa (default).
- income: ada tanda "+" atau kata pemasukan/gajian/saldo. "+saldo 500k" artinya
  user melaporkan duit yang dia punya sekarang — itu income, item "Saldo awal".
- transfer: "pindah ... ke ...", ATAU nabung tanpa tanggal ("nabung 150k") — itu
  duit pindah ke tabungan, BUKAN commitment dan BUKAN expense.
- commitment: HANYA kalau ada tanggal/periode berulang yang eksplisit —
  "pertanggal", "tiap tanggal N", "setiap bulan", "nabung 150k tiap tanggal 5".
  Tanpa tanggal berulang, jangan pernah pakai commitment. Isi "dueDay".
- clarify: kalau amount tidak jelas, ATAU intent benar-benar ambigu (mis. "helm 350k" bisa planned/impulse), ATAU wallet ambigu padahal ada >1 wallet. Isi "question" dalam bahasa Indonesia yang singkat.

Jangan clarify kalau: barang jelas (rokok, makan siang, bensin), atau cuma ada 1 wallet (jangan pernah tanya wallet).
notes: info kontekstual yang bukan amount/item/wallet/kategori (mis. "abis lembur", "sama adi").`

/** Gemini JSON-mode response schema (OpenAPI subset). */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['expense', 'income', 'transfer', 'commitment', 'clarify'] },
    amount: { type: 'integer', nullable: true },
    item: { type: 'string' },
    intent: {
      type: 'string',
      enum: ['planned', 'routine', 'impulse', 'emergency'],
      nullable: true,
    },
    category: { type: 'string', nullable: true },
    subcategory: { type: 'string', nullable: true },
    wallet: { type: 'string', nullable: true },
    dueDay: { type: 'integer', nullable: true },
    notes: { type: 'string', nullable: true },
    question: { type: 'string', nullable: true },
  },
  required: ['kind', 'item'],
}

/**
 * The model chain, tried in order (spec §15 #8). Ordered by free-tier daily
 * request budget, not by raw capability, because a smarter model that has run
 * out of quota parses nothing:
 *
 *   gemini-3.1-flash-lite   500 requests/day, 15/min
 *   gemma-4-26b-a4b-it   14,400 requests/day, 30/min
 *
 * The previous primary, gemini-2.5-flash, allows only **20 requests/day** —
 * about a day of ordinary logging before every message fails. It is not in the
 * chain at all: a tier that small is a liability, not a fallback. Both models
 * here were verified to honour `responseSchema` and to apply the §7.2 hard
 * rules correctly on real Indonesian input.
 */
const MODELS = ['gemini-3.1-flash-lite', 'gemma-4-26b-a4b-it'] as const

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

/** True for failures where trying the next model is worth it. */
function isRetryable(status: number): boolean {
  // 429 = quota/rate limit, 5xx = transient upstream. A 400/403 means the
  // request or key is wrong, and would fail identically on every model.
  return status === 429 || status >= 500
}

async function callModel(
  model: string,
  userPrompt: string,
  apiKey: string,
): Promise<ParsedInput> {
  const res = await fetch(`${endpointFor(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    const err = new Error(`${model} ${res.status}: ${body.slice(0, 300)}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof raw !== 'string') {
    throw new Error(`${model} returned no text: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const obj = JSON.parse(raw)
  return {
    kind: obj.kind,
    amount: obj.amount ?? null,
    item: obj.item ?? '',
    intent: obj.intent ?? null,
    category: obj.category ?? null,
    subcategory: obj.subcategory ?? null,
    wallet: obj.wallet ?? null,
    dueDay: obj.dueDay ?? null,
    notes: obj.notes ?? null,
    question: obj.question ?? null,
  }
}

/**
 * Last resort when no model answers — pure, no network (spec §6.2).
 *
 * The point is that an expense is never silently lost to a quota wall. It
 * cannot know the "why", so it deliberately labels the intent `impulse`: the
 * unflattering default, consistent with FALLBACK_INTENT in bot/webhook.ts, and
 * the honest choice when the alternative is quietly filing unexamined spending
 * as routine (spec §1, K2).
 *
 * Returns null when there is no amount to salvage — then a clarify is right.
 */
export function offlineParse(text: string): ParsedInput | null {
  const amount = parseAmount(text)
  if (amount === null) return null

  // Strip the amount token so the leftover words read as the item label.
  const item = text
    .replace(/[+-]?\s*\d[\d.,]*\s*(k|rb|ribu|jt|juta|m)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const isIncome = /^\s*\+/.test(text) || /\b(gajian|gaji|masuk|terima|bonus|thr)\b/i.test(text)

  return enforceHardRules({
    kind: isIncome ? 'income' : 'expense',
    amount,
    item: item || (isIncome ? 'Pemasukan' : 'Pengeluaran'),
    intent: isIncome ? null : 'impulse',
    category: null,
    subcategory: null,
    wallet: null,
    dueDay: null,
    notes: null,
    question: null,
  })
}

/** Thrown when every model failed AND the text carried no recoverable amount. */
export class ParserUnavailableError extends Error {}

/**
 * parseMessage — walk the model chain, then fall back to deterministic parsing
 * rather than losing the transaction (spec §15 #8).
 *
 * Throws ParserUnavailableError only when no model answered and there was no
 * amount to salvage, so the caller can say something useful.
 */
export async function parseMessage(
  text: string,
  ctx: ParserContext,
  apiKey: string,
): Promise<ParsedInput> {
  const userPrompt = `Wallet yang ada: ${ctx.wallets.join(', ') || '(hanya CASH)'}\n` +
    `Kategori yang ada: ${ctx.categories.join(', ')}\n\n` +
    `Pesan user: ${text}`

  let lastError: unknown
  for (const model of MODELS) {
    try {
      const parsed = await callModel(model, userPrompt, apiKey)
      return backfillAmount(enforceHardRules(parsed), text)
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      // A non-retryable HTTP error (bad key, malformed request) will fail the
      // same way on every model — stop rather than burn the rest of the chain.
      if (typeof status === 'number' && !isRetryable(status)) break
      console.warn(`parser: ${model} failed, trying next`, String(err).slice(0, 200))
    }
  }

  const salvaged = offlineParse(text)
  if (salvaged) {
    console.warn('parser: all models failed, used deterministic fallback')
    return salvaged
  }

  throw new ParserUnavailableError(String(lastError).slice(0, 300))
}
