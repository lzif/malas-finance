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
import { admin } from './admin/routes.ts'
import { web } from './web/app.ts'
import { installLogCapture } from './admin/logbuf.ts'

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

// Tee console output into the in-memory buffer /admin/logs reads. Installed
// here rather than on import so the module stays side-effect-free for tests.
installLogCapture()

const app = new Hono()

// One line per request. Without it the Deploy log stream shows only cold
// starts: a healthy request is invisible, and a request that succeeds with the
// wrong answer leaves no trace at all. Registered before the routes so it
// wraps them.
//
// Method, path, status and duration only — deliberately no headers (the
// webhook carries the shared secret in X-Telegram-Bot-Api-Secret-Token) and no
// body (it carries the user's message text). `finally` so a throwing handler
// still gets logged.
app.use('*', async (c, next) => {
  const start = performance.now()
  try {
    await next()
  } finally {
    const ms = Math.round(performance.now() - start)
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`)
  }
})

app.get('/', (c) => c.text('MalasFinance v3 bot — ok'))

// Maintenance endpoints, authenticated with TELEGRAM_WEBHOOK_SECRET via the
// x-admin-secret header (see admin/routes.ts).
app.route('/admin', admin)

// Read-only dashboard (spec §10). Authenticated by the Telegram initData
// signature inside web/, not by a secret of its own — see web/auth.ts.
app.route('/app', web)

// Whoever sets the WebApp URL in BotFather may or may not type the trailing
// slash; only /app matches the mounted route, so make the other spelling work
// instead of showing a 404 that looks like the dashboard is broken.
app.get('/app/', (c) => c.redirect('/app', 301))

app.post('/webhook', (c) => {
  if (!webhook) return c.text('forbidden', 403)
  return webhook(c.req.raw)
})

// Deno Deploy (and `deno serve` locally, via the deno.json tasks) invokes the
// default export's fetch handler; a Hono app is `{ fetch }`-shaped.
export default app
