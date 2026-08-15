// db/connection.ts — the single PostgreSQL connection for the whole app.
//
// Uses postgres.js (a standard TCP client), not an HTTP driver. This is a
// change from the original design: v3 targeted Neon's serverless HTTP driver
// because Deploy Classic only allowed outbound HTTPS, so a raw :5432 socket
// hung. The new Deno Deploy runtime allows outbound TCP and ships a built-in
// Postgres that injects DATABASE_URL, so a normal client is both possible and
// simpler — one fewer external service, and the connection string is provided
// by the platform rather than pasted into the dashboard.
//
// postgres.js keeps the tagged-template query API the repo layer already uses
// (`sql`SELECT ... ${value}``), so the swap touches this file and the
// migration runner, not the four repo modules.
//
// Lazy: the pool is created on first use, not at import time. This lets repo
// modules be imported in permissionless `deno test` (where Deno.env.get throws
// NotCapable) — integration tests that actually hit the DB skip when
// DATABASE_URL is absent, and the import itself never explodes.

import postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

let _sql: Sql | undefined

export function getSql(): Sql {
  if (!_sql) {
    const url = Deno.env.get('DATABASE_URL')
    if (!url) throw new Error('DATABASE_URL is not set — cannot connect to PostgreSQL')
    // Swallow server NOTICEs. schema.sql is deliberately idempotent
    // (`CREATE ... IF NOT EXISTS` twelve times over), so every re-run of the
    // pre-deploy migration makes Postgres emit twelve 42P07 "already exists,
    // skipping" notices, which postgres.js prints by default. Deploy runs the
    // pre-deploy command once per partition, so that is 24 lines of noise per
    // deploy — enough to bury the logs that matter.
    _sql = postgres(url, { onnotice: () => {} })
  }
  return _sql
}

/**
 * Close the pool and reset the singleton. The long-lived server never calls
 * this — the pool should live as long as the isolate. It exists for one-shot
 * processes (the migration runner) and for tests, where an open TCP pool would
 * otherwise trip Deno's resource sanitizer or leave the process hanging.
 */
export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end()
    _sql = undefined
  }
}
