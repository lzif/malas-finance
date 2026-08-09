# AGENTS.md

Instructions for any AI coding agent working in this repository — Claude, Gemini, Codex, Cursor, or anything else. This is the canonical file. `CLAUDE.md` points here because Claude Code looks for that filename specifically; every other tool reads `AGENTS.md` directly.

## What this is

MalasFinance v3 "Jujur" — a Telegram bot that tracks one Indonesian user's personal expenses through natural language, with an AI that categorizes every transaction instead of trusting the user to self-report honestly. Deno Deploy + PostgreSQL + TypeScript. No build step.

The app's purpose is **not** to record spending but to make the user honest about *why* they spent. That distinction drives every design decision.

**This is a pivot.** v2 was a Svelte/Capacitor/Dexie native app (Phase 1 complete). It was replaced wholesale in 2026-08. The old code lives only in git history — do not resurrect Svelte, Capacitor, `android/`, Dexie, or IndexedDB.

## Read these first, in this order

1. **`spec.md`** — the authoritative design. Exact formulas, integrity rules, edge cases. **Read the relevant section before changing anything numeric.** Code comments reference it by section (`spec §4.4`); keep those references accurate.
2. **`TODO.md`** — where the project actually is, phase by phase, as opposed to where the spec says it is going.
3. This file.

