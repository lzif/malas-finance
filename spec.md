# MalasFinance v3 — "Jujur"

> The authoritative design. This document replaced v2 "Sadar" (Svelte/Capacitor/Dexie)
> when the project pivoted from a native app to a Telegram bot. The v2 spec and
> codebase live on in git history; nothing here depends on them at runtime.

**Status:** active — Phase 1 foundation in progress
**Date pivoted:** 2026-08-08
**Replaced:** MalasFinance v2 "Sadar" (Svelte/Capacitor/Dexie, Phase 1 complete)

---

## 0. One-Paragraph Summary

MalasFinance v3 is a Telegram bot that tracks personal expenses through natural language, with an AI that categorizes every transaction instead of trusting the user to do it honestly. The core problem v2 tried to solve — making users conscious before money leaves — remains, but the mechanism changes: instead of a native app with manual intent buttons, a Telegram bot with AI-assigned categories removes the self-reporting bias entirely. The user types "rokok surya 27.5k" and the AI decides it's impulsive, not the user. Overrides are allowed but reviewed nightly — the app doesn't block self-deception in real time, it surfaces it every evening when the user can reflect without purchase pressure.

---

## 1. Why Pivoted

v2 is not broken. Phase 1 was complete, domain logic tested, numbers correct. What was wrong is the **input mechanism**.

| Aspect | v2 (native app) | v3 (Telegram bot) |
|---|---|---|
| Input method | Open app → keypad → tap intent button | Chat "rokok 27.5k" → done |
| Who categorizes | User (self-reporting bias) | AI (objective, skeptical) |
| Override friction | None — user taps any intent freely | Asymmetric — downgrade requires review |
| Notifications | Capacitor (OEM kills them) | Telegram messages (reliable) |
| Dev cycle | Svelte + Vite + Capacitor | Deno Deploy, no build step |
| Storage | IndexedDB (eviction risk) | PostgreSQL (durable) |
| Access | Must open app | Already in Telegram |

The behavioral insight: a finance app that asks the user "why did you spend this?" will always receive the most emotionally comfortable answer. An AI that decides "why you spent this" based on what the item actually is — and defends that decision — produces honest data.

### 1.1 Carried over from v2

- **All domain mathematics.** Daily allowance formula (§4.4), commitment system (§4.3), runway with seed weight decay (§4.5), impulse ratio (§4.6), cycle modes (§4.2). These are pure functions with no framework dependency — they ported directly to Deno, unchanged except for `.ts` import extensions. Their v2 test suite ported with them and passes on Deno.
- **Integrity rules** from §5.2: amount > 0, intent required for expenses, future dates forbidden, etc.
- **Anti-habituation philosophy**: anchor number must not become wallpaper. In v3, the bot proactively sends the number — the user doesn't need to open anything.
- **Commitment system**: bill + saving types. Without this, the anchor number lies every day.

### 1.2 What was discarded

- Entire Svelte codebase and UI layer
- Capacitor and Android build pipeline
- IndexedDB / Dexie schema
- All v2 historical data (if any existed from testing)
- Notification system (replaced by Telegram messages)
- Tag system (replaced by dynamic category/subcategory)
- Manual intent selection (replaced by AI assignment)
- GitHub Pages deploy workflow and Android debug-build workflow

---

## 2. Philosophy: Three Binding Commitments (revised)

Carried from v2 with modifications for the bot medium.

### K1 — Anchor number always visible

In v2 this meant "above the input form". In v3 this means **every bot response includes the remaining daily allowance**. Every time the user interacts with the bot, the number is there. No tap required — it's in the same chat they're already looking at.

### K2 — Every expense has an intent (AI-assigned)

Not "what for" but "**why**". Terencana, Rutin, Impulsif, or Darurat. In v2 the user selected this; in v3 the **AI assigns it**. The user can dispute — but the dispute is reviewed, not rubber-stamped.

### K3 — The app speaks first

Nightly summaries, weekly audits, commitment reminders. The bot initiates conversation, not just responds. Telegram makes this trivially reliable compared to Capacitor notifications that OEMs kill.

---

