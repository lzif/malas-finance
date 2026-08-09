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
- income: ada tanda "+" atau kata pemasukan/gajian.
- transfer: "pindah ... ke ...".
- commitment: "pertanggal", "tiap tanggal", "setiap bulan", "nabung ... tanggal".
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

const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/**
 * parseMessage — call Gemini and return a structured, hard-rule-corrected
 * ParsedInput. Throws on transport/parse failure so the caller can fall back
 * to Gemma or a retry queue (spec §15 #8).
 */
export async function parseMessage(
  text: string,
  ctx: ParserContext,
  apiKey: string,
): Promise<ParsedInput> {
  const userPrompt = `Wallet yang ada: ${ctx.wallets.join(', ') || '(hanya CASH)'}\n` +
    `Kategori yang ada: ${ctx.categories.join(', ')}\n\n` +
    `Pesan user: ${text}`

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
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
    throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof raw !== 'string') {
    throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const obj = JSON.parse(raw)
  const parsed: ParsedInput = {
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

  return backfillAmount(enforceHardRules(parsed), text)
}
