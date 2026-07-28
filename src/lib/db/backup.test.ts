import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  parseBackup,
  previewBackup,
  serializeBackup,
  type BackupEnvelope
} from './backup'
import type { Commitment, Settings, Transaction, Wallet } from './schema'

const mockSettings: Settings = {
  key: 'settings',
  cycleMode: 'monthly-day',
  cycleAnchorDay: 1,
  cycleManualEnd: null,
  endBuffer: 0,
  dayStartHour: 0,
  seedDailySpend: 0,
  startedAt: '2026-01-01',
  notif: {
    allowanceExceeded: false,
    noEntryReminder: false,
    dailySummary: false,
    weeklyRecap: false,
    dailySummaryHour: 21,
    noEntryReminderHour: 20,
    weeklyRecapDay: 0,
    weeklyRecapHour: 20
  },
  bigDeleteThreshold: 1_000_000,
  schemaVersion: 1
}

const mockWallets: Wallet[] = [
  {
    id: 'w1',
    name: 'Main Wallet',
    kind: 'spendable',
    initialBalance: 100000,
    archived: false,
    order: 0
  },
  {
    id: 'w2',
    name: 'Emergency Reserve',
    kind: 'reserve',
    initialBalance: 500000,
    archived: false,
    order: 1
  }
]

const mockCommitments: Commitment[] = [
  {
    id: 'c1',
    name: 'Internet Bill',
    amount: 300000,
    kind: 'bill',
    dueDay: 15,
    walletId: 'w1',
    active: true
  }
]

const mockTransactions: Transaction[] = [
  {
    id: 't1',
    kind: 'in',
    amount: 1500000,
    intent: null,
    tag: 'salary',
    note: 'Monthly salary',
    walletId: 'w1',
    toWalletId: null,
    commitmentId: null,
    at: 1767225600000,
    dayKey: '2026-01-01',
    createdAt: 1767225600000,
    updatedAt: 1767225600000,
    deletedAt: null
  },
  {
    id: 't2',
    kind: 'out',
    amount: 50000,
    intent: 'impulse',
    tag: 'coffee',
    note: null,
    walletId: 'w1',
    toWalletId: null,
    commitmentId: null,
    at: 1768435200000,
    dayKey: '2026-01-15',
    createdAt: 1768435200000,
    updatedAt: 1768435200000,
    deletedAt: null
  },
  {
    id: 't3',
    kind: 'out',
    amount: 200000,
    intent: 'planned',
    tag: 'groceries',
    note: null,
    walletId: 'w1',
    toWalletId: null,
    commitmentId: null,
    at: 1769731200000,
    dayKey: '2026-01-30',
    createdAt: 1769731200000,
    updatedAt: 1769731200000,
    deletedAt: null
  },
  {
    id: 't4_deleted',
    kind: 'out',
    amount: 10000,
    intent: 'impulse',
    tag: 'snack',
    note: 'Deleted transaction',
    walletId: 'w1',
    toWalletId: null,
    commitmentId: null,
    at: 1768000000000,
    dayKey: '2026-01-10',
    createdAt: 1768000000000,
    updatedAt: 1768000000000,
    deletedAt: 1768000500000
  }
]

/**
 * Unit tests for backup serialization, parsing, and preview (spec §9.1, §9.2).
 */
