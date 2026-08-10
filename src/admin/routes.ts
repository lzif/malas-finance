// admin/routes.ts — authenticated maintenance endpoints (spec §11).
//
// AUTH: the `x-admin-secret` header must equal TELEGRAM_WEBHOOK_SECRET.
// Reusing the webhook secret is a deliberate trade for a single-user bot: one
// secret to manage instead of two, at the cost of a wider blast radius if it
// leaks (a leaked secret then also permits a database wipe, not just forged
// updates). If that ever stops being acceptable, give this its own env var —
// only `adminSecret()` below has to change.
//
// Fails CLOSED. With no secret configured every route 503s, so a
// misconfiguration cannot silently expose an open database endpoint.
//
// The secret goes in a header, never a query string: query strings are the
// part of a URL that reliably ends up in access logs and proxy traces.

import { Hono } from '@hono/hono'
import { recentLogs } from './logbuf.ts'
import { clearData, dbSnapshot } from '../db/repo/admin.ts'
import type { ClearScope } from '../db/repo/admin.ts'

function adminSecret(): string {
  try {
    return Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
  } catch {
    return ''
  }
}

/**
 * Constant-time comparison, so response latency cannot be used to discover the
 * secret one character at a time. Length is compared first and does leak, which
 * is a deliberate and standard concession.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const admin = new Hono()

admin.use('*', async (c, next) => {
  const expected = adminSecret()
  if (!expected) {
    console.error('admin routes disabled — TELEGRAM_WEBHOOK_SECRET not set')
    return c.json({ error: 'admin disabled: no secret configured' }, 503)
  }
  if (!secretMatches(c.req.header('x-admin-secret') ?? '', expected)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})

/** Liveness plus which configuration is present — booleans only, never values. */
admin.get('/health', async (c) => {
  const env = (name: string): boolean => {
    try {
      return !!Deno.env.get(name)
    } catch {
      return false
    }
  }

  let database: 'ok' | string
  try {
    const { getSql } = await import('../db/connection.ts')
    await getSql()`SELECT 1`
    database = 'ok'
  } catch (err) {
    database = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  return c.json({
    ok: true,
    now: new Date().toISOString(),
    database,
    configured: {
      TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN'),
      TELEGRAM_WEBHOOK_SECRET: env('TELEGRAM_WEBHOOK_SECRET'),
      GOOGLE_AI_API_KEY: env('GOOGLE_AI_API_KEY'),
      DATABASE_URL: env('DATABASE_URL'),
    },
  })
})

/** What is actually in the database right now. */
admin.get('/db', async (c) => {
  const limit = Number(c.req.query('recent') ?? '20')
  try {
    return c.json(await dbSnapshot(Number.isFinite(limit) ? limit : 20))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

/**
 * Destructive. POST-only and gated behind an explicit `confirm=yes`, so it
 * cannot fire from a link, a prefetch, or a mistyped GET.
 */
admin.post('/db/clear', async (c) => {
  if (c.req.query('confirm') !== 'yes') {
    return c.json({
      error: 'refused: add ?confirm=yes to actually delete',
      scopes: {
        transactions: 'delete the ledger, keep wallets and settings',
        all: 'factory reset: also wallets, custom categories, and settings',
      },
    }, 400)
  }

  const scope = (c.req.query('scope') ?? 'transactions') as ClearScope
  if (scope !== 'transactions' && scope !== 'all') {
    return c.json({ error: `unknown scope '${scope}'; use 'transactions' or 'all'` }, 400)
  }

  try {
    const result = await clearData(scope)
    console.warn(`admin: cleared data (scope=${scope})`, JSON.stringify(result.deleted))
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

/** Recent log lines from THIS isolate, secrets redacted. */
admin.get('/logs', (c) => {
  const limit = Number(c.req.query('limit') ?? '100')
  const entries = recentLogs(Number.isFinite(limit) ? limit : 100)
  return c.json({
    note: 'in-memory, per-isolate, cleared on cold start; ' +
      'Deno Deploy dashboard logs are the durable record',
    count: entries.length,
    entries,
  })
})
