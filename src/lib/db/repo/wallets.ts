// db/repo/wallets.ts — wallets and balance calculations (spec §4.1).
//
// walletBalance/spendableBalance are not part of pure domain/: both reduce
// over the `transactions` table loaded from Dexie. The MVP scope (see brief)
// limits domain/ to day.ts, cycle.ts, allowance.ts, runway.ts — so this
// balance aggregation lives in the repo layer, close to its data source,
// even though mathematically it is still a pure function over plain arrays.

import { db, type Transaction, type Wallet } from '../schema'

export async function createWallet(input: {
  name: string
  kind: Wallet['kind']
  initialBalance: number
}): Promise<Wallet> {
  // Enforced here, not just in the UI — the UI can be bypassed, the
  // repository cannot (spec §5.1). Money is stored as whole rupiah (§5.2);
  // a fractional or NaN initial balance would leak into every calculation
  // in §4 without ever being visible.
  if (!Number.isInteger(input.initialBalance)) {
    throw new Error('initialBalance must be an integer')
  }
  if (input.initialBalance < 0) {
    throw new Error('initialBalance must not be negative')
  }
  if (input.name.trim() === '') {
    throw new Error('wallet name must not be empty')
  }
  const existing = await db.wallets.toArray()
  const wallet: Wallet = {
    id: crypto.randomUUID(),
    name: input.name,
    kind: input.kind,
    initialBalance: input.initialBalance,
    archived: false,
    order: existing.length
  }
  await db.wallets.add(wallet)
  return wallet
}

export async function activeWallets(): Promise<Wallet[]> {
  const rows = await db.wallets.toArray()
  return rows.filter((w) => !w.archived).sort((a, b) => a.order - b.order)
}

/**
 * Every wallet, including archived ones. Used by the import preview (spec
 * §9.2) so an archived wallet whose id reappears in a backup file is not
 * miscounted as "new" — activeWallets() alone would miss it.
 */
export async function allWallets(): Promise<Wallet[]> {
  return db.wallets.toArray()
}

/**
 * walletBalance(w) = w.initialBalance + Σ(in→w) − Σ(out←w) + Σ(move→w) − Σ(move←w)
 * Only transactions with deletedAt == null.
 */
export function walletBalance(wallet: Wallet, activeTransactions: Transaction[]): number {
  let balance = wallet.initialBalance
  for (const t of activeTransactions) {
    if (t.deletedAt !== null) continue
    if (t.kind === 'in' && t.walletId === wallet.id) balance += t.amount
    else if (t.kind === 'out' && t.walletId === wallet.id) balance -= t.amount
    else if (t.kind === 'move' && t.toWalletId === wallet.id) balance += t.amount
    else if (t.kind === 'move' && t.walletId === wallet.id) balance -= t.amount
  }
  return balance
}

/**
 * spendableBalance = Σ walletBalance(w) for w.kind == 'spendable' && !w.archived.
 * 'reserve' wallets are not included.
 */
export function spendableBalance(wallets: Wallet[], activeTransactions: Transaction[]): number {
  return wallets
    .filter((w) => w.kind === 'spendable' && !w.archived)
    .reduce((sum, w) => sum + walletBalance(w, activeTransactions), 0)
}
