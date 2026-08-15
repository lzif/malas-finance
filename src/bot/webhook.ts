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
import {
  HELP_TEXT,
  matchCommand,
  START_TEXT,
  WEEKDAY_NAMES,
  ZERO_BALANCE_HINT,
} from './commands.ts'
import type { Command } from './commands.ts'
import { anchorLine, formatExpense, formatIncome, formatTransfer } from './formatter.ts'
import { computeAllowance } from '../domain/allowance.ts'
import type { AllowanceResult } from '../domain/allowance.ts'
import { cycleFor } from '../domain/cycle.ts'
import { dayKeyOf } from '../domain/day.ts'
import { formatRupiah } from '../domain/money.ts'
import type { Intent } from '../domain/types.ts'
import { getSettings, updateSettings } from '../db/repo/settings.ts'
import type { Settings } from '../db/repo/settings.ts'
import { createWallet, listWallets, spendableBalance } from '../db/repo/wallets.ts'
import type { Wallet } from '../db/repo/wallets.ts'
import {
  createTransaction,
  getTransactionsForCycle,
  getTransactionsForDay,
} from '../db/repo/transactions.ts'
import { createCommitment, findCommitmentByName, listCommitments } from '../db/repo/commitments.ts'
import { unpaidCommitments } from '../domain/commitment.ts'
import { findOrCreateCategory, getCategoryNames } from '../db/repo/categories.ts'

/** Fallback when the model returns an expense with no category (spec §5.3). */
const FALLBACK_CATEGORY = 'Lainnya'

/** Words that mark a move or a commitment as savings rather than spending. */
const SAVING_WORDS = ['nabung', 'tabung', 'tabungan', 'saving']

/** Auto-created the first time the user saves, so "nabung 150k" just works. */
const DEFAULT_RESERVE_WALLET = 'TABUNGAN'

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

/**
 * Raised when the transaction was committed but the allowance could not be
 * read back. Distinguishing this from a failed write matters more than it
 * looks: the reply is the user's only receipt, so telling them "gagal
 * nyimpen" after a successful insert invites them to send the message again
 * and silently double-count it — with no edit or delete flow until Phase 3.
 */
class AllowanceReadError extends Error {}

async function currentAllowance(settings: Settings, wallets: Wallet[]): Promise<Allowance> {
  try {
    return await readAllowance(settings, wallets)
  } catch (err) {
    throw new AllowanceReadError(String(err))
  }
}

async function readAllowance(settings: Settings, wallets: Wallet[]): Promise<Allowance> {
  const result = await readAllowanceDetail(settings, wallets)
  return {
    remainingAllowance: result.remainingAllowance,
    allowanceToday: result.allowanceToday,
  }
}

/**
 * The full allowance computation, exported so the Phase-4 dashboard shows the
 * same number the chat reply does. Duplicating this in web/ would let the two
 * drift, and a dashboard that contradicts the bot is worse than no dashboard —
 * the anchor number only works if there is exactly one of it (spec §4.4).
 */
export async function readAllowanceDetail(
  settings: Settings,
  wallets: Wallet[],
): Promise<AllowanceResult> {
  const today = dayKeyOf(Date.now(), settings.dayStartHour)
  const cycle = cycleFor(today, settings)
  const [balance, transactions, commitments, cycleTransactions] = await Promise.all([
    spendableBalance(),
    getTransactionsForDay(today),
    listCommitments(),
    getTransactionsForCycle(cycle.start, cycle.end),
  ])

  // Spending charged to a reserve wallet must not enter the allowance math.
  // spec §4.4's spentToday has no wallet filter, but §12 excludes reserve
  // wallets from spendableBalance — so counting a reserve expense here would
  // add money back into allowanceBasis that spendableBalance never saw leave,
  // inflating today's allowance and then silently snapping it back tomorrow.
  // Reconciling the two sections is a spec question (TODO.md); filtering at
  // this boundary keeps the anchor number honest meanwhile.
  const reserveIds = new Set(wallets.filter((w) => w.kind === 'reserve').map((w) => w.id))

  const result = computeAllowance({
    spendableBalance: balance,
    transactionsToday: transactions
      .filter((t) => !reserveIds.has(t.walletId))
      .map((t) => ({
        kind: t.kind,
        amount: t.amount,
        commitmentId: t.commitmentId,
      })),
    // Unpaid bills due this cycle are RESERVED out of the basis, not charged
    // to whichever day they happen to be paid on. Without this a Rp 275k debt
    // payment landed entirely on today, driving "sisa hari ini" to -Rp 411.172
    // against a Rp 121.428 daily allowance — arithmetically exact, and
    // meaningless. Reserving spreads the obligation across the cycle instead,
    // and the payment itself carries a commitmentId so domain/allowance.ts
    // leaves it out of spentToday (it would otherwise be counted twice).
    unpaidCommitments: unpaidCommitments(
      commitments,
      cycleTransactions.map((t) => ({
        commitmentId: t.commitmentId,
        dayKey: t.dayKey,
        kind: t.kind,
      })),
      cycle.start,
      cycle.end,
    ),
    endBuffer: settings.endBuffer,
    daysRemaining: cycle.daysRemaining,
  })

  return result
}

