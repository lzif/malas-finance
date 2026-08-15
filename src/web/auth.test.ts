import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { verifyInitData } from './auth.ts'

const TOKEN = '123456:test-token-not-a-real-one'
const encoder = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return await crypto.subtle.sign('HMAC', k, encoder.encode(message))
}

/** Build a correctly signed initData, the way Telegram would. */
async function sign(fields: Record<string, string>): Promise<string> {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secretKey = await hmac(encoder.encode('WebAppData'), TOKEN)
  const hash = [...new Uint8Array(await hmac(secretKey, dataCheckString))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const params = new URLSearchParams(fields)
  params.set('hash', hash)
  return params.toString()
}

const now = () => Math.floor(Date.now() / 1000)

describe('verifyInitData', () => {
  it('accepts data Telegram actually signed and returns the user', async () => {
    const initData = await sign({
      auth_date: String(now()),
      query_id: 'abc',
      user: JSON.stringify({ id: 42, first_name: 'Luki', username: 'lzif' }),
    })
    const result = await verifyInitData(initData, TOKEN)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.id).toBe(42)
      expect(result.user.username).toBe('lzif')
    }
  })

  it('rejects a tampered field even though the hash is otherwise well-formed', async () => {
    const initData = await sign({
      auth_date: String(now()),
      user: JSON.stringify({ id: 42, first_name: 'Luki' }),
    })
    // Swap in a different user id while keeping the original signature — the
    // exact move someone would make to read another account's dashboard.
    const tampered = new URLSearchParams(initData)
    tampered.set('user', JSON.stringify({ id: 99, first_name: 'Luki' }))

    const result = await verifyInitData(tampered.toString(), TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad signature')
  })

  it('rejects a signature made with a different bot token', async () => {
    const initData = await sign({
      auth_date: String(now()),
      user: JSON.stringify({ id: 42 }),
    })
    const result = await verifyInitData(initData, '999:some-other-token')
    expect(result.ok).toBe(false)
  })

  it('rejects initData older than a day, so a captured one is not a forever pass', async () => {
    const initData = await sign({
      auth_date: String(now() - 25 * 60 * 60),
      user: JSON.stringify({ id: 42 }),
    })
    const result = await verifyInitData(initData, TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('initData expired')
  })

  it('fails closed on empty input and on a missing bot token', async () => {
    expect((await verifyInitData('', TOKEN)).ok).toBe(false)
    expect((await verifyInitData('user=%7B%7D', TOKEN)).ok).toBe(false)

    const valid = await sign({ auth_date: String(now()), user: JSON.stringify({ id: 1 }) })
    const result = await verifyInitData(valid, '')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bot token not configured')
  })
})