## 3. Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Deno Deploy (free tier) | Zero-config deployment, no build step |
| Database | PostgreSQL | Durable, relational, no eviction risk |
| Bot framework | Telegram Bot API via webhook | No polling, no long-running process needed |
| AI SDK | Vercel AI SDK (`ai` package, via npm: specifier) | Unified interface, provider-agnostic |
| LLM (primary) | Gemini Flash via Google AI Studio | Free tier, fast, good at structured extraction |
| LLM (fallback) | Gemma via Google AI Studio | Free tier, sufficient for simple parsing tasks |
| Web UI | Telegram WebApp (read-only) | Summary/dashboard attached to bot, no separate hosting |
| Language | TypeScript | Same as the v2 domain layer |
| Test runner | `deno test` + `@std/testing/bdd` + `@std/expect` | Drop-in for the v2 vitest `describe/it/expect` |

---

## 4. Domain Model and Mathematics

**Carried from v2 in full.** The formulas are identical — only the storage layer changed from IndexedDB to PostgreSQL. Key formulas repeated here for reference.

### 4.1 Basic definitions

`dayKey`, `daysBetween`, `walletBalance`, `spendableBalance`. Integer rupiah, no fractional units. `dayKey` is a `'YYYY-MM-DD'` string derived from `at` + `dayStartHour`; all date arithmetic works on dayKeys, not epoch ms, so timezone/DST bugs disappear at the root. `daysBetween(x, x) === 0` — every cycle and cold-start formula depends on this exact convention.

### 4.2 Cycle

Three modes: `monthly-day` (default), `manual`, `rolling`. `daysRemaining = max(1, daysBetween(end, today) + 1)` — an absolute clamp against division by zero on the last day. In `manual` mode, an expired end date falls back to rolling behavior so the anchor number is never empty.

### 4.3 Commitment

Bill + saving types. **Paid status is derived from transactions, never stored** — soft-deleting a payment un-pays the commitment for free. The commitment window is the cycle itself (`[cycleStart, cycleEnd]`), *not* `[startOfMonth, cycleEnd]`: the latter over-counts a bill from the previous cycle when the anchor day is not the 1st. A `saving` commitment is settled by a `move` into a reserve wallet, a `bill` by an `out`.

### 4.4 Daily allowance

```
spentToday         = Σ amount  for out, dayKey == today, commitmentId == null
allowanceBasis     = spendableBalance + spentToday
availableFunds     = allowanceBasis − unpaidCommitments − endBuffer
allowanceToday     = availableFunds > 0 ? floor(availableFunds / daysRemaining) : 0
remainingAllowance = allowanceToday − spentToday
```

Adding today's spend back into the basis is what keeps `allowanceToday` stable across the day — spending does not move the number it is measured against; it only moves `remainingAllowance`.

### 4.5 Runway

28-day rolling average with 14-day seed weight decay. Today excluded from the average window. The `N > 0` guard is absolute: `mean([])` is `NaN`, and `0 × NaN` is still `NaN`, so a zero weight does not save the first day.

### 4.6 Impulse ratio

Current cycle, discretionary spend only. Emergency gets identical framing to impulse.

---

## 5. Data Model

### 5.1 PostgreSQL schema

The authoritative DDL lives in `src/db/schema.sql`; `src/db/seed.sql` plants the seed categories (§5.3) and the singleton settings row, both idempotently. Tables: `wallets`, `categories` (self-referential parent/child tree), `commitments`, `transactions` (soft-deleted via `deleted_at`), `settings` (single row, `key = 'settings'`). Money is `INTEGER` rupiah throughout.

### 5.2 Integrity rules

Enforced at the repository layer *and* as DB CHECK constraints — the repo is the only write path, the DB is the last line.

| Rule | Enforcement |
|---|---|
| `amount > 0` and integer | DB CHECK + reject at repo |
| `intent` present ⟺ `kind = 'out'` | DB CHECK |
| `to_wallet_id` present ⟺ `kind = 'move'` | DB CHECK + repo validation |
| `wallet_id ≠ to_wallet_id` | DB CHECK |
| `at` must not exceed end of today | Repo validation |
| Spendable wallets with non-zero balance cannot be archived | Repo validation |
| Future-dated transactions forbidden | Repo validation |
| `day_key` always derived from `at` + `day_start_hour` | Calculated on write |
| Deletion is always soft (`deleted_at`), never a row removal | Repo |

### 5.3 Category table design

