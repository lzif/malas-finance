import { describe, expect, it } from 'vitest'
import { toMarkdown } from './markdownExport'
import type { Transaction, Wallet } from './schema'

function mkWallet(id: string, name: string): Wallet {
  return { id, name, kind: 'spendable', initialBalance: 0, archived: false, order: 0 }
}

function mkTx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    kind: 'out',
    amount: 1000,
    intent: 'routine',
    tag: null,
    note: null,
    walletId: 'w1',
    toWalletId: null,
    commitmentId: null,
    at: Date.UTC(2026, 0, 15, 10, 30, 0),
    dayKey: '2026-01-15',
    createdAt: Date.UTC(2026, 0, 15, 10, 30, 0),
    updatedAt: Date.UTC(2026, 0, 15, 10, 30, 0),
    deletedAt: null,
    ...overrides
  }
}

const wallets: Wallet[] = [mkWallet('w1', 'CASH'), mkWallet('w2', 'Tabungan')]

describe('toMarkdown', () => {
  it('produces a "nothing to export" message for zero active transactions', () => {
    const md = toMarkdown({ transactions: [], wallets, exportedAt: Date.now() })
    expect(md).toContain('Belum ada transaksi untuk diekspor.')
    expect(md).toContain('Total transaksi: 0')
    expect(md).toContain('Rentang: -')
  })

  it('excludes soft-deleted transactions — this is a report, not a backup (spec §9.1 vs §9.5)', () => {
    const md = toMarkdown({
      transactions: [mkTx('active'), mkTx('gone', { deletedAt: 5000, amount: 999999 })],
      wallets,
      exportedAt: Date.now()
    })
    expect(md).toContain('Total transaksi: 1')
    expect(md).not.toContain('999.999')
  })

  it('computes correct totals and range across multiple days', () => {
    const md = toMarkdown({
      transactions: [
        mkTx('a', { kind: 'in', amount: 500000, dayKey: '2026-01-10' }),
        mkTx('b', { kind: 'out', amount: 20000, dayKey: '2026-01-20' })
      ],
      wallets,
      exportedAt: Date.now()
    })
    expect(md).toContain('Total masuk: Rp 500.000')
    expect(md).toContain('Total keluar: Rp 20.000')
    expect(md).toContain('Rentang: 2026-01-10 s/d 2026-01-20')
  })

  it('groups by day with newest day first', () => {
    const md = toMarkdown({
      transactions: [
        mkTx('early', { dayKey: '2026-01-01' }),
        mkTx('late', { dayKey: '2026-01-31' })
      ],
      wallets,
      exportedAt: Date.now()
    })
    const lateIdx = md.indexOf('## 2026-01-31')
    const earlyIdx = md.indexOf('## 2026-01-01')
    expect(lateIdx).toBeGreaterThanOrEqual(0)
    expect(earlyIdx).toBeGreaterThan(lateIdx)
  })

  it('renders a move transaction as "source -> dest" and falls back to "?" for an unknown wallet', () => {
    const md = toMarkdown({
      transactions: [
        mkTx('m1', { kind: 'move', walletId: 'w1', toWalletId: 'w2', amount: 50000 }),
        mkTx('m2', { kind: 'move', walletId: 'w1', toWalletId: 'ghost', amount: 1000 })
      ],
      wallets,
      exportedAt: Date.now()
    })
    expect(md).toContain('CASH -> Tabungan')
    expect(md).toContain('CASH -> ?')
  })

  it('escapes pipe characters and strips newlines from notes so the table stays well-formed', () => {
    const md = toMarkdown({
      transactions: [mkTx('n1', { note: 'harga | diskon\nlumayan' })],
      wallets,
      exportedAt: Date.now()
    })
    // The raw newline must be gone (collapsed to a space) and the literal '|'
    // escaped as '\|' so a Markdown renderer treats it as cell content, not a
    // column boundary. `\|` still contains a '|' character, so a naive
    // String.split('|') can't be used to count cells here — check the exact
    // rendered fragment instead.
    expect(md).toContain('harga \\| diskon lumayan')
    expect(md).not.toContain('diskon\nlumayan')
    const row = md.split('\n').find((line) => line.includes('harga'))
    expect(row).toBeDefined()
    expect(row!.startsWith('|') && row!.endsWith('|')).toBe(true)
  })

  it('maps intent values to their Indonesian labels', () => {
    const md = toMarkdown({
      transactions: [mkTx('i1', { intent: 'impulse' })],
      wallets,
      exportedAt: Date.now()
    })
    expect(md).toContain('IMPULSIF')
  })

  it('shows no intent label for in/move transactions (intent is null)', () => {
    const md = toMarkdown({
      transactions: [mkTx('in1', { kind: 'in', intent: null })],
      wallets,
      exportedAt: Date.now()
    })
    expect(md).toContain('| masuk |')
  })
})
