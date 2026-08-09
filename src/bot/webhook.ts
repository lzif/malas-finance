// bot/webhook.ts — the real message flow (spec §6). Takes the raw Telegram
// text and returns the reply string: AI parse → route by kind → repository
// write → recompute the allowance → format.
//
// This is the layer where everything else meets. It holds no math (that is
// domain/) and no SQL (that is db/repo/) — only routing, wallet/category
// resolution, and the failure modes a user can actually hit.
//
// LANGUAGE RULE (AGENTS.md): user-facing string literals are Bahasa Indonesia.

import { parseMessage } from './parser.ts'
import type { ParsedInput } from './parser.ts'
import { formatExpense, formatIncome, formatTransfer } from './formatter.ts'
import { computeAllowance } from '../domain/allowance.ts'
import { cycleFor } from '../domain/cycle.ts'
import { dayKeyOf } from '../domain/day.ts'
import { formatRupiah } from '../domain/money.ts'
import type { Intent } from '../domain/types.ts'
import { getSettings, updateSettings } from '../db/repo/settings.ts'
import type { Settings } from '../db/repo/settings.ts'
import { createWallet, listWallets, spendableBalance } from '../db/repo/wallets.ts'
import type { Wallet } from '../db/repo/wallets.ts'
import { createTransaction, getTransactionsForDay } from '../db/repo/transactions.ts'
import { findOrCreateCategory, getCategoryNames } from '../db/repo/categories.ts'

/** Fallback when the model returns an expense with no category (spec §5.3). */
const FALLBACK_CATEGORY = 'Lainnya'

/**
 * Fallback when the model returns an expense with no intent. Deliberately the
 * unflattering label: defaulting to 'routine' would let unlabelled spending
 * quietly become invisible, which is the exact failure the pivot exists to
 * prevent (spec §1, K2).
 */
const FALLBACK_INTENT: Intent = 'impulse'

/** The allowance snapshot every reply needs (K1, spec §6.1). */
interface Allowance {
  remainingAllowance: number
  allowanceToday: number
}

async function currentAllowance(settings: Settings): Promise<Allowance> {
  const today = dayKeyOf(Date.now(), settings.dayStartHour)
  const cycle = cycleFor(today, settings)
  const [balance, transactions] = await Promise.all([
    spendableBalance(),
    getTransactionsForDay(today),
  ])

  const result = computeAllowance({
    spendableBalance: balance,
    transactionsToday: transactions.map((t) => ({
      kind: t.kind,
      amount: t.amount,
      commitmentId: t.commitmentId,
    })),
    // Commitments are Phase 2; the parameter stays in the signature so adding
    // them later does not reshape domain/ (see AllowanceInput).
    unpaidCommitments: 0,
    endBuffer: settings.endBuffer,
    daysRemaining: cycle.daysRemaining,
  })

  return {
    remainingAllowance: result.remainingAllowance,
    allowanceToday: result.allowanceToday,
  }
}

/**
 * The wallet the user meant. A named wallet is matched case-insensitively; an
 * unnamed or unrecognised one falls back to the default spendable wallet, so a
 * typo never costs the user a round-trip (spec §12).
 */
function resolveWallet(name: string | null, wallets: Wallet[]): Wallet {
  if (name) {
    const match = wallets.find((w) => w.name.toLowerCase() === name.toLowerCase())
    if (match) return match
  }
  const spendable = wallets.find((w) => w.kind === 'spendable')
  if (!spendable) throw new Error('Tidak ada wallet spendable.')
  return spendable
}

/** A brand-new install has no wallets; give it CASH rather than an error (spec §13). */
async function ensureWallets(): Promise<Wallet[]> {
  const wallets = await listWallets()
  if (wallets.length > 0) return wallets
  return [await createWallet('CASH', 'spendable', 0)]
}

async function handleExpense(
  parsed: ParsedInput,
  wallets: Wallet[],
  settings: Settings,
): Promise<string> {
  const amount = parsed.amount!
  const wallet = resolveWallet(parsed.wallet, wallets)
  const category = await findOrCreateCategory(
    parsed.category ?? FALLBACK_CATEGORY,
    parsed.subcategory,
  )
  const intent = parsed.intent ?? FALLBACK_INTENT

  await createTransaction({
    kind: 'out',
    amount,
    intent,
    categoryId: category.subcategoryId ?? category.categoryId,
    note: parsed.notes,
    walletId: wallet.id,
  }, settings.dayStartHour)

  const allowance = await currentAllowance(settings)
  return formatExpense({
    item: parsed.item || 'Pengeluaran',
    amount,
    intent,
    categoryPath: category.path,
    ...allowance,
  })
}

