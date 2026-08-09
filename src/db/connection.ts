// db/connection.ts — the single PostgreSQL connection for the whole app.
//
// Uses Neon's serverless HTTP driver, not a raw TCP client. Two reasons this
// is the right choice and not a compromise:
//   1. Deno Deploy and comparable serverless/proxied environments only allow
//      outbound HTTPS — a raw Postgres TCP socket on :5432 simply hangs. The
//      HTTP driver tunnels each query over fetch, so it works where TCP can't.
//   2. Each webhook invocation is a short request/response with no long-lived
//      process to own a connection pool — a stateless per-query HTTP round trip
//      fits that model exactly.
//
// Lazy: the connection is created on first use, not at import time. This lets
// repo modules be imported in permissionless `deno test` (where Deno.env.get
// throws NotCapable) — integration tests that actually call the DB skip when
// DATABASE_URL is absent, and the import itself never explodes.

import { neon } from '@neondatabase/serverless'

type NeonSql = ReturnType<typeof neon>

let _sql: NeonSql | undefined

export function getSql(): NeonSql {
  if (!_sql) {
    const url = Deno.env.get('DATABASE_URL')
    if (!url) throw new Error('DATABASE_URL is not set — cannot connect to PostgreSQL')
    _sql = neon(url)
  }
  return _sql
}