The domain math survived two rounds of adversarial review in v2 (recorded in the v2 spec's §13, in git history). Those findings were deliberate fixes — re-introducing the original behavior silently reintroduces a known bug. Notably: **commitment paid-status is derived from transactions, never stored**; the commitment window is the cycle itself, because an unpaid overdue bill must never vanish and raise the allowance; future-dated transactions are rejected outright; and a `saving` commitment is settled by a `move`, never an `out`.

## Commands

Deno is the runtime. There is no `npm`, no `node_modules`, no build.

```bash
deno task test         # deno test src/ — the whole suite
deno task check        # deno check — type gate, must be clean before pushing
deno task dev          # deno serve --watch src/main.ts (local webhook server)
deno task start        # deno serve src/main.ts

deno test src/domain/money.test.ts     # a single file
deno test --filter "parseAmount"       # a single test by name substring
deno lint src/                          # lint gate, must be clean before pushing
deno fmt                                # formatter (config in deno.json: no semicolons, single quotes)
```

`deno check` and `deno lint` are the gates. Both must report zero problems before pushing; CI (`.github/workflows/ci.yml`) runs check + lint + test on every push.

If `deno` is not installed in a fresh session, install it: `curl -fsSL https://deno.land/install.sh | sh` — a single binary, no root needed.

## Architecture

Layers, strictly one-directional (spec §11):

```
src/domain/   pure functions — the numeric truth. Imports nothing outside domain/.
src/db/       schema.sql + seed.sql + connection + repositories (the only write path)
src/bot/      webhook, AI parser, formatter, commands
src/scheduled/ nightly + weekly cron jobs
src/web/      read-only Telegram WebApp dashboard
src/main.ts   Deno Deploy fetch-handler entry point
```

**`domain/` must import nothing outside `domain/`.** No PostgreSQL, no Telegram, no `Deno.*`. It takes plain arrays and objects and returns plain objects. This is the load-bearing constraint of the whole project: it lets every formula be tested with `deno test` in milliseconds, with no database and no bot. If a calculation needs the database, it belongs in the repo layer, not `domain/`.

- **Deno needs explicit file extensions in relative imports** — `from './day.ts'`, never `from './day'`. This is the single mechanical difference from the v2 source.
- **Tests use `@std/testing/bdd` + `@std/expect`**, a drop-in for v2's vitest `describe/it/expect`. Import them via the versioned aliases in `deno.json`'s import map (`from '@std/testing/bdd'`), not a bare `jsr:` specifier — `deno lint`'s `no-unversioned-import` rule enforces this.

### Traps that have already bitten (carried from v2, still true)

- **`dayKey` is denormalized.** Every transaction stores a `'YYYY-MM-DD'` string derived from `at` + `dayStartHour`. Never compute a day boundary ad hoc — use `dayKeyOf` / `daysBetween` from `domain/day.ts`. `daysBetween(x, x) === 0`; the cycle and cold-start formulas depend on that exact convention.
- **The repository is the only write path and enforces integrity itself** (spec §5.2). The DB CHECK constraints are the last line, not the only line.
- **Deletion is always soft.** `deleted_at` is set; rows are never removed.
- **Money is whole rupiah stored as `INTEGER`.** Reject non-integers at the boundary. `parseAmount` (`domain/money.ts`) is the one place natural-language amounts (`27.5k`, `2.4jt`) become integers — its disambiguation rule is pinned in spec §6.2 and by tests.

## Language rule

Three layers, and they differ:

| Layer | Language |
|---|---|
| Markdown, docs, `spec.md` | English |
| Code, comments, identifiers, commit messages, PR bodies | English |
| **String literals shown to the bot's user** (Telegram replies) | **Bahasa Indonesia** |

The Indonesian copy is deliberate, not leftover. The intent taxonomy `TERENCANA / RUTIN / IMPULSIF / DARURAT` and the onboarding questions are designed in Indonesian; translating them changes the product. i18n is explicitly out of scope (spec §14). The repository owner speaks Indonesian; conversation with them is in Indonesian, but nothing written into the repo is.

## Secrets and runtime config

Nothing secret goes in the repo. Deno Deploy environment variables hold everything:

- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — the `secret_token` set on `setWebhook`; Telegram echoes it in the `X-Telegram-Bot-Api-Secret-Token` header, and the webhook rejects any request whose header does not match (spec §15 #5)
- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_AI_API_KEY` — Gemini/Gemma via Google AI Studio

`main.ts` reads these with `Deno.env.get`. Never hardcode a token or connection string; never commit a `.env`.

## Working discipline

**Work on the designated feature branch, never on `main`.** Confirm the checkout is clean before finishing and say so if it is not.

**Review is part of finishing, not an optional extra.** After completing any change to code — especially anything touching money, dates, or persistence — run an adversarial review before reporting it done. Feed the reviewer the relevant `spec.md` sections alongside the diff, state explicitly what is out of scope so it does not report deliberate omissions as defects, and warn it that code comments quote the spec and may not match what the code does.

**Then verify the findings yourself before accepting any.** Reviewers overstate, misread intent, and occasionally argue for the exact opposite of what is correct — that happened more than once in v2, including a review that proposed a commitment-window bound which turned out to over-count. Open the code, confirm each claim, and say plainly which you reject and why.

**Sync the docs to match reality before ending the session.** `TODO.md` says where the project actually is — a finished item left marked "not started" is a lie that costs the next session a wasted re-read. Update its status and its "Pick up here" order every time a listed item gets built. If the work pinned down a concrete detail `spec.md` left open — a literal string, a threshold, a suffix the parser accepts — add it to `spec.md` too, in the same style as existing entries. Don't leave a decision only in code and a commit message: `spec.md` and `TODO.md` are what the next session reads first.

## Deployment

Deno Deploy runs `src/main.ts`'s default-export `fetch` handler. There is no build. Set the four environment variables above in the Deno Deploy dashboard, then register the webhook with `setWebhook` (URL = the deployment's `/webhook`, `secret_token` = `TELEGRAM_WEBHOOK_SECRET`).

- Never push to `main` directly, never force-push, never merge your own PR. Open a draft PR and let the owner merge.
- Database schema changes go through `src/db/schema.sql`; run `schema.sql` then `seed.sql` against a fresh database. Both are idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

## Current state

The spec describes the finished product; the app is early Phase 1. The domain layer is ported and green, the schema and seed exist, and `main.ts` is a runnable walking skeleton that verifies the webhook plumbing but does not yet parse with AI, persist, or compute the allowance. See `TODO.md` for the authoritative, current list.