Categories are **dynamic, not hardcoded**. A simple parent-child tree: `parent_id = NULL` rows are top-level, others are subcategories; `is_seed = true` marks the initial seed list vs user/AI-created ones. The AI must (1) match to existing categories first, (2) not create categories that overlap with existing ones, (3) flag new categories in the nightly summary for review.

**Seed categories** (planted by `seed.sql`):

| Category | Subcategories |
|---|---|
| Makanan & Minuman | Makan pokok, Jajan, Minuman, Groceries |
| Rokok & Sejenisnya | Rokok, Vape/liquid |
| Transportasi | Bensin, Parkir & tol, Ojol/angkot |
| Tagihan | Listrik, WiFi/internet, BPJS, Pulsa/paket data |
| Rumah & Kebutuhan Harian | Toiletries, Household, Laundry |
| Hiburan | Streaming/langganan, Game, Nongkrong/hangout |
| Pakaian & Penampilan | Pakaian, Aksesoris, Grooming |
| Kesehatan | Obat, Periksa/berobat |
| Pendidikan & Skill | Kursus/training, Buku/materi |
| Sosial | Traktir, Sumbangan/infaq, Hadiah |
| Lainnya | Uncategorized |

---

## 6. Input Flow

All interaction is natural language via Telegram chat. No slash commands required.

### 6.1 Expense (default)

```
User: rokok surya 27.5k
Bot:  💾 Rokok Surya — Rp 27.500 [IMPULSIF]
      📁 Rokok & Sejenisnya > Rokok
      Sisa hari ini: Rp 52.500 dari Rp 80.000
```

AI parses: amount (27500), item name (Rokok Surya), intent (impulsif), category (Rokok & Sejenisnya > Rokok), wallet (CASH default), notes (none). The bot reply strings are produced by pure functions in `src/bot/formatter.ts` and pinned by unit tests.

### 6.2 Amount shorthand (pinned)

`parseAmount` in `src/domain/money.ts` reads the amount out of free text. The suffixes it understands, and the disambiguation rule:

- `k`, `rb`, `ribu` → ×1.000 (`27.5k` = 27500, `85rb` = 85000)
- `jt`, `juta`, `m`, `jete` → ×1.000.000 (`2.4jt` = 2400000)
- **With a multiplier suffix**, the dot/comma is a decimal point (`27,5k` = 27500).
- **Without a suffix**, the dot/comma is thousands grouping (`1.500` = 1500, not 1.5).
- No readable amount → `null`, so the caller asks (§6.6) rather than saving 0.

### 6.3 Income

Prefix `+` signals income. `+600k` → Rp 600.000 into CASH; `+gajian 2.4jt bank` → Rp 2.400.000 into Bank.

### 6.4 Commitment registration

Keywords "pertanggal", "tiap tanggal", "setiap bulan" signal a recurring commitment. `wifi 85k pertanggal 10` → bill WiFi, Rp 85.000, dueDay 10 (asks for confirmation before registering). For savings: `nabung 500k tanggal 1` → kind: saving.

### 6.5 Commitment payment

Keyword "bayar" pays a registered commitment: `bayar wifi` → settles it, allowance unchanged (the bill was already deducted as unpaid).

### 6.6 Wallet transfer

`pindah 500k ke gopay` → move CASH → GoPay, allowance unchanged.

### 6.7 AI ask — ambiguity resolution

When the AI cannot determine intent, category, or wallet with confidence, it asks.

**Must ask:** amount only with no context (`50k`); ambiguous intent (`helm 350k` — planned or impulse?); ambiguous wallet (`transfer 200k` — to whom?).

**Must NOT ask:** an item already patterned in history; when only one wallet exists (never ask which wallet); clear items (rokok = impulsif, makan siang = rutin, bensin = rutin).

### 6.8 Notes (AI auto-extracted)

The AI extracts contextual info that isn't amount/item/wallet/category and stores it as notes. `rokok surya 27.5k abis lembur` → notes: "abis lembur". No special syntax.

### 6.9 Editing via reply

Replying to any bot message that contains a saved transaction triggers edit mode. `harusnya 25k` on a saved-expense message corrects the amount and re-shows the anchor number.

---

## 7. AI Categorization System

### 7.1 Two dimensions

