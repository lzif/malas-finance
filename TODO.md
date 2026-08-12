# TODO

`spec.md` says where this is going. This file says where it actually is.

Last updated: 2026-08-10

## Pick up here

**Status: LIVE IN PRODUCTION and working.** `https://malas-finance.lzif.deno.net` — a real Telegram
message goes all the way through: AI parse → route → repository write → allowance recompute →
formatted reply. Phase 1 is complete. What remains is the review loop (Phase 3) and hardening, not
the core loop.

Verified live on 2026-08-10 (production, via `/admin`): app healthy, database reachable, all four
env vars set, webhook enforcing its secret, 41 seed categories intact, ledger empty after a
deliberate clear.

### ⚠️ Do these first, from Telegram — the bot is live but not yet configured for real use

1. **`gajian tiap sabtu`** — production `cycle_mode` is still `monthly-day` / anchor 1. The owner is
   paid weekly (Saturday), so until this is sent, a week's pay is divided across the rest of the
   month and the allowance reads far too low (Rp 29.166 instead of Rp 140.000 on a Rp 700k week).
   The earlier attempt to set this predates the code that understands it, so it never stored.
2. **`+saldo <actual cash>`** — spendable balance is Rp 0, so `allowanceToday` is Rp 0 and every
   reply reads "dari Rp 0". Nothing else can derive this number.
3. **Rotate `TELEGRAM_WEBHOOK_SECRET`.** The current value was shared in an assistant chat
   transcript on 2026-08-10, and because admin auth reuses it, that one value permits both a
   database wipe and forged Telegram updates. Change it in the Deploy dashboard **and** re-run
   `setWebhook` with the matching new `secret_token` — they must match or grammY 401s every update.
   Consider splitting admin onto its own `ADMIN_SECRET` at the same time (a one-function change in
   `admin/routes.ts`) so the two capabilities stop sharing a key.
4. **Register the commands with BotFather** (`/setcommands`) so `/start`, `/help`, `/jatah` appear
   in Telegram's menu. They already work when typed.

### Deployment (done — recorded for reference)

Deploy is **Deno Git integration**: the app is linked to `lzif/malas-finance` and deploys `main` on
every push — no workflow, no deploy token. `ci.yml` runs the gates on push/PR. There is deliberately
no `deno deploy` Actions workflow; it was removed to avoid two deployers racing.

- App: `malas-finance`, root directory, entrypoint `src/main.ts`, no build/install command.
- Database: Deno Deploy **built-in Postgres**, which injects `DATABASE_URL` automatically. Never set
  it by hand in the dashboard.
- Migrations run automatically via the app's **Pre-deploy command** = `deno task db:migrate`
  (idempotent, so every deploy is safe). Local fallback: set `DATABASE_URL` and run it yourself.
- Secrets in the dashboard: `GOOGLE_AI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
  `.env.example` documents them; `deno deploy env load .env --app malas-finance` sets them from a
  local `.env` without touching the dashboard.
- Telegram webhook:
  `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://malas-finance.lzif.deno.net/webhook&secret_token=<SECRET>"`

### Admin endpoints (added 2026-08-10)

Maintenance over HTTPS, because the built-in Postgres is TCP `:5432` and many sandboxes block
outbound TCP — an authenticated HTTP route is the only way to inspect or clean the live database
from outside the dashboard.

Auth: `x-admin-secret` header must equal `TELEGRAM_WEBHOOK_SECRET`. Fails closed (503 when no secret
is configured). Reusing the webhook secret is a deliberate single-user trade — a leak now also
permits a wipe; giving admin its own env var is a one-function change (`adminSecret()` in
`admin/routes.ts`).

```
S='<TELEGRAM_WEBHOOK_SECRET>'; B=https://malas-finance.lzif.deno.net/admin
curl -H "x-admin-secret: $S" $B/health          # liveness, DB reachable, which env vars are set
curl -H "x-admin-secret: $S" "$B/db?recent=20"  # settings, wallet balances, counts, recent tx
curl -H "x-admin-secret: $S" "$B/logs?limit=100"
curl -X POST -H "x-admin-secret: $S" "$B/db/clear?confirm=yes&scope=transactions"
curl -X POST -H "x-admin-secret: $S" "$B/db/clear?confirm=yes&scope=all"
```

