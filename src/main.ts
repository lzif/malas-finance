// main.ts — Deno Deploy entry point (spec §11). HTTP transport only: Hono
// routes the request, grammY owns the Telegram webhook, and all product logic
// lives behind `handleMessage`. This file holds no domain math and no SQL.
//
// Env (Deno Deploy dashboard, or `deno deploy env`):
//   TELEGRAM_BOT_TOKEN        — from @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — the secret_token set on setWebhook; grammY
//                               checks it against X-Telegram-Bot-Api-Secret-Token
//   DATABASE_URL              — Postgres connection string. Injected automatically
//                               by the Deno Deploy built-in database.
//   GOOGLE_AI_API_KEY         — Gemini/Gemma via Google AI Studio
//
// No TZ setting is required: the calendar day is computed against an
// explicitly named zone (domain/day.ts, APP_TIME_ZONE), not the process's.

import { Hono } from '@hono/hono'
import { Bot, webhookCallback } from 'grammy'
import { handleMessage } from './bot/webhook.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

type WebhookHandler = (req: Request) => Promise<Response>

/**
 * Build the /webhook handler, or return null to leave it disabled.
 *
 * Fails CLOSED: the webhook is wired only when BOTH the bot token and the
 * shared secret are present. grammY skips the secret check entirely when no
 * secretToken is passed, so serving the route without a configured secret
 * would be an unauthenticated write endpoint — the first stranger to POST
 * would claim the ledger (spec §15 #5). Missing either, the route 403s.
 */
function buildWebhook(): WebhookHandler | null {
  const missing = [
    !BOT_TOKEN && 'TELEGRAM_BOT_TOKEN',
    !WEBHOOK_SECRET && 'TELEGRAM_WEBHOOK_SECRET',
  ].filter(Boolean)
  if (missing.length > 0) {
    console.error(`Webhook disabled — ${missing.join(' and ')} not set`)
    return null
  }

  const bot = new Bot(BOT_TOKEN)

  bot.on('message:text', async (ctx) => {
    const reply = await handleMessage(ctx.message.text, ctx.chat.id)
    await ctx.reply(reply)
  })

  // Keep a handler error from becoming a 500, which would make Telegram retry
  // the same update indefinitely. handleMessage already turns its own failures
  // into replies; this covers a failing ctx.reply (e.g. a Telegram API blip).
  bot.catch((err) => console.error('grammy handler error', err))

  const callback = webhookCallback(bot, 'std/http', { secretToken: WEBHOOK_SECRET })

  // Initialize on first request, not at import: constructing the bot is free,
  // but bot.init() calls getMe over the network. Doing it lazily keeps this
  // module import-safe (no network side effect for tests or tooling) and costs
  // one getMe per isolate.
  let inited = false
  return async (req: Request): Promise<Response> => {
    if (!inited) {
      await bot.init()
      inited = true
    }
    return await callback(req)
  }
}

const webhook = buildWebhook()

const app = new Hono()

app.get('/', (c) => c.text('MalasFinance v3 bot — ok'))

app.post('/webhook', (c) => {
  if (!webhook) return c.text('forbidden', 403)
  return webhook(c.req.raw)
})

// Deno Deploy (and `deno serve` locally, via the deno.json tasks) invokes the
// default export's fetch handler; a Hono app is `{ fetch }`-shaped.
export default app