/**
 * Append the zero-balance nudge when there is no money to divide.
 *
 * `allowanceToday === 0` means the allowance basis is empty — the bot has no
 * idea how much money exists, so the anchor line reads "dari Rp 0". Left
 * unexplained that looks broken rather than un-configured, which is exactly
 * how it read in first real use. Nothing is blocked: the transaction is
 * already saved, this only tells the user how to make the number meaningful.
 */
function withZeroBalanceHint(reply: string, allowance: Allowance): string {
  return allowance.allowanceToday === 0 ? `${reply}\n\n${ZERO_BALANCE_HINT}` : reply
}

/** Case-insensitive exact match on wallet name; null when the user named none. */
function matchWallet(name: string | null, wallets: Wallet[]): Wallet | null {
  if (!name) return null
  return wallets.find((w) => w.name.toLowerCase() === name.toLowerCase()) ?? null
}

/**
 * The wallet an expense or income belongs to. A named wallet wins; anything
 * unnamed or unrecognised falls back to the default spendable wallet, so a
 * typo costs the user nothing (spec §12). Safe here because the fallback only
 * picks which pocket the money came from — see handleTransfer for why a move
 * cannot use it.
 */
function resolveWallet(name: string | null, wallets: Wallet[]): Wallet {
  const match = matchWallet(name, wallets)
  if (match) return match
  const spendable = wallets.find((w) => w.kind === 'spendable')
  if (!spendable) throw new Error('Tidak ada wallet spendable.')
  return spendable
}

/**
 * Handle a deterministic command (spec §11). Runs before the AI parser, so
 * `/start` and `/help` work with no API key, no quota, and no database rows.
 */
async function handleCommand(
  command: Command,
  settings: Settings,
  wallets: Wallet[],
): Promise<string> {
  switch (command.kind) {
    case 'start':
      return START_TEXT
    case 'help':
      return HELP_TEXT

    case 'allowance': {
      const a = await currentAllowance(settings, wallets)
      const line = anchorLine(a.remainingAllowance, a.allowanceToday)
      return a.allowanceToday === 0 ? `${line}\n\n${ZERO_BALANCE_HINT}` : line
    }

    case 'set-weekly': {
      await updateSettings({ cycleMode: 'weekly', cycleAnchorDay: command.weekday })
      return [
        `✅ Oke, gajian tiap hari ${WEEKDAY_NAMES[command.weekday]}.`,
        'Jatah harian dibagi rata sampai gajian berikutnya, dan reset tiap ' +
        `${WEEKDAY_NAMES[command.weekday]}.`,
        'Nominalnya boleh beda-beda tiap minggu — kehitung otomatis dari saldomu.',
      ].join('\n')
    }

    case 'set-monthly': {
      await updateSettings({ cycleMode: 'monthly-day', cycleAnchorDay: command.day })
      return [
        `✅ Oke, gajian tanggal ${command.day}.`,
        `Jatah harian dibagi rata sampai tanggal ${command.day} bulan depan.`,
      ].join('\n')
    }

    case 'payday-unclear':
      return [
        '🤔 Gajianmu tiap hari apa? Contoh:',
        '• `gajian tiap sabtu`',
        '• `gajian tanggal 25`',
      ].join('\n')
  }
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
  // A subcategory only means something under the category the model chose. If
  // it named none, grafting the subcategory onto "Lainnya" would mint a
  // duplicate of a node that already lives elsewhere in the tree (e.g. a
  // second "Rokok" under Lainnya), which is the overlapping taxonomy §5.3
  // rule 2 forbids — and it is permanent until Phase 3 adds category editing.
  const category = parsed.category
    ? await findOrCreateCategory(parsed.category, parsed.subcategory)
    : await findOrCreateCategory(FALLBACK_CATEGORY, null)
  const intent = parsed.intent ?? FALLBACK_INTENT

  // Does this payment settle a declared bill? If so it is already reserved out
  // of the allowance basis, so tagging it keeps it out of spentToday — an
  // untagged payment would be charged to today AND stay reserved, which is the
  // double-count that makes the daily number collapse.
  const commitment = await findCommitmentByName(parsed.item ?? '')

  await createTransaction({
    kind: 'out',
    amount,
    intent,
    categoryId: category.subcategoryId ?? category.categoryId,
    note: parsed.notes,
    walletId: wallet.id,
    commitmentId: commitment?.id ?? null,
  }, settings.dayStartHour)

  const allowance = await currentAllowance(settings, wallets)
  const reply = withZeroBalanceHint(
    formatExpense({
      item: parsed.item || 'Pengeluaran',
      amount,
      intent,
      categoryPath: category.path,
      ...allowance,
    }),
    allowance,
  )
  // Say so explicitly: the user just spent real money and saw the daily number
  // move far less than the amount. Without a reason that reads as a bug.
  //
  // Careful with the wording — the allowance does still fall, by
  // amount / daysRemaining, because the money genuinely left the wallet. What
  // the tag buys is that it is NOT charged to today as discretionary spending;
  // it is absorbed by the cycle. Claiming it costs nothing would be a lie the
  // user could check.
  return commitment
    ? `${reply}\n🔁 Tagihan "${commitment.name}" — nggak dihitung jajan hari ini, ` +
      'dibagi rata ke sisa hari.'
    : reply
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

  const allowance = await currentAllowance(settings, wallets)
  return withZeroBalanceHint(
    formatIncome({
      item: parsed.item || 'Pemasukan',
      amount,
      walletName: wallet.name,
      ...allowance,
    }),
    allowance,
  )
}