Every expense carries two orthogonal labels: **intent** (why: Terencana / Rutin / Impulsif / Darurat) and **category + subcategory** (what: dynamic taxonomy from §5.3). These are independent.

### 7.2 AI assignment rules

Hard rules the AI cannot override:

- **Always IMPULSIF:** rokok, vape, liquid, alcohol, addictive-by-nature items.
- **Always RUTIN:** makan pokok (basic meals, not restaurants), bensin (commute fuel), toiletries/household basics.
- **Context-dependent (AI judges):** makan di luar (rutin if no cheaper option, impulsif if a choice); kopi (impulsif if bought out, rutin if home supplies); clothing (terencana if needed, impulsif if spontaneous).
- **TERENCANA requires prior signal:** the user mentioned planning it, or it is clearly a considered purchase (electronics, furniture).
- **DARURAT requires a genuine emergency:** medical, critical repair (ban bocor). Not "I really want this" — that is impulsif.

### 7.3 Override flow

- **Real-time: no gatekeeping.** The AI assigns and saves immediately; disagreement is fixed by reply.
- **Nightly review: soft gatekeeping.** The summary shows AI-assigned categories; the user fixes by replying. The AI does not challenge fixes here — it is reflection, not confrontation.
- **Weekly audit: pattern detection.** The bot flags suspicious patterns (e.g. "rokok" as RUTIN 12 times).

---

## 8. Nightly Summary

Sent via Telegram at a configurable hour (default 21:00 WIB). Shows today's spend, remaining allowance (dari total), runway, a numbered list of the day's transactions with AI-assigned intents, the intent split with a runway-equivalent, any new categories created that day, and an invitation to correct by replying with a number ("1 harusnya 25k" / "3 rutin"). A no-spend day says so and shows the full allowance. Non-response does nothing — data is already saved; the summary is a review opportunity, not a gate.

---

## 9. Weekly Audit

Sent Sunday night (default 22:00 WIB, after the nightly summary). Aggregates the week: total, daily average, intent breakdown with runway-equivalents, flagged patterns (largest recurring impulse spends), and a comparison to last week. Timing rationale: gajian lands Saturday, so a Sunday-night audit captures one full Saturday-to-Saturday week.

---

## 10. Web UI (Read-Only Dashboard)

Served as a Telegram WebApp, opened via a bot button. **Read-only — all input happens through chat.**

**In scope:** current daily allowance + runway (K1), impulse ratio for the cycle, 28-day sparkline, weekly comparison, intent distribution, category breakdown, commitment status, monthly summary.

**Not in scope:** data input/editing, wallet management, settings changes, export/import.

---

## 11. Architecture

```
deno.json              ← tasks (test/check/dev/start), import map, fmt/lint config
src/
  domain/              ← pure functions, ported from v2. NO Deno/DB/Telegram imports.
    money.ts   day.ts   cycle.ts   commitment.ts
    allowance.ts   runway.ts   types.ts
    *.test.ts          ← ported v2 suite, runs on `deno test`
  db/
    schema.sql         ← authoritative DDL
    seed.sql           ← seed categories + singleton settings row (idempotent)
    connection.ts      ← PostgreSQL connection            (Phase 1)
    repo/              ← repository layer, the only write path (Phase 1)
      transactions.ts  wallets.ts  commitments.ts  categories.ts  settings.ts
  bot/
    webhook.ts         ← Telegram webhook handler         (Phase 1; skeleton in main.ts)
    parser.ts          ← AI input parser (Gemini Flash)   (Phase 1)
    formatter.ts       ← response message formatting       (started, pure + tested)
    commands.ts        ← fallback slash commands           (Phase 1)
  scheduled/
    nightly.ts  weekly.ts   ← cron jobs                    (Phase 3)
  web/
    app.ts  static/    ← Telegram WebApp dashboard         (Phase 4)
  main.ts              ← Deno Deploy entry point (fetch handler); walking skeleton
```

### 11.1 Domain layer isolation (unchanged from v2)

`domain/` receives plain data and returns plain data. It does not know PostgreSQL, Deno, or Telegram exist. All numerical truth is tested in milliseconds with plain unit tests — the load-bearing constraint that keeps the math verifiable without a bot, a database, or a network.

### 11.2 Webhook flow

