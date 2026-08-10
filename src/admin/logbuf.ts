// admin/logbuf.ts — a small in-memory ring buffer of recent log lines, so the
// deployed bot can be inspected over HTTP (spec §11, admin surface).
//
// Why this exists: Deno Deploy's own logs are the real record, but they are
// only reachable from the dashboard or `deno deploy logs`. An automated helper
// working over HTTPS cannot read those, and cannot reach the database directly
// either (the built-in Postgres is TCP :5432, which is blocked from many
// sandboxes). This buffer gives an authenticated HTTP view of what the isolate
// has been saying.
//
// Two honest limits, by construction:
//   1. It lives in the isolate's memory. A cold start begins with an empty
//      buffer, and separate isolates have separate buffers. It shows "what this
//      instance has seen", never a complete history.
//   2. It is capped, so it drops the oldest lines rather than growing without
//      bound.
//
// Anything durable belongs in Deno Deploy's own logs, which keep working
// because the capture tees to the real console rather than replacing it.

export type LogLevel = 'log' | 'warn' | 'error'

export interface LogEntry {
  /** ISO 8601 timestamp. */
  at: string
  level: LogLevel
  message: string
}

const MAX_ENTRIES = 200

const buffer: LogEntry[] = []

/**
 * Replace secret values with a placeholder.
 *
 * Pure, and deliberately value-based rather than pattern-based: driver and
 * fetch errors have a habit of embedding whatever they were given — a
 * connection string with its password, a URL with `?key=...` — and a pattern
 * list would always be one surprise behind. Redacting the exact values we know
 * are secret catches those cases whatever shape they arrive in.
 *
 * Short values are ignored: a one- or two-character secret would match
 * everywhere and turn the whole log into placeholders.
 */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue
    out = out.replaceAll(secret, '«redacted»')
  }
  return out
}

/** The env values that must never appear in a log response. */
function currentSecrets(): string[] {
  const names = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'GOOGLE_AI_API_KEY',
    'DATABASE_URL',
    'PGPASSWORD',
  ]
  const out: string[] = []
  for (const name of names) {
    try {
      const value = Deno.env.get(name)
      if (value) out.push(value)
    } catch {
      // Permissionless context (e.g. `deno test`): nothing to redact.
    }
  }
  return out
}

/** Render console arguments the way console itself would, roughly. */
function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

export function record(level: LogLevel, args: unknown[]): void {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    message: redact(stringify(args), currentSecrets()),
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)
}

/** Most recent entries last. `limit` caps how many are returned. */
export function recentLogs(limit = MAX_ENTRIES): LogEntry[] {
  const n = Math.max(1, Math.min(limit, MAX_ENTRIES))
  return buffer.slice(-n)
}

export function clearLogs(): void {
  buffer.length = 0
}

let installed = false

/**
 * Tee console.log/warn/error into the buffer. Called explicitly from main.ts
 * rather than on import, so importing this module has no side effect — tests
 * and tooling get the real console untouched.
 */
export function installLogCapture(): void {
  if (installed) return
  installed = true

  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        record(level, args)
      } catch {
        // Capturing must never break the thing being logged.
      }
      original(...args)
    }
  }
}