/**
 * Transfers (spec §6.5). ParsedInput carries a single `wallet` field, so only
 * one end of the move can be named; this treats it as the destination and
 * takes the default spendable wallet as the source.
 *
 * Unlike expense and income, a transfer must NOT fall back to a default when
 * the named wallet doesn't match. The fallback would invent an operand rather
 * than pick a pocket: "pindah 500k ke BCA" against a wallet stored as "Bank"
 * would resolve to the default, then move money between two wallets the user
 * never mentioned — and confirm it. An unmatched name asks instead.
 */
async function handleTransfer(
  parsed: ParsedInput,
  wallets: Wallet[],
  settings: Settings,
): Promise<string> {
  const amount = parsed.amount!

  // "nabung 150k" names no destination — the user should not have to create a
  // wallet before they can save. Auto-provision one reserve wallet the first
  // time, the same way the CASH wallet is auto-created. Without this the reply
  // is "cuma ada satu wallet", which reads as the bot refusing to save money.
  const savingHint = `${parsed.item ?? ''} ${parsed.wallet ?? ''} ${parsed.notes ?? ''}`
    .toLowerCase()
  const isSaving = SAVING_WORDS.some((w) => savingHint.includes(w))

  let pool = wallets
  let to: Wallet | null = null
  if (isSaving) {
    to = pool.find((w) => w.kind === 'reserve') ?? null
    if (!to) {
      to = await createWallet(DEFAULT_RESERVE_WALLET, 'reserve', 0)
      pool = [...pool, to]
    }
  }

  if (!to) {
    if (pool.length < 2) {
      return '🤔 Cuma ada satu wallet, jadi belum ada tujuan pindahnya.'
    }
    to = matchWallet(parsed.wallet, pool)
    if (!to) {
      const names = pool.map((w) => w.name).join(', ')
      return `🤔 Pindah ke wallet mana? Yang ada: ${names}.`
    }
  }

  const from = pool.find((w) => w.kind === 'spendable' && w.id !== to.id)
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

  const allowance = await currentAllowance(settings, pool)
  return formatTransfer({
    amount,
    fromWallet: from.name,
    toWallet: to.name,
    remainingAllowance: allowance.remainingAllowance,
    allowanceToday: allowance.allowanceToday,
    // Money leaving the spendable pool really does change the allowance
    // (spec §12); only spendable → spendable leaves it untouched.
    allowanceChanged: from.kind !== to.kind,
  })
}

/**
 * Declaring a recurring bill or savings target (spec §4.3, §6.4).
 *
 * Declaring is a one-off: from then on the amount is reserved out of the
 * allowance basis every cycle, and any payment whose item name matches settles
 * it (see findCommitmentByName). This is what stops a monthly obligation from
 * being charged to whichever single day it was paid on.
 */
