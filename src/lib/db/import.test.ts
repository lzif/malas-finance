import { describe, expect, it } from 'vitest'
import { planFullReplaceImport, planMergeImport } from './import'
import { previewBackup, type BackupEnvelope } from './backup'
import { DEFAULT_SETTINGS, type Commitment, type Settings, type Transaction, type Wallet } from './schema'
import { dayKeyOf } from '../domain/day'

// Only the PURE planning functions are unit-tested here (spec §10.3). The
// Dexie wrapper functions (applyMergeImport/applyFullReplaceImport) are not —
// this project has no fake-indexeddb dependency, mirroring the same tradeoff
// already made for fsBackup/capacitor.ts (untested native adapter, tested
// pure core).

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

function mkWallet(id: string, overrides: Partial<Wallet> = {}): Wallet {
  return {
    id,
    name: `wallet-${id}`,
    kind: 'spendable',
    initialBalance: 0,
    archived: false,
    order: 0,
    ...overrides
  }
}

function mkCommitment(id: string, overrides: Partial<Commitment> = {}): Commitment {
  return {
    id,
    name: `commitment-${id}`,
    amount: 1000,
    kind: 'bill',
    dueDay: 1,
    walletId: null,
    active: true,
    ...overrides
  }
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
    at: Date.UTC(2026, 0, 15, 12, 0, 0),
    dayKey: '2026-01-15',
    createdAt: Date.UTC(2026, 0, 15, 12, 0, 0),
    updatedAt: Date.UTC(2026, 0, 15, 12, 0, 0),
    deletedAt: null,
    ...overrides
  }
}

function mkEnvelope(overrides: Partial<BackupEnvelope> = {}): BackupEnvelope {
  return {
    format: 'malasfinance-backup',
    schemaVersion: 1,
    appVersion: '2.0.0',
    exportedAt: Date.now(),
    settings: mkSettings(),
    wallets: [],
    commitments: [],
    transactions: [],
    ...overrides
  }
}

/** Deterministic id sequence so tests can assert exactly which id landed where. */
function idSequence(prefix: string): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

describe('planMergeImport', () => {
  it('assigns every transaction a fresh id from the injected generator, in order', () => {
    const env = mkEnvelope({
      transactions: [mkTx('orig-1'), mkTx('orig-2'), mkTx('orig-3')]
    })
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('new-'))
    expect(plan.transactionsToAdd.map((t) => t.id)).toEqual(['new-1', 'new-2', 'new-3'])
    // Original ids must not survive — spec §9.2 "no dedup" implies identity is
    // fully replaced, not merely supplemented.
    expect(plan.transactionsToAdd.some((t) => t.id === 'orig-1')).toBe(false)
  })

  it('includes soft-deleted transactions unchanged (no dedup, spec §9.2)', () => {
    const deletedTx = mkTx('d1', { deletedAt: 12345 })
    const env = mkEnvelope({ transactions: [deletedTx] })
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('n'))
    expect(plan.transactionsToAdd).toHaveLength(1)
    expect(plan.transactionsToAdd[0].deletedAt).toBe(12345)
  })

  it('recomputes dayKey from `at` + the LOCAL dayStartHour, ignoring whatever dayKey the file shipped with', () => {
    const at = Date.UTC(2026, 2, 10, 12, 0, 0)
    const dayStartHour = 3
    // The file claims a deliberately wrong dayKey — a foreign export, or one
    // computed under a different dayStartHour on another device. It must be
    // discarded and rederived here (spec §5.1: "dayKey always derived from at
    // + dayStartHour, recalculated on write"), not trusted.
    const env = mkEnvelope({
      transactions: [mkTx('t1', { at, dayKey: '1999-01-01' })]
    })
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, dayStartHour, idSequence('n'))
    expect(plan.transactionsToAdd[0].dayKey).toBe(dayKeyOf(at, dayStartHour))
    expect(plan.transactionsToAdd[0].dayKey).not.toBe('1999-01-01')
  })

  it('only adds wallets/commitments whose id is not already present locally', () => {
    const env = mkEnvelope({
      wallets: [mkWallet('existing'), mkWallet('brand-new')],
      commitments: [mkCommitment('existing-c'), mkCommitment('brand-new-c')]
    })
    const plan = planMergeImport(
      env,
      { wallets: [mkWallet('existing')], commitments: [mkCommitment('existing-c')] },
      0,
      idSequence('n')
    )
    expect(plan.walletsToAdd.map((w) => w.id)).toEqual(['brand-new'])
    expect(plan.commitmentsToAdd.map((c) => c.id)).toEqual(['brand-new-c'])
  })

  it('dedups a corrupted file with duplicate wallet/commitment ids, keeping the last occurrence', () => {
    const env = mkEnvelope({
      wallets: [mkWallet('dup', { name: 'first' }), mkWallet('dup', { name: 'second' })],
      commitments: [mkCommitment('dupc', { name: 'first' }), mkCommitment('dupc', { name: 'second' })]
    })
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('n'))
    expect(plan.walletsToAdd).toHaveLength(1)
    expect(plan.walletsToAdd[0].name).toBe('second')
    expect(plan.commitmentsToAdd).toHaveLength(1)
    expect(plan.commitmentsToAdd[0].name).toBe('second')
  })

  it('does not crash on a transaction referencing a wallet id absent from the file (unknown wallet)', () => {
    const env = mkEnvelope({
      wallets: [mkWallet('w1')],
      transactions: [mkTx('t1', { walletId: 'ghost-wallet' })]
    })
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('n'))
    expect(plan.transactionsToAdd).toHaveLength(1)
    expect(plan.transactionsToAdd[0].walletId).toBe('ghost-wallet')
  })

  it('is a pure function: calling it twice with the same inputs and a fresh equivalent newId produces equal shapes aside from ids', () => {
    const env = mkEnvelope({ transactions: [mkTx('a'), mkTx('b')] })
    const plan1 = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('x'))
    const plan2 = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('x'))
    expect(plan1.transactionsToAdd.map((t) => ({ ...t, id: undefined }))).toEqual(
      plan2.transactionsToAdd.map((t) => ({ ...t, id: undefined }))
    )
  })
})

