import { getSql } from '../connection.ts'
import { toIso } from '../rows.ts'

type Row = Record<string, unknown>

export interface Wallet {
  id: string
  name: string
  kind: 'spendable' | 'reserve'
  initialBalance: number
  archived: boolean
  order: number
  createdAt: string
}

function rowToWallet(row: Record<string, unknown>): Wallet {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as 'spendable' | 'reserve',
    initialBalance: row.initial_balance as number,
    archived: row.archived as boolean,
    order: Number(row.order),
    createdAt: toIso(row.created_at),
  }
}

export async function listWallets(includeArchived = false): Promise<Wallet[]> {
  const sql = getSql()
  const rows = includeArchived
    ? await sql`SELECT * FROM wallets ORDER BY "order", created_at` as Row[]
    : await sql`SELECT * FROM wallets WHERE archived = false ORDER BY "order", created_at` as Row[]
  return rows.map(rowToWallet)
}

export async function getWallet(id: string): Promise<Wallet | null> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM wallets WHERE id = ${id}` as Row[]
  return rows.length > 0 ? rowToWallet(rows[0]) : null
}

export async function createWallet(
  name: string,
  kind: 'spendable' | 'reserve',
  initialBalance = 0,
): Promise<Wallet> {
  if (!Number.isInteger(initialBalance)) {
    throw new Error('initialBalance must be an integer (whole rupiah)')
  }
  const sql = getSql()
  const rows = await sql`
    INSERT INTO wallets (name, kind, initial_balance)
    VALUES (${name}, ${kind}, ${initialBalance})
    RETURNING *
  ` as Row[]
  return rowToWallet(rows[0])
}

export async function walletBalance(walletId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql`
    SELECT
      w.initial_balance
      + COALESCE(SUM(CASE WHEN t.kind = 'in'   AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.kind = 'out'  AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.kind = 'move' AND t.to_wallet_id = w.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.kind = 'move' AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
      AS balance
    FROM wallets w
    LEFT JOIN transactions t
      ON (t.wallet_id = w.id OR t.to_wallet_id = w.id)
      AND t.deleted_at IS NULL
    WHERE w.id = ${walletId}
    GROUP BY w.id
  ` as Row[]
  if (rows.length === 0) throw new Error(`Wallet ${walletId} not found`)
  return Number(rows[0].balance)
}

export async function spendableBalance(): Promise<number> {
  const sql = getSql()
  const rows = await sql`
    SELECT COALESCE(SUM(bal), 0) AS total FROM (
      SELECT
        w.initial_balance
        + COALESCE(SUM(CASE WHEN t.kind = 'in'   AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.kind = 'out'  AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.kind = 'move' AND t.to_wallet_id = w.id THEN t.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.kind = 'move' AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
        AS bal
      FROM wallets w
      LEFT JOIN transactions t
        ON (t.wallet_id = w.id OR t.to_wallet_id = w.id)
        AND t.deleted_at IS NULL
      WHERE w.kind = 'spendable' AND w.archived = false
      GROUP BY w.id
    ) sub
  ` as Row[]
  return Number(rows[0].total)
}

export async function archiveWallet(id: string): Promise<void> {
  const balance = await walletBalance(id)
  if (balance !== 0) {
    throw new Error(`Cannot archive wallet with non-zero balance (Rp ${balance})`)
  }
  const sql = getSql()
  await sql`UPDATE wallets SET archived = true WHERE id = ${id}`
}