async function handleCommitment(parsed: ParsedInput): Promise<string> {
  const amount = parsed.amount
  if (amount === null) {
    return '🤔 Nominalnya berapa? Mis. "wifi 85k tiap tanggal 5".'
  }
  // dueDay is what separates a commitment from a one-off payment. The parser
  // is told never to return this kind without one, but the model can still
  // drop the field — asking beats inventing a date the user never gave.
  if (parsed.dueDay === null) {
    return `🤔 Tiap tanggal berapa "${parsed.item || 'ini'}" jatuh temponya? ` +
      'Mis. "wifi 85k tiap tanggal 5".'
  }

  const name = parsed.item || 'Tagihan'
  const haystack = `${name} ${parsed.notes ?? ''}`.toLowerCase()
  const kind = SAVING_WORDS.some((w) => haystack.includes(w)) ? 'saving' : 'bill'

  const existing = await findCommitmentByName(name)
  if (existing) {
    return `📌 "${existing.name}" sudah tercatat (${formatRupiah(existing.amount)}, ` +
      `tiap tanggal ${existing.dueDay}).`
  }

  const commitment = await createCommitment(name, amount, kind, parsed.dueDay)
  const label = kind === 'saving' ? 'Tabungan rutin' : 'Tagihan rutin'
  return `📌 ${label} dicatat: ${commitment.name} — ${formatRupiah(commitment.amount)} ` +
    `tiap tanggal ${commitment.dueDay}.\n` +
    'Mulai sekarang nominalnya disisihkan otomatis dari jatah harian, ' +
    'jadi pas bayar nanti nggak bikin jatah hari itu jebol.'
}

/**
 * handleMessage — the single entry point main.ts calls. Always resolves to a
 * reply string; failures become a message the user can act on rather than a
 * dropped update, since Telegram gives no second chance to answer.
 */
export async function handleMessage(text: string, chatId: number): Promise<string> {
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

  const wallets = await ensureWallets()

  // Deterministic commands first: they must work when the model cannot be
  // reached, which is exactly when a user is most likely to send /help.
  const command = matchCommand(text)
  if (command) {
    try {
      return await handleCommand(command, settings, wallets)
    } catch (err) {
      console.error('handleCommand failed', err)
      return '⚠️ Gagal memproses perintah. Coba lagi.'
    }
  }

  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) {
    console.error('GOOGLE_AI_API_KEY not set')
    return '⚠️ Parser AI belum dikonfigurasi.'
  }

  const categories = await getCategoryNames()

  let parsed: ParsedInput
  try {
    parsed = await parseMessage(text, {
      categories,
      wallets: wallets.map((w) => w.name),
    }, apiKey)
  } catch (err) {
    console.error('parseMessage failed', err)
    // Reached only when every model failed AND no amount could be recovered
    // from the text — so there is genuinely nothing to save. When an amount
    // was present, parseMessage returns a deterministic parse instead and the
    // transaction is still recorded (spec §15 #8).
    return '⚠️ Parser lagi ngadat dan angkanya nggak kebaca. ' +
      'Coba tulis ulang pakai nominal, mis. "kopi 18k".'
  }

  if (parsed.kind === 'clarify') {
    return `🤔 ${parsed.question ?? 'Maksudnya gimana? Coba tulis ulang.'}`
  }
  if (parsed.kind === 'commitment') {
    return await handleCommitment(parsed)
  }
  if (parsed.amount === null) {
    return '🤔 Belum kebaca angkanya. Coba tulis nominalnya, mis. "kopi 18k".'
  }

  // The runway needs a reference date for its cold-start weighting. Set it on
  // the first real transaction rather than asking — the answer is always
  // "today", so a question would only be ceremony (spec §13).
  if (settings.startedAt === null) {
    try {
      settings = await updateSettings({
        startedAt: dayKeyOf(Date.now(), settings.dayStartHour),
      })
    } catch (err) {
      console.error('could not set startedAt', err)
    }
  }

  try {
    switch (parsed.kind) {
      case 'expense':
        return await handleExpense(parsed, wallets, settings)
      case 'income':
        return await handleIncome(parsed, wallets, settings)
      case 'transfer':
        return await handleTransfer(parsed, wallets, settings)
      default:
        // `kind` comes from JSON.parse, so the compiler's exhaustiveness proof
        // does not bind at runtime. Without this the function would return
        // undefined and the user would get no reply at all.
        console.error('unknown parsed.kind', parsed.kind)
        return '🤔 Belum kebaca maksudnya. Coba tulis ulang.'
    }
  } catch (err) {
    if (err instanceof AllowanceReadError) {
      console.error('allowance read failed after commit', err)
      return `✅ ${formatRupiah(parsed.amount)} tersimpan, tapi jatah hari ini gagal dihitung. ` +
        'Jangan kirim ulang — cek lagi sebentar lagi.'
    }
    console.error('handleMessage write failed', err)
    return `⚠️ Gagal nyimpen ${formatRupiah(parsed.amount)}. Coba lagi.`
  }
}
