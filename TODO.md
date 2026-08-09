# TODO

`spec.md` says where this is going. This file says where it actually is.

Last updated: 2026-08-08 (the pivot commit)

## Pick up here

The v3 pivot foundation is in, and the two hardest external integrations are now
built and **verified against the real services**: PostgreSQL (Neon) and the AI
parser (Gemini). **Next: the repository layer and wiring the real flow** to
replace the walking skeleton in `src/main.ts`.

Concrete next steps, roughly in order:

1. ~~**`src/db/repo/*.ts`**~~ — **done.** Settings, wallets, transactions,
   categories — all verified against real Neon (19 integration tests). Lazy
   `getSql()` in `connection.ts` so permissionless `deno test` stays green.
2. **Wire the real flow in `main.ts` / `bot/webhook.ts`**: `parseMessage`
   (done) → route by `kind` → repo write → `computeAllowance` (ported) →
   `bot/formatter.ts` (started) → reply. Handle the `clarify` branch (spec §6.7).
3. **Onboarding** (spec §13): the three-question first-run flow, persisting to
   `settings` + creating the CASH wallet.
4. **Fallback + retry** (spec §15 #8): Gemma fallback when Gemini errors/rate-limits.

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
| `main.ts` webhook entry | walking skeleton — verifies secret, parses amount, echoes; not yet wired to parser/DB/allowance |
| `db/repo/*` with integrity rules (§5.2) | done — settings, wallets, transactions, categories; **verified against real Neon** (19 integration tests); lazy `getSql()` so permissionless `deno test` stays green |
| Real expense/income/transfer flow (parser → repo → allowance → reply) | not started |
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