```
Telegram → Deno Deploy (POST /webhook, secret verified)
  → parse message
  → if natural language: AI parser (Gemini Flash) → extract intent
  → route to handler (expense / income / commitment / transfer / edit / ask)
  → repository write
  → compute allowance
  → format response (bot/formatter.ts)
  → Telegram Bot API → send reply
```

### 11.3 Scheduled jobs

Deno Deploy cron (`Deno.cron`): nightly summary at the configured hour, weekly audit Sunday at the configured hour, commitment reminders the day before a due date.

---

## 12. Wallets

Multi-wallet, but simple. Default wallet **CASH** created on onboarding. User can add Bank, GoPay, OVO, DANA, etc. Each is `spendable` or `reserve`; reserve wallets are excluded from `spendableBalance` and the daily allowance. No wallet mentioned → CASH. Setup via chat: `tambah wallet gopay 150k`, `tambah wallet tabungan 2jt reserve`.

---

## 13. Onboarding

First interaction. Three questions asked sequentially: (1) spendable money now, (2) rough daily spend, (3) payday — a fixed monthly date, a known-but-irregular next date, or "gak tentu" (→ rolling 30-day mode). Ends by confirming balance, the computed daily allowance, and the cycle mode, then invites the user to start logging.

---

## 14. Out of Scope

Consciously rejected. Adding any requires an explicit new rationale.

Multi-currency · multi-user · sync across devices · budget envelopes · receipt photos · OCR · automatic recurring transactions (commitments cover this) · debt-credit tracking · chart libraries · translation (Indonesian only) · iOS app · Android app · web input (read-only dashboard only) · bank statement import · voice input · slash-command-only interface.

---

## 15. Resolved Design Questions

| # | Question | Resolution |
|---|---|---|
| 1 | Category taxonomy | Dynamic, AI-managed, seed list in §5.3 |
| 2 | AI prompt design | Implementation detail — follows §7 rules, uses AI SDK, prompt evolves with usage |
| 3 | Telegram message formatting | Pure functions in `bot/formatter.ts`, pinned by tests |
| 4 | Web dashboard design | Read-only, metrics in §10, layout decided during build |
| 5 | Deno Deploy architecture | Webhook verified by a shared secret echoed in the `X-Telegram-Bot-Api-Secret-Token` header; cron via `Deno.cron` |
| 6 | Testing strategy | Domain: unit tests (ported from v2, green on Deno). Repository: integration tests. Bot: manual + parser/formatter unit tests |
| 7 | Onboarding edge cases | AI handles garbage input via the ask flow (§6.7), no max attempts |
| 8 | Rate limiting | Primary Gemini Flash, fallback Gemma. If both exhausted: queue and retry, not block |
| 9 | Data migration | No. v2 data is discarded (same stance as v1→v2). Clean start |

---

## 16. Implementation Phases

| Phase | Contents | Complete when |
|---|---|---|
| **1 — Foundation** | PostgreSQL schema, repository layer with integrity rules, `domain/` ported from v2, Telegram webhook, AI parser (Gemini Flash), basic expense/income/transfer flow, onboarding, anchor number in every response | User can log expenses via chat and see correct daily allowance |
| **2 — Commitments** | Commitment registration via natural language, payment flow, commitment deduction from allowance, due-date reminders | Commitments work end-to-end, anchor number accounts for unpaid bills |
| **3 — Review** | Nightly summary, weekly audit, edit via reply, category management, new-category flagging | User receives nightly summaries and can fix transactions |
| **4 — Dashboard** | Telegram WebApp, impulse ratio, sparkline, weekly comparison, intent/category breakdown, commitment status | Read-only dashboard accessible from bot |

---

## 17. Definition of Done

Version 3.0.0 is ready for daily use when:

1. Logging an expense takes **one message** — no confirmation step, no commands.
2. Daily allowance is shown **in every bot response**.
3. AI correctly categorizes common items (rokok = impulsif, makan siang = rutin) without asking.
4. Nightly summary arrives at the configured time with all transactions.
5. Weekly audit flags suspicious categorization patterns.
6. Commitment payments do not cause allowance cliffs.
7. Daily allowance and runway match manual calculation for one full cycle.
8. Web dashboard loads from Telegram and shows correct metrics.

The seventh criterion is the most important, same as v2. Lying numbers kill trust, and trust is the only thing keeping a finance app alive.