describe('backup module', () => {
  it('round-trip serialize->parse preserves data including deleted rows', () => {
    const serialized = serializeBackup({
      settings: mockSettings,
      wallets: mockWallets,
      commitments: mockCommitments,
      transactions: mockTransactions,
      appVersion: '2.0.0'
    })

    const result = parseBackup(serialized)
    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.data.format).toBe('malasfinance-backup')
      expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(result.data.appVersion).toBe('2.0.0')
      expect(result.data.settings).toEqual(mockSettings)
      expect(result.data.wallets).toEqual(mockWallets)
      expect(result.data.commitments).toEqual(mockCommitments)
      expect(result.data.transactions).toEqual(mockTransactions)

      const deletedTx = result.data.transactions.find((t) => t.id === 't4_deleted')
      expect(deletedTx).toBeDefined()
      expect(deletedTx?.deletedAt).toBe(1768000500000)
    }
  })

  it('handles invalid JSON by returning invalid-json reason', () => {
    const result = parseBackup('{ invalid json syntax ...')
    expect(result).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('rejects a JSON object that is not a backup', () => {
    const notABackup = JSON.stringify({
      format: 'some-other-format',
      schemaVersion: 1,
      transactions: mockTransactions
    })
    const result = parseBackup(notABackup)
    expect(result).toEqual({ ok: false, reason: 'not-a-backup' })
  })

  it('rejects schemaVersion higher than current supported version', () => {
    const futureBackup = JSON.stringify({
      format: 'malasfinance-backup',
      schemaVersion: 2,
      appVersion: '3.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: [],
      transactions: mockTransactions
    })
    const result = parseBackup(futureBackup)
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' })
  })

  it('rejects an empty transaction list with empty reason', () => {
    const emptyBackup = JSON.stringify({
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: [],
      transactions: []
    })
    const result = parseBackup(emptyBackup)
    expect(result).toEqual({ ok: false, reason: 'empty' })
  })

  it('calculates preview totals and date range correctly for active transactions', () => {
    const envelope: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: mockCommitments,
      transactions: mockTransactions
    }

    const preview = previewBackup(envelope)

    // Only 3 non-deleted transactions (t1: in 1500000, t2: out 50000, t3: out 200000)
    expect(preview.count).toBe(3)
    expect(preview.totalIn).toBe(1500000)
    expect(preview.totalOut).toBe(250000)
    expect(preview.earliest).toBe('2026-01-01')
    expect(preview.latest).toBe('2026-01-30')
    expect(preview.walletCount).toBe(2)
  })

  it('returns nulls and zero totals when previewing envelope with zero active transactions without division by zero', () => {
    const envelopeWithOnlyDeleted: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: mockCommitments,
      transactions: [
        {
          id: 'deleted_only',
          kind: 'out',
          amount: 10000,
          intent: 'impulse',
          tag: null,
          note: null,
          walletId: 'w1',
          toWalletId: null,
          commitmentId: null,
          at: 1768000000000,
          dayKey: '2026-01-10',
          createdAt: 1768000000000,
          updatedAt: 1768000000000,
          deletedAt: 1768000500000
        }
      ]
    }

    const preview = previewBackup(envelopeWithOnlyDeleted)

    expect(preview.count).toBe(0)
    expect(preview.earliest).toBeNull()
    expect(preview.latest).toBeNull()
    expect(preview.totalIn).toBe(0)
    expect(preview.totalOut).toBe(0)
    expect(preview.walletCount).toBe(2)
  })

  it('treats every wallet/commitment as new when previewBackup is called without a `current` argument (backward compatible)', () => {
    const envelope: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: mockCommitments,
      transactions: mockTransactions
    }
    const preview = previewBackup(envelope)
    expect(preview.newWalletCount).toBe(mockWallets.length)
    expect(preview.newCommitmentCount).toBe(mockCommitments.length)
  })

  it('computes new-wallet/new-commitment counts against a supplied `current` state, by id only (spec §9.2 preview)', () => {
    const envelope: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets, // w1, w2
      commitments: mockCommitments, // c1
      transactions: mockTransactions
    }

    // w1 already exists locally; w2 does not. Neither commitment exists locally.
    const preview = previewBackup(envelope, {
      wallets: [{ ...mockWallets[0] }],
      commitments: []
    })

    expect(preview.newWalletCount).toBe(1)
    expect(preview.newCommitmentCount).toBe(1)
    // walletCount (total in file) is unaffected by `current` — still the raw file count.
    expect(preview.walletCount).toBe(mockWallets.length)
  })

  it('dedups a corrupted file with duplicate wallet ids before counting "new" — must match what planMergeImport actually inserts', () => {
    const dupWallet = { ...mockWallets[0], id: 'dup-id' }
    const envelope: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: [dupWallet, { ...dupWallet }], // same id twice, neither exists locally
      commitments: [],
      transactions: mockTransactions
    }
    const preview = previewBackup(envelope, { wallets: [], commitments: [] })
    expect(preview.newWalletCount).toBe(1)
  })

  it('reports zero new wallets/commitments when every id already exists locally', () => {
    const envelope: BackupEnvelope = {
      format: 'malasfinance-backup',
      schemaVersion: 1,
      appVersion: '2.0.0',
      exportedAt: Date.now(),
      settings: mockSettings,
      wallets: mockWallets,
      commitments: mockCommitments,
      transactions: mockTransactions
    }
    const preview = previewBackup(envelope, { wallets: mockWallets, commitments: mockCommitments })
    expect(preview.newWalletCount).toBe(0)
    expect(preview.newCommitmentCount).toBe(0)
  })
})