`scope=transactions` empties the ledger and keeps wallets/settings; `scope=all` is a factory reset
(also wallets, custom categories, settings back to defaults, Telegram chat claim released) but keeps
the seed categories. Destructive routes are POST-only and require `confirm=yes`, so no link or
prefetch can fire them. `/logs` is an in-memory ring buffer (200 lines, per-isolate, empty after a
cold start) with known secret values redacted; Deno Deploy's own logs remain the durable record.

### ~~⚠️ Gemini free tier is 20 requests/day~~ — fixed 2026-08-10

Resolved by changing model and adding a fallback chain. Free-tier daily request budgets, read off
the AI Studio rate-limit page:

| Model                                 | RPM | RPD        |
| ------------------------------------- | --- | ---------- |
| `gemini-2.5-flash` (old primary)      | 5   | **20**     |
| `gemini-2.5-flash-lite`               | 10  | 20         |
| `gemini-3-flash-preview`              | 5   | 20         |
| `gemini-3.1-flash-lite` (new primary) | 15  | **500**    |
| `gemma-4-26b-a4b-it` (fallback)       | 30  | **14,400** |

The chain is ordered by quota, not capability — a smarter model that has run out parses nothing.
`gemini-2.5-flash` was dropped entirely rather than kept as a fallback: a 20/day tier is a
liability, not a safety net. Both chain models were verified to honour `responseSchema` and to apply
the §7.2 hard rules on real Indonesian input.

Behind both sits `offlineParse` — pure, no network. If every model fails and the text contains an
amount, the transaction is **still recorded** (labelled `impulse`, the honest default when the "why"
is unknown). Only a message with no recoverable amount now fails, and it says so specifically.
Verified: with a deliberately invalid key, `kopi 18k` still saved as expense/Rp 18.000; `helm` threw
the typed `ParserUnavailableError`.

Note the TPM column can look alarming for a model the bot never calls — Gemma showing 236K tokens
against a 16K/min cap came from AI Studio chat usage, where each turn resends the whole
conversation. The bot's own footprint is ~620 tokens per message.

How it surfaced, for the record: hit while testing on 2026-08-10 —
`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue: 20`. Every logged expense
costs one request, so ~20 messages exhausted the day and every later one 429'd. The old behaviour
replied "Parser lagi ngadat" and **dropped the expense**, which is the worst available failure for a
tracker whose whole value is not losing them.

### Weekly pay cycle (added 2026-08-10, from real use)

The owner is paid **borongan, every Saturday, a different amount each week**. The spec had no cycle
for that — only monthly, manual, and rolling-30 — and the consequence was not cosmetic: under
`monthly-day`, a week's pay is divided across the rest of the month, so the daily allowance read
**Rp 29.166 instead of Rp 100.000** on a Rp 700k week. Wrong in the _stingy_ direction, which is
easy to miss because an under-spending nudge feels like discipline rather than a bug.

`domain/cycle.ts` gained a `weekly` mode (`cycleAnchorDay` = weekday, 0=Sun..6=Sat) with
`dayOfWeek`/`nextWeekday` helpers in `day.ts`. Set it by chatting: `gajian tiap sabtu`. Verified
live end to end — Monday 2026-08-10, cycle Sat 08-08→Fri 08-14, 5 days left, Rp 700k → **Rp
140.000/day**, reconciled by hand.

### Architecture change from the original v3 design (2026-08-10)

The stack moved off the Deploy-Classic-era choices, because Classic shut down 2026-07-20 and the new
runtime lifts the constraints that drove them:

- **Database: Neon HTTP driver → built-in Postgres via postgres.js (TCP).** Classic was HTTPS-only,
  which is why Neon's HTTP driver was mandatory. The new runtime allows TCP and ships a built-in
  Postgres. postgres.js keeps the tagged-template query API, so `connection.ts` and `migrate.ts`
  changed but the four repo modules did not. **Verified**: all 19 integration steps pass over real
  TCP against a local Postgres 16 (the sandbox blocks outbound :5432, so a local instance stood in
  for the built-in DB — same wire protocol).
- **Transport: hand-rolled webhook → grammY; routing → Hono.** grammY's `webhookCallback` does the
  secret-token check (fails closed when the secret is unset) and update routing; Hono owns `/` and
  `/webhook`. **Verified** end to end: Hono routes, grammY 401s a wrong secret and 200s a valid one,
  and a valid update ran the real `handleMessage` → live Gemini → local Postgres → reply
  (`rokok surya 27.5k` → `[IMPULSIF]`, `Rokok & Sejenisnya`).

## What to do next

