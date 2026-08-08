// main.ts — Deno Deploy entry point (spec §11). A "walking skeleton": the HTTP
// webhook, Telegram plumbing, and secret verification are real and runnable;
// the message handler currently does the one slice that needs no database or
// LLM key — it reads the amount out of the text and echoes it back — so the
// deployment shape can be exercised end-to-end before Phase 1 fills in AI
// parsing, persistence, and the allowance computation.
//
// Env (Deno Deploy dashboard):
//   TELEGRAM_BOT_TOKEN        — from @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — the secret_token set on setWebhook; Telegram
//                               echoes it in X-Telegram-Bot-Api-Secret-Token
//   DATABASE_URL              — PostgreSQL connection string (Phase 1, unused here)
//   GOOGLE_AI_API_KEY         — Gemini/Gemma via Google AI Studio (Phase 1, unused here)

import { formatRupiah, parseAmount } from './domain/money.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

/** Minimal shape of the Telegram update fields this skeleton reads. */
interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set — skipping sendMessage')
    return
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) {
    console.error('sendMessage failed', res.status, await res.text())
  }
}

/**
 * Phase 1 replaces this with: AI parse (Gemini Flash) → route
 * (expense/income/commitment/transfer/edit/ask) → repository write → compute
 * allowance → format. For now it proves the wiring by reading the amount.
 */
function handleText(text: string): string {
  const amount = parseAmount(text)
  if (amount === null) {
    return '🤔 Belum kebaca angkanya. (Bot masih tahap fondasi — parser AI menyusul.)'
  }
  return [
    `Kebaca: ${formatRupiah(amount)}`,
    '(Bot masih tahap fondasi: kategorisasi AI, simpan ke database, dan',
    'hitung jatah harian menyusul di Fase 1.)',
  ].join('\n')
}

async function handleWebhook(req: Request): Promise<Response> {
  // Verify the shared secret Telegram echoes back (spec §15 #5).
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const message = update.message
  if (message?.text) {
    await sendMessage(message.chat.id, handleText(message.text))
  }

  // Telegram only needs a 200 to consider the update delivered.
  return new Response('ok')
}

export function handler(req: Request): Promise<Response> | Response {
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname === '/') {
    return new Response('MalasFinance v3 bot — ok')
  }
  if (req.method === 'POST' && url.pathname === '/webhook') {
    return handleWebhook(req)
  }
  return new Response('not found', { status: 404 })
}

// Deno Deploy (and `deno serve` locally, via the deno.json tasks) invokes the
// default export's fetch handler.
export default { fetch: handler }
