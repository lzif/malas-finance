// web/auth.ts — Telegram WebApp initData validation.
//
// The dashboard is opened from inside Telegram, which hands the page a signed
// `initData` string. Validating that signature is what proves the request came
// from Telegram on behalf of a specific user — so the dashboard needs no
// password of its own, and no new secret to leak.
//
// Deliberately NOT reused: the admin secret. That one key already permits a
// database wipe (admin/routes.ts); putting it in a web page's query string or
// localStorage would spread it across browser history and referrer headers.
//
// Reference: the hash is HMAC-SHA256 over the sorted "key=value" lines, keyed
// by HMAC-SHA256("WebAppData", botToken).

const encoder = new TextEncoder()

/** How long a signed initData stays acceptable. Telegram's own guidance. */
const MAX_AGE_SECONDS = 24 * 60 * 60

export interface TelegramUser {
  id: number
  firstName: string | null
  username: string | null
}

export type AuthResult =
  | { ok: true; user: TelegramUser }
  | { ok: false; reason: string }

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compare two hex digests without leaking where they first differ.
 *
 * A plain `===` on a secret-derived value is a timing oracle: an attacker who
 * can measure the response can recover the expected hash a nibble at a time.
 * Cheap to avoid, so avoid it.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Verify `initData` and return the Telegram user it was signed for.
 *
 * Fails closed on every uncertainty: no token configured, no hash, a stale
 * auth_date, or a signature that does not match.
 */
export async function verifyInitData(initData: string, botToken: string): Promise<AuthResult> {
  if (!botToken) return { ok: false, reason: 'bot token not configured' }
  if (!initData) return { ok: false, reason: 'no initData' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash' }

  // The hash itself is never part of the signed payload.
  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secretKey = await hmac(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmac(secretKey, dataCheckString))
  if (!timingSafeEqual(expected, hash)) return { ok: false, reason: 'bad signature' }

  // A valid signature is forever; without this check a single captured
  // initData would be a permanent bearer token for the dashboard.
  const authDate = Number(params.get('auth_date') ?? '0')
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: 'no auth_date' }
  }
  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > MAX_AGE_SECONDS) return { ok: false, reason: 'initData expired' }

  const rawUser = params.get('user')
  if (!rawUser) return { ok: false, reason: 'no user' }
  try {
    const parsed = JSON.parse(rawUser) as Record<string, unknown>
    const id = Number(parsed.id)
    if (!Number.isFinite(id)) return { ok: false, reason: 'no user id' }
    return {
      ok: true,
      user: {
        id,
        firstName: (parsed.first_name as string) ?? null,
        username: (parsed.username as string) ?? null,
      },
    }
  } catch {
    return { ok: false, reason: 'unparseable user' }
  }
}