**The most valuable next step is not code.** spec §17's first acceptance criterion is reconciling
one full cycle by hand: log real spending for a week (the pay cycle is weekly), then check the bot's
"sisa hari ini" against actual cash. The domain math is unit-green and one weekly cycle has been
reconciled by hand on paper, but "tests pass" is not "the anchor number matched my wallet for a
month". Nothing below matters if that number lies. **Use it for a week before building more.**

When there is appetite to build, in rough priority order:

1. **Phase 3 — nightly summary + weekly audit** (spec §8, §16). The biggest remaining product bet:
   K3 says the bot must _speak first_, and today it only ever answers. This is the anti-habituation
   mechanism the whole premise rests on (§2). Needs `Deno.cron` (`src/scheduled/nightly.ts`,
   `weekly.ts`) — cron is already enabled on the Deploy app. The weekly audit should land Sunday
   night, but note the pay cycle is now Saturday-anchored, so confirm the audit window still lines
   up with a Sat→Fri cycle rather than assuming the spec's Sun→Sat framing.
2. **Edit-via-reply** (spec §8): "1 harusnya 25k" / "3 rutin". Today a mistake cannot be corrected
   from chat at all — the only fix is `/admin` or SQL. This gets sharper the moment the nightly
   summary starts inviting corrections.
3. **Phase 2 — commitments** (spec §16). `domain/commitment.ts` is ported and tested; only bot/repo
   wiring is missing. `handleMessage` currently replies that commitments are unsupported.
4. **Resolve the reserve-wallet spec contradiction** (below). Code is honest at the boundary, but
   `domain/` and the spec still disagree on paper.
5. **Wallet management from chat** (spec §12): `tambah wallet gopay 150k`. Today only the
   auto-created CASH wallet exists, so a reserve wallet cannot be made without SQL — which also
   makes the reserve-wallet logic unreachable in practice.

### Where things live (orientation for a fresh session)

```
src/domain/     pure math, no I/O — money, day, cycle, allowance, runway, commitment, types
src/db/         schema.sql, seed.sql, migrate.ts, connection.ts (postgres.js pool), rows.ts
src/db/repo/    the only write path — settings, wallets, transactions, categories (+ admin.ts,
                deliberately not imported by the message flow)
src/bot/        parser.ts (model chain), commands.ts (deterministic, pre-AI), webhook.ts
                (handleMessage: route → write → allowance → format), formatter.ts (pure)
src/admin/      routes.ts (authed maintenance), logbuf.ts (in-memory log ring)
src/main.ts     transport only: Hono routing + grammY webhook
```

Gates: `deno task test` (permissionless — DB/live tests skip), `deno task check`, `deno lint src/`,
`deno fmt --check src/ deno.json`. Integration tests need a real Postgres: see CLAUDE.md for the
local-Postgres recipe, since outbound `:5432` is blocked in the sandbox.

### Completed (for context, most recent first)

1. ~~**`src/db/repo/*.ts`**~~ — **done.** Settings, wallets, transactions, categories — the 19
   integration steps now pass over TCP (postgres.js) as well as they did on Neon-HTTP. Lazy
   `getSql()` in `connection.ts` so permissionless `deno test` stays green.
