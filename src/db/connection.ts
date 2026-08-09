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
// `sql` is a tagged-template function: interpolations become bound parameters,
// never string-concatenated, so this is injection-safe by construction.
//   const rows = await sql`SELECT * FROM wallets WHERE id = ${id}`

import { neon } from '@neondatabase/serverless'

const url = Deno.env.get('DATABASE_URL')
if (!url) {
  throw new Error('DATABASE_URL is not set — cannot connect to PostgreSQL')
}

export const sql = neon(url)
