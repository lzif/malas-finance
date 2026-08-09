// main.ts — Deno Deploy entry point (spec §11). HTTP transport only: route,
// verify Telegram's shared secret, hand the text to bot/webhook.ts, send the
// reply back. All product logic lives behind `handleMessage`.
//
// Env (Deno Deploy dashboard):
//   TELEGRAM_BOT_TOKEN        — from @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — the secret_token set on setWebhook; Telegram
//                               echoes it in X-Telegram-Bot-Api-Secret-Token
//   DATABASE_URL              — PostgreSQL connection string
//   GOOGLE_AI_API_KEY         — Gemini/Gemma via Google AI Studio
//   TZ                        — MUST be Asia/Jakarta. See the check below.

import { handleMessage } from './bot/webhook.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

/** WIB is UTC+7; getTimezoneOffset reports minutes *behind* UTC, hence -420. */
const WIB_OFFSET_MINUTES = -420

// dayKeyOf() reads the process's local calendar day, and Deno Deploy isolates
// run as UTC unless TZ says otherwise. Left unset, every transaction logged
// between 00:00 and 07:00 WIB is filed against *yesterday*: it lands on a day
// whose allowance is already spent while the new day still reads full, and the
// cycle rolls over a day late. That is the anchor number lying — the one
// failure this app cannot absorb (spec §2, §17 criterion 7) — so say so loudly
// at boot rather than letting it hide in a plausible-looking number.
if (new Date().getTimezoneOffset() !== WIB_OFFSET_MINUTES) {
  console.error(
    `TZ is not Asia/Jakarta (offset ${-new Date().getTimezoneOffset()}min vs expected 420min). ` +
      'dayKey will be computed for the wrong calendar day. Set TZ=Asia/Jakarta.',
  )
}

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

async function handleWebhook(req: Request): Promise<Response> {
  // Verify the shared secret Telegram echoes back (spec §15 #5). This header
  // is the entire security model, so it fails CLOSED: an unset secret used to
  // skip the check, which was harmless when the handler only echoed text but
  // is not now that it writes to the ledger and spends Gemini calls. With the
  // check skipped, the first stranger to POST here would claim
  // settings.telegram_chat_id and lock the owner out of their own bot, with no
  // reset path outside direct database access.
  if (!WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not set — refusing all webhook requests')
    return new Response('forbidden', { status: 403 })
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
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
    // handleMessage turns its own failures into replies; this catch only
    // covers the unexpected, so one bad update never leaves Telegram retrying
    // the same message forever.
    let reply: string
    try {
      reply = await handleMessage(message.text, message.chat.id)
    } catch (err) {
      console.error('handleMessage threw', err)
      reply = '⚠️ Ada error tak terduga. Coba lagi.'
    }
    await sendMessage(message.chat.id, reply)
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
