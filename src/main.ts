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

import { handleMessage } from './bot/webhook.ts'

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
