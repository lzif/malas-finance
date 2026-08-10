// db/repo/admin.ts — read-only inspection and destructive maintenance, kept
// apart from the four product repos on purpose: nothing in the message flow
// may import this, so a bug in the bot can never reach `clearData`.

import { getSql } from '../connection.ts'
import { toIso, toIsoOrNull } from '../rows.ts'

type Row = Record<string, unknown>

export interface DbSnapshot {
  settings: Record<string, unknown>
  wallets: { id: string; name: string; kind: string; balance: number; archived: boolean }[]
  counts: {
    transactions: number
    transactionsDeleted: number
    categoriesSeed: number
    categoriesCustom: number
  }
  recentTransactions: {
    id: string
    at: string
    dayKey: string
    kind: string
    amount: number
    intent: string | null
    note: string | null
    deletedAt: string | null
  }[]
}

/** Everything needed to answer "what is actually in the database right now". */
export async function dbSnapshot(recentLimit = 20): Promise<DbSnapshot> {
  const sql = getSql()

  const settings = await sql`SELECT * FROM settings WHERE key = 'settings'` as Row[]

  // Balance per wallet, computed the same way wallets.ts does it, so this view
  // cannot drift from what the bot itself believes.
  const wallets = await sql`
    SELECT w.id, w.name, w.kind, w.archived, w.initial_balance
      + COALESCE((SELECT SUM(amount) FROM transactions
                  WHERE wallet_id = w.id AND kind = 'in' AND deleted_at IS NULL), 0)
      - COALESCE((SELECT SUM(amount) FROM transactions
                  WHERE wallet_id = w.id AND kind = 'out' AND deleted_at IS NULL), 0)
      - COALESCE((SELECT SUM(amount) FROM transactions
                  WHERE wallet_id = w.id AND kind = 'move' AND deleted_at IS NULL), 0)
      + COALESCE((SELECT SUM(amount) FROM transactions
                  WHERE to_wallet_id = w.id AND kind = 'move' AND deleted_at IS NULL), 0)
      AS balance
    FROM wallets w
    ORDER BY w."order", w.created_at
  ` as Row[]

  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL)      AS tx_active,
      (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NOT NULL)  AS tx_deleted,
      (SELECT COUNT(*) FROM categories WHERE is_seed = true)            AS cat_seed,
      (SELECT COUNT(*) FROM categories WHERE is_seed = false)           AS cat_custom
  ` as Row[]

  const recent = await sql`
    SELECT id, at, day_key, kind, amount, intent, note, deleted_at
    FROM transactions
    ORDER BY at DESC
    LIMIT ${Math.max(1, Math.min(recentLimit, 100))}
  ` as Row[]

  return {
    settings: settings[0] ?? {},
    wallets: wallets.map((w) => ({
      id: w.id as string,
      name: w.name as string,
      kind: w.kind as string,
      balance: Number(w.balance),
      archived: w.archived as boolean,
    })),
    counts: {
      transactions: Number(counts[0].tx_active),
      transactionsDeleted: Number(counts[0].tx_deleted),
      categoriesSeed: Number(counts[0].cat_seed),
      categoriesCustom: Number(counts[0].cat_custom),
    },
    recentTransactions: recent.map((t) => ({
      id: t.id as string,
      at: toIso(t.at),
      dayKey: t.day_key as string,
      kind: t.kind as string,
      amount: Number(t.amount),
      intent: (t.intent as string) ?? null,
      note: (t.note as string) ?? null,
      deletedAt: toIsoOrNull(t.deleted_at),
    })),
  }
}

/**
 * What a clear removes.
 * - 'transactions': the ledger only. Wallets, their opening balances, and all
 *   settings survive — this is the "remove my test entries" case.
 * - 'all': a factory reset. Also drops wallets and user-created categories, and
 *   returns settings to defaults so onboarding starts over. Seed categories are
 *   kept, because they are reference data from seed.sql, not user data.
 */
export type ClearScope = 'transactions' | 'all'

export interface ClearResult {
  scope: ClearScope
  deleted: {
    transactions: number
    wallets: number
    customCategories: number
  }
  settingsReset: boolean
}

export async function clearData(scope: ClearScope): Promise<ClearResult> {
  const sql = getSql()

  // Transactions go first in both scopes: they reference wallets, so removing
  // them first keeps the foreign keys satisfied at every step.
  const tx = await sql`DELETE FROM transactions WHERE id IS NOT NULL`
  const result: ClearResult = {
    scope,
    deleted: { transactions: tx.count ?? 0, wallets: 0, customCategories: 0 },
    settingsReset: false,
  }

  if (scope === 'transactions') return result

  const wallets = await sql`DELETE FROM wallets WHERE id IS NOT NULL`
  result.deleted.wallets = wallets.count ?? 0

  // Subcategories before parents: a custom subcategory can hang off a seed
  // parent, and deleting the parent first would orphan or block it.
  const subs = await sql`DELETE FROM categories WHERE is_seed = false AND parent_id IS NOT NULL`
  const parents = await sql`DELETE FROM categories WHERE is_seed = false AND parent_id IS NULL`
  result.deleted.customCategories = (subs.count ?? 0) + (parents.count ?? 0)

  // Back to the seed defaults, including releasing the Telegram chat claim so
  // the next person to message the bot re-claims it (spec §15 #5).
  await sql`
    UPDATE settings SET
      cycle_mode = 'monthly-day',
      cycle_anchor_day = 1,
      cycle_manual_end = NULL,
      end_buffer = 0,
      day_start_hour = 0,
      seed_daily_spend = 0,
      started_at = NULL,
      telegram_chat_id = NULL
    WHERE key = 'settings'
  `
  result.settingsReset = true

  return result
}
