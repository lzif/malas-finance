import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { clearLogs, recentLogs, record, redact } from './logbuf.ts'

describe('redact', () => {
  it('replaces a secret wherever it appears', () => {
    const out = redact('connect failed for postgresql://u:hunter2pass@host/db', [
      'postgresql://u:hunter2pass@host/db',
    ])
    expect(out).toBe('connect failed for «redacted»')
  })

  it('redacts a secret embedded mid-string, and every occurrence', () => {
    // The realistic case: a driver or fetch error quotes what it was given.
    const token = '8123456789:AAF-quite-a-long-telegram-token'
    const out = redact(`POST /bot${token}/sendMessage failed; retry ${token}`, [token])
    expect(out).toBe('POST /bot«redacted»/sendMessage failed; retry «redacted»')
    expect(out.includes(token)).toBe(false)
  })

  it('handles several secrets at once', () => {
    const out = redact('key=AIzaSECRETVALUE1 db=postgres://a:pw@h/d', [
      'AIzaSECRETVALUE1',
      'postgres://a:pw@h/d',
    ])
    expect(out).toBe('key=«redacted» db=«redacted»')
  })

  it('ignores short values that would match everywhere', () => {
    // A 2-character "secret" would otherwise turn the log into placeholders.
    expect(redact('an ordinary message', ['an'])).toBe('an ordinary message')
  })

  it('ignores empty secrets and leaves clean text untouched', () => {
    expect(redact('nothing to hide', [''])).toBe('nothing to hide')
    expect(redact('nothing to hide', [])).toBe('nothing to hide')
  })
})

describe('log buffer', () => {
  it('records entries and returns them oldest-first', () => {
    clearLogs()
    record('log', ['first'])
    record('error', ['second'])
    const entries = recentLogs()
    expect(entries.length).toBe(2)
    expect(entries[0].message).toBe('first')
    expect(entries[1].level).toBe('error')
    expect(entries[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('formats non-string arguments the way a reader expects', () => {
    clearLogs()
    record('error', ['failed', new Error('boom'), { a: 1 }])
    expect(recentLogs()[0].message).toBe('failed Error: boom {"a":1}')
  })

  it('limit returns only the most recent entries', () => {
    clearLogs()
    for (let i = 0; i < 10; i++) record('log', [`m${i}`])
    const last3 = recentLogs(3)
    expect(last3.length).toBe(3)
    expect(last3[2].message).toBe('m9')
  })

  it('caps the buffer instead of growing without bound', () => {
    clearLogs()
    for (let i = 0; i < 260; i++) record('log', [`m${i}`])
    const all = recentLogs(500)
    expect(all.length).toBe(200)
    // Oldest were dropped, newest kept.
    expect(all[all.length - 1].message).toBe('m259')
    expect(all[0].message).toBe('m60')
  })
})
