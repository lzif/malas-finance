// web/app.ts — the read-only dashboard (spec §10, Phase 4).
//
// Two routes: the page shell, and one JSON endpoint that returns everything the
// page draws. Read-only by design — every write still happens through chat, so
// this file calls no repository mutator and mounts no POST.
//
// LANGUAGE RULE (AGENTS.md): user-facing strings are Bahasa Indonesia. The
// labels live in the HTML; this module returns numbers, not prose.

import { Hono } from '@hono/hono'
import { verifyInitData } from './auth.ts'
import { PAGE_HTML } from './page.ts'
import { computeStats } from '../domain/stats.ts'
import { cycleFor } from '../domain/cycle.ts'
import { addDays, dayKeyOf, dayRange } from '../domain/day.ts'
import { dueOccurrences, isPaid } from '../domain/commitment.ts'
import { readAllowanceDetail } from '../bot/webhook.ts'
import { getSettings } from '../db/repo/settings.ts'
import { listWallets, spendableBalance, walletBalance } from '../db/repo/wallets.ts'
import { getTransactionsForCycle } from '../db/repo/transactions.ts'
import { listCommitments } from '../db/repo/commitments.ts'
import { listCategories } from '../db/repo/categories.ts'

/** How far back the sparkline looks (spec §10). */
const SPARK_DAYS = 28

export const web = new Hono()

web.get('/', (c) => c.html(PAGE_HTML))

/**
 * Flatten the category tree into id → display path, so the dashboard can label
 * a spending slice without a second round trip per category.
 */
async function categoryNames(): Promise<Map<string, string>> {
  const tree = await listCategories()
  const names = new Map<string, string>()
  for (const parent of tree) {
    names.set(parent.id, parent.name)
    for (const child of parent.children ?? []) {
      names.set(child.id, `${parent.name} › ${child.name}`)
    }
  }
  return names
}

web.get('/api/summary', async (c) => {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const initData = c.req.header('x-telegram-init-data') ?? ''

  const auth = await verifyInitData(initData, botToken)
  if (!auth.ok) return c.json({ error: 'unauthorized', reason: auth.reason }, 401)

  const settings = await getSettings()
  // The ledger belongs to whoever claimed the bot. A valid Telegram signature
  // only proves *a* user opened the page, not that it is the owner — without
  // this check any Telegram user who found the URL would read the ledger.
  if (settings.telegramChatId !== null && settings.telegramChatId !== auth.user.id) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const today = dayKeyOf(Date.now(), settings.dayStartHour)
  const cycle = cycleFor(today, settings)
  const wallets = await listWallets()
  const reserveWalletIds = wallets.filter((w) => w.kind === 'reserve').map((w) => w.id)

  const sparkStart = addDays(today, -(SPARK_DAYS - 1))
  const [allowance, cycleTx, sparkTx, names, commitments, spendable] = await Promise.all([
    readAllowanceDetail(settings, wallets),
    getTransactionsForCycle(cycle.start, cycle.end),
    getTransactionsForCycle(sparkStart, today),
    categoryNames(),
    listCommitments(),
    spendableBalance(),
  ])

  const cycleStats = computeStats({
    transactions: cycleTx,
    reserveWalletIds,
    days: dayRange(cycle.start, today),
  })
  const spark = computeStats({
    transactions: sparkTx,
    reserveWalletIds,
    days: dayRange(sparkStart, today),
  })

  const reserveBalances = await Promise.all(
    wallets.filter((w) => w.kind === 'reserve').map(async (w) => ({
      name: w.name,
      balance: await walletBalance(w.id),
    })),
  )

  return c.json({
    today,
    user: { firstName: auth.user.firstName },
    cycle: {
      start: cycle.start,
      end: cycle.end,
      daysRemaining: cycle.daysRemaining,
      mode: settings.cycleMode,
    },
    allowance: {
      allowanceToday: allowance.allowanceToday,
      remainingAllowance: allowance.remainingAllowance,
      spentToday: allowance.spentToday,
      status: allowance.status,
      percentUsed: allowance.percentUsed,
    },
    balance: {
      spendable,
      reserve: reserveBalances,
      reserveTotal: reserveBalances.reduce((sum, r) => sum + r.balance, 0),
    },
    cycleStats: {
      totalIn: cycleStats.totalIn,
      totalOut: cycleStats.totalOut,
      net: cycleStats.net,
      savingRate: cycleStats.savingRate,
      savedToReserve: cycleStats.savedToReserve,
      impulseRatio: cycleStats.impulseRatio,
      intentTotals: cycleStats.intentTotals,
      byCategory: cycleStats.byCategory
        .slice(0, 8)
        .map((row) => ({
          name: row.categoryId ? names.get(row.categoryId) ?? 'Lainnya' : 'Lainnya',
          amount: row.amount,
        })),
    },
    last28: {
      daily: spark.daily,
      totalOut: spark.totalOut,
      averageDailyOut: spark.averageDailyOut,
    },
    commitments: commitments.map((commitment) => ({
      name: commitment.name,
      amount: commitment.amount,
      dueDay: commitment.dueDay,
      kind: commitment.kind,
      paid: isPaid(commitment, cycleTx, today),
      // Empty in a weekly cycle whose window misses the due date — see the
      // reservation gap recorded in TODO.md.
      dueThisCycle: dueOccurrences(commitment, { start: cycle.start, end: cycle.end }),
    })),
  })
})
