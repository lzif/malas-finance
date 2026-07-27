// db/repo/wallets.ts — dompet dan perhitungan saldo (spec §4.1).
//
// saldoDompet/saldoBelanja bukan bagian dari domain/ murni: keduanya
// mereduksi tabel `transactions` yang dimuat dari Dexie. MVP scope
// (lihat brief) membatasi domain/ hanya pada day.ts, cycle.ts, allowance.ts,
// runway.ts — jadi agregasi saldo ini hidup di lapisan repo, dekat sumber
// datanya, walau secara matematis tetap fungsi murni atas array biasa.

import { db, type Transaction, type Wallet } from '../schema'

export async function createWallet(input: {
  name: string
  kind: Wallet['kind']
  initialBalance: number
}): Promise<Wallet> {
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
 * saldoDompet(w) = w.initialBalance + Σ(in→w) − Σ(out←w) + Σ(move→w) − Σ(move←w)
 * Hanya transaksi dengan deletedAt == null.
 */
export function saldoDompet(wallet: Wallet, transaksiAktif: Transaction[]): number {
  let saldo = wallet.initialBalance
  for (const t of transaksiAktif) {
    if (t.deletedAt !== null) continue
    if (t.kind === 'in' && t.walletId === wallet.id) saldo += t.amount
    else if (t.kind === 'out' && t.walletId === wallet.id) saldo -= t.amount
    else if (t.kind === 'move' && t.toWalletId === wallet.id) saldo += t.amount
    else if (t.kind === 'move' && t.walletId === wallet.id) saldo -= t.amount
  }
  return saldo
}

/**
 * saldoBelanja = Σ saldoDompet(w) untuk w.kind == 'spendable' && !w.archived.
 * Dompet 'reserve' tidak ikut.
 */
export function saldoBelanja(wallets: Wallet[], transaksiAktif: Transaction[]): number {
  return wallets
    .filter((w) => w.kind === 'spendable' && !w.archived)
    .reduce((sum, w) => sum + saldoDompet(w, transaksiAktif), 0)
}
