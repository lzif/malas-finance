import { afterAll, describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'

function envOrSkip(key: string): string | undefined {
  try {
    return Deno.env.get(key)
  } catch {
    return undefined
  }
}

const HAS_DB = !!envOrSkip('DATABASE_URL')

const cleanup: (() => Promise<void>)[] = []

afterAll(async () => {
  for (const fn of cleanup.reverse()) {
    try {
      await fn()
    } catch { /* best-effort */ }
  }
  // Close the TCP pool postgres.js opened, or Deno's resource sanitizer fails
  // the run. No-op when no test connected (DATABASE_URL absent).
  if (HAS_DB) {
    const { closeSql } = await import('../connection.ts')
    await closeSql()
  }
})

describe('settings repo', () => {
  it({
    name: 'getSettings returns the seed row',
    ignore: !HAS_DB,
    fn: async () => {
      const { getSettings } = await import('./settings.ts')
      const s = await getSettings()
      expect(s.cycleMode).toBe('monthly-day')
      expect(s.cycleAnchorDay).toBe(1)
      expect(s.dayStartHour).toBe(0)
      expect(s.schemaVersion).toBe(1)
    },
  })

  it({
    name: 'updateSettings round-trips a change',
    ignore: !HAS_DB,
    fn: async () => {
      const { getSettings, updateSettings } = await import('./settings.ts')
      const original = await getSettings()

      const updated = await updateSettings({ endBuffer: 50_000 })
      expect(updated.endBuffer).toBe(50_000)
      expect(updated.cycleMode).toBe(original.cycleMode)

      await updateSettings({ endBuffer: original.endBuffer })
      const restored = await getSettings()
      expect(restored.endBuffer).toBe(original.endBuffer)
    },
  })
})

describe('wallets repo', () => {
  it({
    name: 'createWallet + walletBalance + listWallets',
    ignore: !HAS_DB,
    fn: async () => {
      const { createWallet, walletBalance, listWallets } = await import('./wallets.ts')
      const { getSql } = await import('../connection.ts')

      const w = await createWallet('__test_cash__', 'spendable', 100_000)
      cleanup.push(async () => {
        await getSql()`DELETE FROM wallets WHERE id = ${w.id}`
      })

      expect(w.name).toBe('__test_cash__')
      expect(w.kind).toBe('spendable')
      expect(w.initialBalance).toBe(100_000)

      const bal = await walletBalance(w.id)
      expect(bal).toBe(100_000)

      const all = await listWallets()
      expect(all.some((x) => x.id === w.id)).toBe(true)
    },
  })

  it({
    name: 'archiveWallet blocks non-zero balance',
    ignore: !HAS_DB,
    fn: async () => {
      const { createWallet, archiveWallet } = await import('./wallets.ts')
      const { getSql } = await import('../connection.ts')

      const w = await createWallet('__test_arch__', 'spendable', 1_000)
      cleanup.push(async () => {
        await getSql()`DELETE FROM wallets WHERE id = ${w.id}`
      })

      await expect(archiveWallet(w.id)).rejects.toThrow('non-zero balance')
    },
  })

  it({
    name: 'archiveWallet succeeds with zero balance',
    ignore: !HAS_DB,
    fn: async () => {
      const { createWallet, archiveWallet, getWallet } = await import('./wallets.ts')
      const { getSql } = await import('../connection.ts')

      const w = await createWallet('__test_arch0__', 'spendable', 0)
      cleanup.push(async () => {
        await getSql()`DELETE FROM wallets WHERE id = ${w.id}`
      })

      await archiveWallet(w.id)
      const after = await getWallet(w.id)
      expect(after!.archived).toBe(true)
    },
  })
})

describe('transactions repo', () => {
  it({
    name: 'createTransaction enforces amount > 0',
    ignore: !HAS_DB,
    fn: async () => {
      const { createTransaction } = await import('./transactions.ts')
      await expect(
        createTransaction({ kind: 'out', amount: 0, intent: 'impulse', walletId: 'fake' }, 0),
      ).rejects.toThrow('positive integer')
      await expect(
        createTransaction({ kind: 'out', amount: -100, intent: 'impulse', walletId: 'fake' }, 0),
      ).rejects.toThrow('positive integer')
    },
  })

  it({
    name: 'createTransaction enforces intent iff expense',
    ignore: !HAS_DB,
    fn: async () => {
      const { createTransaction } = await import('./transactions.ts')
      await expect(
        createTransaction({ kind: 'out', amount: 1000, walletId: 'fake' }, 0),
      ).rejects.toThrow('intent is required')
      await expect(
        createTransaction({ kind: 'in', amount: 1000, intent: 'impulse', walletId: 'fake' }, 0),
      ).rejects.toThrow('intent must be null')
    },
  })

  it({
    name: 'createTransaction enforces to_wallet_id iff transfer',
    ignore: !HAS_DB,
    fn: async () => {
      const { createTransaction } = await import('./transactions.ts')
      await expect(
        createTransaction({ kind: 'move', amount: 1000, walletId: 'fake' }, 0),
      ).rejects.toThrow('to_wallet_id is required')
    },
  })

  it({
    name: 'createTransaction forbids same-wallet transfer',
    ignore: !HAS_DB,
    fn: async () => {
      const { createTransaction } = await import('./transactions.ts')
      await expect(
        createTransaction(
          { kind: 'move', amount: 1000, walletId: 'same', toWalletId: 'same' },
          0,
        ),
      ).rejects.toThrow('same wallet')
    },
  })

  it({
    name: 'expense + income affect wallet balance',
    ignore: !HAS_DB,
    fn: async () => {
      const { createWallet, walletBalance } = await import('./wallets.ts')
      const { createTransaction, softDelete } = await import('./transactions.ts')
      const { getSql } = await import('../connection.ts')

      const w = await createWallet('__test_txw__', 'spendable', 100_000)
      cleanup.push(async () => {
        const sql = getSql()
        await sql`DELETE FROM transactions WHERE wallet_id = ${w.id}`
        await sql`DELETE FROM wallets WHERE id = ${w.id}`
      })

      const tx = await createTransaction(
        { kind: 'out', amount: 27_500, intent: 'impulse', walletId: w.id },
        0,
      )
      expect(tx.kind).toBe('out')
      expect(tx.amount).toBe(27_500)
      expect(tx.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Timestamp reads are canonical ISO 8601, not the driver's Date.toString()
      // (postgres.js returns timestamptz as a JS Date — see db/rows.ts).
      expect(tx.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

      let bal = await walletBalance(w.id)
      expect(bal).toBe(72_500)

      await createTransaction({ kind: 'in', amount: 50_000, walletId: w.id }, 0)
      bal = await walletBalance(w.id)
      expect(bal).toBe(122_500)

      await softDelete(tx.id)
      bal = await walletBalance(w.id)
      expect(bal).toBe(150_000)
    },
  })

  it({
    name: 'transfer moves balance between wallets',
    ignore: !HAS_DB,
    fn: async () => {
      const { createWallet, walletBalance } = await import('./wallets.ts')
      const { createTransaction } = await import('./transactions.ts')
      const { getSql } = await import('../connection.ts')

      const from = await createWallet('__test_from__', 'spendable', 200_000)
      const to = await createWallet('__test_to__', 'reserve', 0)
      cleanup.push(async () => {
        const sql = getSql()
        await sql`DELETE FROM transactions WHERE wallet_id = ${from.id} OR to_wallet_id = ${to.id}`
        await sql`DELETE FROM wallets WHERE id = ${from.id} OR id = ${to.id}`
      })

      await createTransaction(
        { kind: 'move', amount: 75_000, walletId: from.id, toWalletId: to.id },
        0,
      )

      expect(await walletBalance(from.id)).toBe(125_000)
      expect(await walletBalance(to.id)).toBe(75_000)
    },
  })
})

describe('categories repo', () => {
  it({
    name: 'listCategories returns the seeded tree',
    ignore: !HAS_DB,
    fn: async () => {
      const { listCategories } = await import('./categories.ts')
      const tree = await listCategories()
      expect(tree.length).toBeGreaterThanOrEqual(11)
      const rokok = tree.find((c) => c.name === 'Rokok & Sejenisnya')
      expect(rokok).toBeDefined()
      expect(rokok!.children.length).toBe(2)
      expect(rokok!.children.some((s) => s.name === 'Rokok')).toBe(true)
    },
  })

  it({
    name: 'findCategory matches case-insensitively',
    ignore: !HAS_DB,
    fn: async () => {
      const { findCategory } = await import('./categories.ts')
      const hit = await findCategory('transportasi', 'Bensin')
      expect(hit).not.toBeNull()
      expect(hit!.path).toBe('Transportasi > Bensin')
    },
  })

  it({
    name: 'findOrCreateCategory creates new category when needed',
    ignore: !HAS_DB,
    fn: async () => {
      const { findOrCreateCategory, findCategory } = await import('./categories.ts')
      const { getSql } = await import('../connection.ts')

      const result = await findOrCreateCategory('__test_cat__', '__test_sub__')
      cleanup.push(async () => {
        const sql = getSql()
        if (result.subcategoryId) {
          await sql`DELETE FROM categories WHERE id = ${result.subcategoryId}`
        }
        await sql`DELETE FROM categories WHERE id = ${result.categoryId}`
      })

      expect(result.created).toBe(true)
      expect(result.path).toBe('__test_cat__ > __test_sub__')

      const found = await findCategory('__test_cat__', '__test_sub__')
      expect(found).not.toBeNull()
      expect(found!.subcategoryId).toBe(result.subcategoryId)
    },
  })

  it({
    name: 'getCategoryNames returns top-level names',
    ignore: !HAS_DB,
    fn: async () => {
      const { getCategoryNames } = await import('./categories.ts')
      const names = await getCategoryNames()
      expect(names.length).toBeGreaterThanOrEqual(11)
      expect(names).toContain('Transportasi')
    },
  })
})
