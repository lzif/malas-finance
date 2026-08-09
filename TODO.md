# TODO

`spec.md` says where this is going. This file says where it actually is.

Last updated: 2026-08-09

## Pick up here

**The bot works end to end.** A Telegram message now goes all the way through:
AI parse → route → repository write → allowance recompute → formatted reply.
Verified against live Neon + live Gemini (see below). What is left is the
surrounding experience, not the core loop.

Concrete next steps, roughly in order:

1. ~~**`src/db/repo/*.ts`**~~ — **done.** Settings, wallets, transactions,
   categories — all verified against real Neon (19 integration tests). Lazy
   `getSql()` in `connection.ts` so permissionless `deno test` stays green.
2. ~~**Wire the real flow**~~ — **done**, in `src/bot/webhook.ts`. `main.ts` is
   now transport only. Live smoke against real Neon + Gemini:
   - `rokok surya 27.5k abis lembur` → `💾 rokok surya — Rp 27.500 [IMPULSIF] / 📁 Rokok & Sejenisnya`
   - `+gajian 2.4jt` → income to CASH, allowance jumps to Rp 104.347
   - `makan siang 25rb` → `[RUTIN]`, `📁 Makanan & Minuman`
   - `helm` (no amount) → clarify: "Berapa harga helm?"
   - a different `chat_id` → refused (single-user guard, §15 #5)

   All four messages matched **existing seed categories** — zero new categories
   created, which is the match-first rule (§5.3) actually holding under a live
   model rather than in a unit test. Test rows were removed afterwards; the DB
   is back to a clean slate.
3. **Onboarding** (spec §13): the three-question first-run flow, persisting to
   `settings` + creating the CASH wallet. Today a fresh install silently gets a
   `CASH` wallet at Rp 0 and claims the first `chat_id` that talks to it —
   workable, but not the intended first-run experience.
4. **Fallback + retry** (spec §15 #8): Gemma fallback when Gemini errors/rate-limits.
   Right now a Gemini outage returns "Parser lagi ngadat" and the message is lost.

### Must be set before production: `TZ=Asia/Jakarta`

`dayKeyOf` reads the *process's* local calendar day, and Deno Deploy isolates
run as UTC unless `TZ` says otherwise. Unset, every transaction logged between
00:00 and 07:00 WIB is filed against **yesterday** — it lands on a day whose
allowance is already spent while the new day still reads full, and the cycle
rolls over a day late. `dayStartHour` cannot compensate: it only shifts
backwards (0..6).

Confirmed, not theoretical: the same message logged at 00:48 WIB produced
`day_key = 2026-08-09` under UTC and `2026-08-10` under `TZ=Asia/Jakarta`.
`main.ts` now logs a loud error at boot when the offset isn't +7, but the real
fix is a `timezone` column in `settings` so the day boundary stops depending on
an environment variable nobody can see from inside the app. Note that the
"timezone" entry under carried-over limits below is a *different* bug (a device
changing zones); its reasoning — "the clock is server-side, one timezone" — is
what hid this one, because that one timezone is UTC, not Jakarta.

### Needs a spec decision: reserve wallets in the allowance

spec §4.4's `spentToday` has no wallet filter, but §12 excludes reserve wallets
from `spendableBalance`. Taken literally together, an expense charged to a
reserve wallet adds money back into `allowanceBasis` that `spendableBalance`
never saw leave: `beli laptop 2jt dari tabungan` inflated the allowance and
then silently snapped it back the next day. `bot/webhook.ts` now filters
reserve-wallet transactions out of `transactionsToday` at the boundary, which
keeps the anchor honest, but `domain/` and the spec still disagree on paper.
Decide which section is authoritative and make them match.

Known rough edges (not blocking, worth a pass):

- The model returns `item` in the user's original casing (`rokok surya`), while
  spec §6.1 shows it title-cased (`Rokok Surya`). A prompt fix, not a code fix.
- Transfers can only name one end. `ParsedInput` has a single `wallet` field, so
  "pindah 500k dari tabungan ke cash" cannot express its source; the code treats
  the named wallet as the destination and takes the default spendable wallet as
  the source. It now refuses to guess when the name doesn't match a wallet
  (rather than fabricating both operands), but a reserve → spendable withdrawal
  is still unrepresentable. Needs a `fromWallet` in the parser schema.
- `ensureWallets` is check-then-act with no `UNIQUE` on `wallets.name`, so two
  messages arriving together on a fresh install could each insert a `CASH`
  wallet. Tiny window, single user; a unique index would close it.

Setup for the next session: `deno task db:migrate` applies `schema.sql` + `seed.sql`
to `DATABASE_URL` (idempotent, verified). Live tests need `--allow-net --allow-env`
with `GOOGLE_AI_API_KEY` / `DATABASE_URL` set; without them they skip.

**Before trusting the numbers in production, reconcile one full cycle by hand**
(spec §17 criterion 7 — the most important one). The domain math is ported and
unit-green, but "unit tests pass" is not "the anchor number matched my wallet for
a month".

---

## Phase 1 — Foundation (spec §16)

| Item | Status |
|---|---|
| Deno project setup (`deno.json`, tasks, import map, CI) | done |
| `domain/` ported from v2 + tests green on Deno | done — money, day, cycle, commitment, allowance, runway, types (39 tests / 96 steps) |
| `parseAmount` — Indonesian amount shorthand (§6.2) | done — k/rb/ribu, jt/juta/m, dotted-grouping disambiguation, tested |
| `bot/formatter.ts` — pure reply formatting (§6, §8) | started — expense/income/transfer + anchor line, tested. Nightly/weekly/ask formatting still to come |
| PostgreSQL schema (`db/schema.sql`) | done — matches spec §5.1 |
| Seed data (`db/seed.sql`) — seed categories + settings row | done — idempotent, **verified against real Neon** (two migrate runs stay 11 top / 30 sub / 0 dupes) |
| `db/connection.ts` (Neon serverless HTTP driver) | done — connects to Neon PG 17 over HTTPS; raw TCP is blocked on Deno Deploy so the HTTP driver is required, not optional |
| `db/migrate.ts` + `db/sql.ts` (idempotent migration runner) | done — `deno task db:migrate`; `splitStatements` unit-tested (a live run caught a comment-semicolon split bug, now pinned) |
| `bot/parser.ts` (AI parser, Gemini) | done — **verified against live Gemini**: rokok→impulse, makan siang→routine, +gajian→income. Hard rules (§7.2) enforced in code, not left to the model |
| `main.ts` webhook entry | done — transport only: routes, verifies the secret, delegates to `bot/webhook.ts`, sends the reply |
| `db/repo/*` with integrity rules (§5.2) | done — settings, wallets, transactions, categories; **verified against real Neon** (19 integration tests); lazy `getSql()` so permissionless `deno test` stays green |
| Real expense/income/transfer flow (parser → repo → allowance → reply) | done — `bot/webhook.ts`; **verified live** (Neon + Gemini) across expense/income/transfer/clarify + the single-user guard |
| Onboarding (§13) | not started |

## Phase 2 — Commitments (spec §16)

Not started. Registration via natural language, payment flow, allowance deduction,
due-date reminders. The domain functions (`domain/commitment.ts`) are ported and
tested; only the bot/repo wiring is missing.

## Phase 3 — Review (spec §16)

Not started. Nightly summary, weekly audit, edit-via-reply, category management,
new-category flagging. Needs `Deno.cron` (`src/scheduled/nightly.ts`, `weekly.ts`).

## Phase 4 — Dashboard (spec §16)

Not started. Read-only Telegram WebApp (`src/web/`): impulse ratio, 28-day
sparkline, weekly comparison, intent/category breakdown, commitment status.

---

## Carried-over known limits (from v2, still true in the ported domain)

Each was found by review, verified in the code, and judged not worth fixing at
single-user scale. None are forgotten.

- **Rolling mode does not surface overdue bills.** In `rolling` mode the cycle
  starts today, so a bill that fell due earlier this month is outside the
  commitment window and does not reduce the allowance. There is no cycle for it
  to be overdue *within*; a proper fix means giving rolling mode a real period,
  which belongs to a spec revision, not a patch.
- **`dayKey` values become inconsistent if the device/server changes timezone.**
  A required test in v2, never handled in code. Less likely to bite now that the
  clock is server-side (Deno Deploy, one timezone) rather than a roaming phone,
  but the class of bug is unchanged.

## Sharpest risk

Habituation (spec §2). The anchor number becoming wallpaper is the failure mode
that kills the whole premise, and no test can catch it. v3's bet is that a bot
that *speaks first* (K3) and an AI that categorizes *honestly* (K2) resist
habituation better than a screen the user had to open. If the impulse ratio has
not moved after two months of real use, the mechanism failed — not the user.