2. ~~**Wire the real flow**~~ — **done**, in `src/bot/webhook.ts`. `main.ts` is now transport only
   (Hono + grammY). Live smoke against Gemini:
   - `rokok surya 27.5k abis lembur` →
     `💾 rokok surya — Rp 27.500 [IMPULSIF] / 📁 Rokok & Sejenisnya`
   - `+gajian 2.4jt` → income to CASH, allowance jumps to Rp 104.347
   - `makan siang 25rb` → `[RUTIN]`, `📁 Makanan & Minuman`
   - `helm` (no amount) → clarify: "Berapa harga helm?"
   - a different `chat_id` → refused (single-user guard, §15 #5)

   All four messages matched **existing seed categories** — zero new categories created, which is
   the match-first rule (§5.3) actually holding under a live model rather than in a unit test. Test
   rows were removed afterwards; the DB is back to a clean slate.
3. ~~**Onboarding**~~ — **done**, but not as spec'd. Real use showed two of the three questions
   should not be asked at all (spec §13 is rewritten to match): daily spend is _learned_ by
   `runway.ts`, and payday is set by chatting whenever the user knows it. Only spendable balance is
   prompted for — as a non-blocking nudge while `allowanceToday` is 0, never a gate. `/start` and
   `/help` (`bot/commands.ts`) are deterministic, so they work with no API key. `started_at` is set
   automatically on the first transaction.
4. ~~**Fallback + retry** (spec §15 #8)~~ — **done.** Model chain (`gemini-3.1-flash-lite` →
   `gemma-4-26b-a4b-it`) ordered by free-tier quota, then a deterministic `offlineParse` last resort
   so an expense is never lost to a quota wall. Non-retryable errors (bad key, malformed request)
   stop the chain instead of burning it. See the quota section above.

### The day boundary now names its own timezone — fixed, no env var

`dayKeyOf` used to read the _process's_ local calendar day via `getFullYear/getMonth/getDate`, and
Deno Deploy isolates run as UTC. Every transaction logged between 00:00 and 07:00 WIB was filed
against **yesterday** — landing on a day whose allowance was already spent while the new day still
read full, with the cycle rolling over a day late. `dayStartHour` could not compensate: it only
shifts backwards (0..6).

`domain/day.ts` now formats against an explicitly named zone (`APP_TIME_ZONE = 'Asia/Jakarta'`)
using `Intl.DateTimeFormat`. Nothing has to be configured at deploy time, and `deno test` no longer
depends on the zone the suite runs in. Verified: with `TZ` unset and the process on
`Aug 09 18:20 UTC`, `kopi 18k` stored `day_key = 2026-08-10` — the WIB date. Two regression tests
pin it, one asserting a raw UTC instant so the test fails if this ever goes back to process-local
time.

The `timeZone` parameter is threaded through rather than reading the constant directly, so promoting
it to a `timezone` column on `settings` is a small change if it ever needs to vary.

Related, still open: `createTransaction`'s future-dated guard builds "end of today" with
`setHours(23,59,59,999)`, which is still process-local. Harmless while `at` always defaults to now,
but it will be off by the UTC/WIB offset the moment a caller passes an explicit `at` (editing a past
transaction, Phase 3).

Note that the "timezone" entry under carried-over limits below is a _different_ bug (a device
changing zones); its reasoning — "the clock is server-side, one timezone" — is what hid this one,
because that one timezone was UTC, not Jakarta.

### Needs a spec decision: reserve wallets in the allowance

spec §4.4's `spentToday` has no wallet filter, but §12 excludes reserve wallets from
`spendableBalance`. Taken literally together, an expense charged to a reserve wallet adds money back
into `allowanceBasis` that `spendableBalance` never saw leave: `beli laptop 2jt dari tabungan`
inflated the allowance and then silently snapped it back the next day. `bot/webhook.ts` now filters
reserve-wallet transactions out of `transactionsToday` at the boundary, which keeps the anchor
honest, but `domain/` and the spec still disagree on paper. Decide which section is authoritative
and make them match.

Known rough edges (not blocking, worth a pass):

- The model returns `item` in the user's original casing (`rokok surya`), while spec §6.1 shows it
  title-cased (`Rokok Surya`). A prompt fix, not a code fix.
- Transfers can only name one end. `ParsedInput` has a single `wallet` field, so "pindah 500k dari
  tabungan ke cash" cannot express its source; the code treats the named wallet as the destination
  and takes the default spendable wallet as the source. It now refuses to guess when the name
  doesn't match a wallet (rather than fabricating both operands), but a reserve → spendable
  withdrawal is still unrepresentable. Needs a `fromWallet` in the parser schema.
- `ensureWallets` is check-then-act with no `UNIQUE` on `wallets.name`, so two messages arriving
  together on a fresh install could each insert a `CASH` wallet. Tiny window, single user; a unique
  index would close it.

Setup for the next session: `deno task db:migrate` applies `schema.sql` + `seed.sql` to
`DATABASE_URL` (idempotent, verified). Live tests need `--allow-net --allow-env` with
`GOOGLE_AI_API_KEY` / `DATABASE_URL` set; without them they skip.

**Before trusting the numbers in production, reconcile one full cycle by hand** (spec §17 criterion
7 — the most important one). The domain math is ported and unit-green, but "unit tests pass" is not
"the anchor number matched my wallet for a month".

---

## Phase 1 — Foundation (spec §16) — COMPLETE, deployed and in real use

| Item                                                                  | Status                                                                                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deno project setup (`deno.json`, tasks, import map, CI)               | done                                                                                                                                                                                                |
| `domain/` ported from v2 + tests green on Deno                        | done — money, day, cycle, commitment, allowance, runway, types (39 tests / 96 steps)                                                                                                                |
| `parseAmount` — Indonesian amount shorthand (§6.2)                    | done — k/rb/ribu, jt/juta/m, dotted-grouping disambiguation, tested                                                                                                                                 |
| `bot/formatter.ts` — pure reply formatting (§6, §8)                   | started — expense/income/transfer + anchor line, tested. Nightly/weekly/ask formatting still to come                                                                                                |
| PostgreSQL schema (`db/schema.sql`)                                   | done — matches spec §5.1                                                                                                                                                                            |
| Seed data (`db/seed.sql`) — seed categories + settings row            | done — idempotent, **verified against real Neon** (two migrate runs stay 11 top / 30 sub / 0 dupes)                                                                                                 |
| `db/connection.ts` (Postgres pool)                                    | done — postgres.js (TCP) against the built-in DB; was Neon-HTTP until Deploy Classic's HTTPS-only limit was lifted (2026-07-20). Tagged-template API preserved, so the repo layer was untouched     |
| `db/migrate.ts` + `db/sql.ts` (idempotent migration runner)           | done — `deno task db:migrate`; `splitStatements` unit-tested (a live run caught a comment-semicolon split bug, now pinned)                                                                          |
| `bot/parser.ts` (AI parser, Gemini)                                   | done — **verified against live Gemini**: rokok→impulse, makan siang→routine, +gajian→income. Hard rules (§7.2) enforced in code, not left to the model                                              |
| `main.ts` webhook entry                                               | done — Hono routing + grammY `webhookCallback` (secret check, fails closed); delegates to `bot/webhook.ts`                                                                                          |
| `db/repo/*` with integrity rules (§5.2)                               | done — settings, wallets, transactions, categories; **19 integration steps verified over real TCP** (postgres.js, local PG 16); lazy `getSql()` so permissionless `deno test` stays green           |
| Real expense/income/transfer flow (parser → repo → allowance → reply) | done — `bot/webhook.ts`; **verified live** (Gemini + Postgres) across expense/income/transfer/clarify + the single-user guard                                                                       |
| Onboarding (§13)                                                      | done — reshaped: only spendable balance is prompted (non-blocking nudge). Daily spend is learned by `runway.ts`; payday set by chat. `/start`, `/help`, `/jatah` deterministic in `bot/commands.ts` |
| Model fallback chain (§15 #8)                                         | done — `gemini-3.1-flash-lite` → `gemma-4-26b-a4b-it` → deterministic `offlineParse`, ordered by free-tier quota so an expense is never lost                                                        |
| Admin/maintenance endpoints                                           | done — `/admin/health`, `/admin/db`, `/admin/logs`, `/admin/db/clear`; authed, fails closed                                                                                                         |

## Phase 2 — Commitments (spec §16)

Not started. Registration via natural language, payment flow, allowance deduction, due-date
reminders. The domain functions (`domain/commitment.ts`) are ported and tested; only the bot/repo
wiring is missing.

## Phase 3 — Review (spec §16)

Not started. Nightly summary, weekly audit, edit-via-reply, category management, new-category
flagging. Needs `Deno.cron` (`src/scheduled/nightly.ts`, `weekly.ts`).

## Phase 4 — Dashboard (spec §16)

Not started. Read-only Telegram WebApp (`src/web/`): impulse ratio, 28-day sparkline, weekly
comparison, intent/category breakdown, commitment status.

---

## Carried-over known limits (from v2, still true in the ported domain)

Each was found by review, verified in the code, and judged not worth fixing at single-user scale.
None are forgotten.

- **Rolling mode does not surface overdue bills.** In `rolling` mode the cycle starts today, so a
  bill that fell due earlier this month is outside the commitment window and does not reduce the
  allowance. There is no cycle for it to be overdue _within_; a proper fix means giving rolling mode
  a real period, which belongs to a spec revision, not a patch.
- **`dayKey` values become inconsistent if the device/server changes timezone.** A required test in
  v2, never handled in code. Less likely to bite now that the clock is server-side (Deno Deploy, one
  timezone) rather than a roaming phone, but the class of bug is unchanged.

## Sharpest risk

Habituation (spec §2). The anchor number becoming wallpaper is the failure mode that kills the whole
premise, and no test can catch it. v3's bet is that a bot that _speaks first_ (K3) and an AI that
categorizes _honestly_ (K2) resist habituation better than a screen the user had to open. If the
impulse ratio has not moved after two months of real use, the mechanism failed — not the user.