async function handleIncome(
  parsed: ParsedInput,
  wallets: Wallet[],
  settings: Settings,
): Promise<string> {
  const amount = parsed.amount!
  const wallet = resolveWallet(parsed.wallet, wallets)

  await createTransaction({
    kind: 'in',
    amount,
    note: parsed.notes,
    walletId: wallet.id,
  }, settings.dayStartHour)

  const allowance = await currentAllowance(settings)
  return formatIncome({
    item: parsed.item || 'Pemasukan',
    amount,
    walletName: wallet.name,
    ...allowance,
  })
}

/**
 * Transfers (spec §6.5). ParsedInput carries a single `wallet` field, which for
 * a transfer is the destination ("pindah 500k ke Bank"); the source is the
 * default spendable wallet, or the next one along if that IS the destination.
 */
async function handleTransfer(
  parsed: ParsedInput,
  wallets: Wallet[],
  settings: Settings,
): Promise<string> {
  const amount = parsed.amount!
  if (wallets.length < 2) {
    return '🤔 Cuma ada satu wallet, jadi belum ada tujuan pindahnya.'
  }

  const to = resolveWallet(parsed.wallet, wallets)
  const from = wallets.find((w) => w.kind === 'spendable' && w.id !== to.id)
  if (!from) {
    return '🤔 Belum kebaca pindah dari wallet mana. Coba sebut asal dan tujuannya.'
  }

  await createTransaction({
    kind: 'move',
    amount,
    note: parsed.notes,
    walletId: from.id,
    toWalletId: to.id,
  }, settings.dayStartHour)

  const allowance = await currentAllowance(settings)
  return formatTransfer({
    amount,
    fromWallet: from.name,
    toWallet: to.name,
    remainingAllowance: allowance.remainingAllowance,
  })
}

/**
 * handleMessage — the single entry point main.ts calls. Always resolves to a
 * reply string; failures become a message the user can act on rather than a
 * dropped update, since Telegram gives no second chance to answer.
 */
export async function handleMessage(text: string, chatId: number): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) {
    console.error('GOOGLE_AI_API_KEY not set')
    return '⚠️ Parser AI belum dikonfigurasi.'
  }

  let settings: Settings
  try {
    settings = await getSettings()
  } catch (err) {
    console.error('getSettings failed', err)
    return '⚠️ Database belum siap. Jalankan migrasi dulu.'
  }

  // Single-user bot: the first chat to talk claims it, and nobody else can
  // read or write the ledger afterwards (spec §15 #5).
  if (settings.telegramChatId === null) {
    settings = await updateSettings({ telegramChatId: chatId })
  } else if (settings.telegramChatId !== chatId) {
    return '⛔ Bot ini cuma buat satu orang.'
  }

  const [wallets, categories] = await Promise.all([ensureWallets(), getCategoryNames()])

  let parsed: ParsedInput
  try {
    parsed = await parseMessage(text, {
      categories,
      wallets: wallets.map((w) => w.name),
    }, apiKey)
  } catch (err) {
    console.error('parseMessage failed', err)
    return '⚠️ Parser lagi ngadat. Coba kirim ulang sebentar lagi.'
  }

  if (parsed.kind === 'clarify') {
    return `🤔 ${parsed.question ?? 'Maksudnya gimana? Coba tulis ulang.'}`
  }
  if (parsed.kind === 'commitment') {
    return '📌 Cicilan/tagihan rutin belum didukung (Fase 2). Catat manual dulu ya.'
  }
  if (parsed.amount === null) {
    return '🤔 Belum kebaca angkanya. Coba tulis nominalnya, mis. "kopi 18k".'
  }

  try {
    switch (parsed.kind) {
      case 'expense':
        return await handleExpense(parsed, wallets, settings)
      case 'income':
        return await handleIncome(parsed, wallets, settings)
      case 'transfer':
        return await handleTransfer(parsed, wallets, settings)
    }
  } catch (err) {
    console.error('handleMessage write failed', err)
    return `⚠️ Gagal nyimpen ${formatRupiah(parsed.amount)}. Coba lagi.`
  }
}
