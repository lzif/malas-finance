# TODO

`spec.md` says where this is going. This file says where it actually is.

Last updated: 2026-08-10

## Pick up here

**The bot works end to end, now on the new Deno Deploy stack.** A Telegram
message goes all the way through: AI parse → route → repository write →
allowance recompute → formatted reply. What is left is the surrounding
experience, not the core loop.

### Deployment setup the owner must do once (in console.deno.com)

Deploy is via **Deno's Git integration**: the app is linked to the GitHub repo
and deploys the production branch (`main`) on every push — no workflow, no
deploy token. (There is no `deno deploy` Actions workflow; `ci.yml` still runs
the gates on push/PR.) **The new stack must be merged to `main` first** — until
then `main` is the old Neon-HTTP code, which cannot talk to the built-in
Postgres.

1. **Create the app** linked to `lzif/malas-finance`, root dir, entrypoint
   `src/main.ts`, no build command. Production URL:
   `https://malas-finance.lzif.deno.net`.
2. **Provision the built-in Postgres** for the app. It injects `DATABASE_URL`
   automatically — do not set it by hand.
3. **Run the migration** against that DB once: set `DATABASE_URL` locally to the
   built-in DB's connection string and `deno task db:migrate` (applies
   `schema.sql` + `seed.sql`, idempotent).
4. **Set the three secrets** — `GOOGLE_AI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET` — via the app's "Environment Variables" in the
   dashboard, or from a local `.env` (see `.env.example`) with
   `deno deploy env load .env --app malas-finance`.
5. **Point Telegram at the deploy** once it is live:
   `curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://malas-finance.lzif.deno.net/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
   The `secret_token` MUST match `TELEGRAM_WEBHOOK_SECRET` or grammY 401s every
   update.

### Architecture change from the original v3 design (2026-08-10)

The stack moved off the Deploy-Classic-era choices, because Classic shut down
2026-07-20 and the new runtime lifts the constraints that drove them:

- **Database: Neon HTTP driver → built-in Postgres via postgres.js (TCP).**
  Classic was HTTPS-only, which is why Neon's HTTP driver was mandatory. The
  new runtime allows TCP and ships a built-in Postgres. postgres.js keeps the
  tagged-template query API, so `connection.ts` and `migrate.ts` changed but
  the four repo modules did not. **Verified**: all 19 integration steps pass
  over real TCP against a local Postgres 16 (the sandbox blocks outbound
  :5432, so a local instance stood in for the built-in DB — same wire
  protocol).
- **Transport: hand-rolled webhook → grammY; routing → Hono.** grammY's
  `webhookCallback` does the secret-token check (fails closed when the secret
  is unset) and update routing; Hono owns `/` and `/webhook`. **Verified**
  end to end: Hono routes, grammY 401s a wrong secret and 200s a valid one,
  and a valid update ran the real `handleMessage` → live Gemini → local
  Postgres → reply (`rokok surya 27.5k` → `[IMPULSIF]`, `Rokok & Sejenisnya`).

Concrete next steps, roughly in order:

1. ~~**`src/db/repo/*.ts`**~~ — **done.** Settings, wallets, transactions,
   categories — the 19 integration steps now pass over TCP (postgres.js) as
   well as they did on Neon-HTTP. Lazy `getSql()` in `connection.ts` so
   permissionless `deno test` stays green.
2. ~~**Wire the real flow**~~ — **done**, in `src/bot/webhook.ts`. `main.ts` is
   now transport only (Hono + grammY). Live smoke against Gemini:
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

### The day boundary now names its own timezone — fixed, no env var

`dayKeyOf` used to read the *process's* local calendar day via
`getFullYear/getMonth/getDate`, and Deno Deploy isolates run as UTC. Every
transaction logged between 00:00 and 07:00 WIB was filed against **yesterday**
— landing on a day whose allowance was already spent while the new day still
read full, with the cycle rolling over a day late. `dayStartHour` could not
compensate: it only shifts backwards (0..6).

`domain/day.ts` now formats against an explicitly named zone
(`APP_TIME_ZONE = 'Asia/Jakarta'`) using `Intl.DateTimeFormat`. Nothing has to
be configured at deploy time, and `deno test` no longer depends on the zone the
suite runs in. Verified: with `TZ` unset and the process on `Aug 09 18:20 UTC`,
`kopi 18k` stored `day_key = 2026-08-10` — the WIB date. Two regression tests
pin it, one asserting a raw UTC instant so the test fails if this ever goes
back to process-local time.

The `timeZone` parameter is threaded through rather than reading the constant
directly, so promoting it to a `timezone` column on `settings` is a small
change if it ever needs to vary.

Related, still open: `createTransaction`'s future-dated guard builds "end of
today" with `setHours(23,59,59,999)`, which is still process-local. Harmless
while `at` always defaults to now, but it will be off by the UTC/WIB offset the
moment a caller passes an explicit `at` (editing a past transaction, Phase 3).

Note that the "timezone" entry under carried-over limits below is a *different*
bug (a device changing zones); its reasoning — "the clock is server-side, one
timezone" — is what hid this one, because that one timezone was UTC, not
Jakarta.

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
| `db/connection.ts` (Postgres pool) | done — postgres.js (TCP) against the built-in DB; was Neon-HTTP until Deploy Classic's HTTPS-only limit was lifted (2026-07-20). Tagged-template API preserved, so the repo layer was untouched |
| `db/migrate.ts` + `db/sql.ts` (idempotent migration runner) | done — `deno task db:migrate`; `splitStatements` unit-tested (a live run caught a comment-semicolon split bug, now pinned) |
| `bot/parser.ts` (AI parser, Gemini) | done — **verified against live Gemini**: rokok→impulse, makan siang→routine, +gajian→income. Hard rules (§7.2) enforced in code, not left to the model |
| `main.ts` webhook entry | done — Hono routing + grammY `webhookCallback` (secret check, fails closed); delegates to `bot/webhook.ts` |
| `db/repo/*` with integrity rules (§5.2) | done — settings, wallets, transactions, categories; **19 integration steps verified over real TCP** (postgres.js, local PG 16); lazy `getSql()` so permissionless `deno test` stays green |
| Real expense/income/transfer flow (parser → repo → allowance → reply) | done — `bot/webhook.ts`; **verified live** (Gemini + Postgres) across expense/income/transfer/clarify + the single-user guard |
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