describe('planFullReplaceImport', () => {
  it('restores wallets, commitments, and transactions verbatim including deletedAt', () => {
    const deletedTx = mkTx('d1', { deletedAt: 999 })
    const env = mkEnvelope({
      wallets: [mkWallet('w1')],
      commitments: [mkCommitment('c1')],
      transactions: [deletedTx, mkTx('t2')]
    })
    const plan = planFullReplaceImport(env)
    expect(plan.wallets).toEqual([mkWallet('w1')])
    expect(plan.commitments).toEqual([mkCommitment('c1')])
    expect(plan.transactions.find((t) => t.id === 'd1')?.deletedAt).toBe(999)
    expect(plan.transactions).toHaveLength(2)
  })

  it('fills a missing/malformed settings object with defaults rather than losing the key', () => {
    const env = mkEnvelope({ settings: { startedAt: '2026-01-01' } as Settings })
    const plan = planFullReplaceImport(env)
    expect(plan.settings.key).toBe('settings')
    expect(plan.settings.startedAt).toBe('2026-01-01')
    // Fields absent from the malformed input fall back to DEFAULT_SETTINGS.
    expect(plan.settings.dayStartHour).toBe(DEFAULT_SETTINGS.dayStartHour)
    expect(plan.settings.bigDeleteThreshold).toBe(DEFAULT_SETTINGS.bigDeleteThreshold)
  })

  it('dedups a corrupted file with a duplicate transaction id, keeping the last occurrence, instead of throwing', () => {
    const env = mkEnvelope({
      transactions: [mkTx('dup', { amount: 111 }), mkTx('dup', { amount: 222 })]
    })
    const plan = planFullReplaceImport(env)
    expect(plan.transactions).toHaveLength(1)
    expect(plan.transactions[0].amount).toBe(222)
  })

  it('is a pure function with no Dexie/side effects (does not throw when called repeatedly)', () => {
    const env = mkEnvelope({ transactions: [mkTx('a')] })
    expect(() => {
      planFullReplaceImport(env)
      planFullReplaceImport(env)
    }).not.toThrow()
  })
})

describe('preview/import count agreement (spec §10.3: "preview figures match import results")', () => {
  // previewBackup().count is ACTIVE transactions only (what the confirm
  // button shows the user before they commit). Both plan functions carry
  // deleted rows too (full fidelity — spec §9.1), so the plans' raw
  // transaction counts are expected to be >= preview.count whenever any
  // source row is soft-deleted. The UI must never report that larger raw
  // count back to the user as "N entri diimpor" — it must echo the number
  // that was actually shown and confirmed.

  it('planMergeImport’s ACTIVE transaction count equals previewBackup’s count', () => {
    const env = mkEnvelope({
      transactions: [mkTx('a'), mkTx('b'), mkTx('deleted', { deletedAt: 111 })]
    })
    const preview = previewBackup(env)
    const plan = planMergeImport(env, { wallets: [], commitments: [] }, 0, idSequence('n'))
    const activeInPlan = plan.transactionsToAdd.filter((t) => t.deletedAt === null).length
    expect(activeInPlan).toBe(preview.count)
    // The raw plan count (deleted included) is intentionally larger — this is
    // the exact divergence the UI must not surface as a single "N entri" figure.
    expect(plan.transactionsToAdd.length).toBeGreaterThan(preview.count)
  })

  it('planFullReplaceImport’s ACTIVE transaction count equals previewBackup’s count', () => {
    const env = mkEnvelope({
      transactions: [mkTx('a'), mkTx('b'), mkTx('c'), mkTx('deleted', { deletedAt: 111 })]
    })
    const preview = previewBackup(env)
    const plan = planFullReplaceImport(env)
    const activeInPlan = plan.transactions.filter((t) => t.deletedAt === null).length
    expect(activeInPlan).toBe(preview.count)
    expect(plan.transactions.length).toBeGreaterThan(preview.count)
  })
})
