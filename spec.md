# MalasFinance v2 — "Sadar"

> Total rewrite specification. This document replaces `PLAN.md` and `next-spec.md`, both of which describe the old application and are no longer valid.

**Status:** approved to enter implementation planning stage
**Date:** 2026-07-28
**Replaces:** MalasFinance v1.5.2 (Kotlin/Compose/Room, ~2,150 lines)

---

## 0. One-Paragraph Summary

MalasFinance v2 is a personal finance app whose job is **not to track money, but to make users conscious before money leaves**. The old app was a tracker: it answered "how much have I spent?". The new app answers "**how much am I still allowed to spend today, and why is my money leaking?**". The difference is not a feature, but a pivot: one anchor number that is always visible above the input form, one mandatory intent on every expense, and an app that speaks first via notifications. Rewritten from scratch with Svelte + Vite + Capacitor so that the development cycle can run directly in Termux without waiting five minutes for CI.

---

## 1. Why Rewritten

The old app is not broken. It works, its data is safe, its releases are clean. What is wrong is its **pivot**.

| Aspect | v1 (tracker) | v2 (awareness generator) |
|---|---|---|
| Question answered | "How much have I spent?" | "How much am I still allowed to spend?" |
| Main number | Balance | Remaining allowance today |
| Category | CORE/OPER/HOBBY/VAULT — *what for* | Terencana/Rutin/Impulsif/Darurat — *why* |
| When it speaks | When opened | First, via notifications |
| Dev cycle | Push → wait for CI ~5 minutes | `npm run dev` → refresh, instant |
| Charts | Must be drawn manually on Canvas | SVG/CSS, almost free |

Patching v1 to reach v2 means replacing the data model, taxonomy, main screen, and the entire insight layer — which is everything except the release pipeline. Rewriting is cheaper than migrating.

### 1.1 Carried over from v1 (because it's actually right)

- Data security rules from `AGENTS.md`: soft-delete to trash, typed confirmation for large deletions, no silent destructive migrations, import always previews first.
- Release convention: tag `v<version>-b<build>`, uniquely named APK `MalasFinance-v<version>-b<build>.apk`.
- The "input must be fast" principle — in v2 it is actually strengthened, not sacrificed.
- Outstanding technical debt from `next-spec.md` ITEM-4: keystore and password **must** move to GitHub Secrets, not allowed into the v2 repo.

### 1.2 What is discarded

The entire Kotlin codebase, the entire Room schema, and **all historical data**. The new app starts clean. Cold-start consequences are handled via seed-based onboarding (§4.5), not via import.

---

## 2. Philosophy: Three Binding Commitments

Every design decision in this document must be traceable to one of these three commitments. If a feature does not serve one of them, that feature does not make the cut.

### K1 — Anchor number always visible

Today's remaining allowance is located **above the input form**, not in a separate dashboard. Awareness that requires one tap to view is awareness that will not be viewed. That number is there the second the spending decision is made.

### K2 — Every expense has an intent

Not "what for" (that is tags, optional), but "**why**". Terencana, Rutin, Impulsif, or Darurat. Mandatory, without a default value that can be lazily accepted. This is the only data that cannot be obtained from bank statements, and the only one that truly changes behavior.

### K3 — The app speaks first

An app that waits to be opened only serves people who are already aware. Threshold notifications, reminders, and weekly summaries are the primary mechanisms, not add-ons. **However**, notifications are a push, not a single source of truth — every notification must have an equivalent inside the app (§8.4).

---

## 3. Locked-In Decisions

Made through tiered interviews, then stress-tested via adversarial review (§13).

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Philosophy | Awareness / behavior change | Tracking is already solved; what isn't is changing behavior |
| D2 | Old data | Completely discarded | New taxonomy is incompatible; old history would pollute insights |
| D3 | Stack | Svelte + Vite + Capacitor | Least amount of code, instant dev loop in Termux, still gets APK |
| D4 | Layout | Input first, insights one tap away | If input is slow, there is no data to be aware of |
| D5 | Anchor number | Daily allowance, runway as second layer | Allowance = actionable, runway = context |
| D6 | Taxonomy | Intent: Terencana/Rutin/Impulsif/**Darurat** | Darurat added after review (§13.1, UX-02) |
| D7 | Notifications | Active mode | Per K3 |
| D8 | Wallets | Multi-wallet, no dedicated transfer transaction type | Accurate balance without admin fee complexity |
| D9 | Cold start | Seed via 3-question onboarding | Resolves D2 contradiction without rescinding it |
| D10 | Charts | Manual SVG/CSS, no library | uPlot dropped after review (§13) |

---

## 4. Domain Model and Mathematics

This is the most important part of the document. The entire value of the application relies on a single number; if that number lies even once, the user stops trusting it and the app dies.

### 4.1 Basic definitions

**Day.** A local calendar day starting at `dayStartHour` (default `0`, allowed `0..6`). This setting exists because recording a snack at 00:30 should count as "last night", not "today". All dates are represented as `YYYY-MM-DD` strings (`dayKey`), not millisecond arithmetic — this eliminates an entire class of timezone and DST bugs.

```
dayKeyOf(at, dayStartHour) = format(new Date(at - dayStartHour * 3_600_000), 'YYYY-MM-DD')
```

`dayKey` is **stored in transaction rows** and indexed. Daily queries become index lookups, not scans with date conversion.

**Days between.** Explicitly defined because all cycle and cold-start mathematics depend on it, and misinterpreting a single number here shifts every calculation in this document:

```
daysBetween(a, b) = floor((dateFrom(a) − dateFrom(b)) / 86_400_000)
```

Both arguments are `dayKey` strings, so `dayStartHour` is already absorbed into them and must not be applied twice. **`daysBetween(x, x) === 0`.** The consequences are binding: `daysRemaining` on the last day of the cycle has a value of `0 + 1 = 1` (not 2), and `daysSinceStart` on the first day has a value of `0` — which then triggers the `N > 0` guard in §4.5. Interpreting it as an inclusive count would halve the daily allowance on the last day of the cycle and ruin the cold-start ramp.

**Wallet balance.**
```
walletBalance(w) = w.initialBalance
                 + Σ(in  → w)
                 − Σ(out ← w)
                 + Σ(move → w)
                 − Σ(move ← w)
```
Only transactions with `deletedAt == null`.

**Spendable balance.** Total balance of all wallets with `kind: 'spendable'` that are not archived.
```
spendableBalance = Σ walletBalance(w)  for w.kind == 'spendable' && !w.archived
```
Wallets with `kind: 'reserve'` (savings, emergency funds) do **not** count. This is the replacement for the VAULT category in v1, and is more honest: in v1, VAULT was merely a label on expenses; in v2, saved money genuinely leaves the pool that can be spent.

### 4.2 Cycle

Three modes, because income is not always regular.

| Mode | Behavior | For whom |
|---|---|---|
| `monthly-day` (default) | Cycle runs from the `cycleAnchorDay` date of this month until the day before the same date next month | Fixed payday date |
| `manual` | User sets cycle end date; when passed, the app asks for the next date | Irregular but predictable income |
| `rolling` | `cycleEnd = today + 29`, always a 30-day horizon | Unpredictable income |

**Edge cases that must be handled:**

- `cycleAnchorDay = 31` in February → clamped to the last day of the month (28 or 29). Also applies to 29, 30, 31 in short months.
- Leap years.
- `manual` mode whose end date has passed → `cycle-expired` status, the app displays a prompt and **temporarily uses `rolling` behavior** so the anchor number is never empty.

```
daysRemaining = max(1, daysBetween(cycleEnd, today) + 1)
```

The `max(1, …)` clamping is an absolute defense against division by zero on the last day of the cycle.

### 4.3 Commitment

An entity that was **absent in the initial design** and added after review found that without it, the anchor number lied every day (§13.1, M-02).

```
Commitment { id, name, amount, kind: 'bill' | 'saving', dueDay: 1..31, walletId?, active }
```

**Paid status is not stored — it is derived from transactions.** This is a decisive choice, made after the second review (§13.2) showed that storing a `paidCycles` list created three flaws simultaneously: double-writing without atomicity, lack of reverse synchronization when payments are deleted, and cycle keys that are impossible to define for `manual` and `rolling` modes. Deriving it from transactions removes all three at the root, and results in less code.

**Commitment window.**
```
commitmentWindow = [startOfMonth, cycleEnd]
```

One rule that applies to all three cycle modes. Its lower bound is the start of the current month, not today — this is what keeps bills that are **past due but unpaid** counted. A lower bound of `today` in the previous design produced damaging behavior: you forgot to pay electricity on the 10th, then on the 11th the app informed you that your money **increased**. An anchor number that rewards negligence is worse than no number at all.

```
isPaid(c) = there is an active transaction with
              commitmentId == c.id
           && dayKey ∈ commitmentWindow

unpaidCommitments = Σ c.amount
  for c.active
   && dueOccurrence(c) ∈ commitmentWindow
   && !isPaid(c)
```

Because `isPaid` is a query, deleting a payment to trash automatically makes its commitment unpaid again, and restoring it makes it paid again. No synchronization code needs to be written, so no synchronization code can go wrong.

**Paying.** From the Commitment screen via the **Bayar** button, which creates a single transaction with `commitmentId` filled in and `intent = 'routine'` automatically. One write, one table — no cross-table transactions needed. The button is idempotent: when `isPaid(c)` is already true, the button changes to a "lunas" label and can no longer be pressed. No automatic detection from regular transactions — too prone to misguessing.

**Two commitment types.**

| `kind` | Fulfilled with | Effect |
|---|---|---|
| `bill` | `out` transaction | Money leaves the system |
| `saving` | `move` transaction to `reserve` wallet | Money moves to savings |

The `saving` type exists to resolve a behavioral defect found in the second review: without it, moving Rp 500.000 to savings **suddenly drops the daily allowance**, making the app feel like it punishes the exact behavior it should encourage. With saving modeled as a commitment, the money is already deducted upfront from the start of the cycle — moving it to `reserve` does not change the allowance at all, because the allowance was never counting it in the first place. Saving transforms from a surprise into a plan.

**Important consequence:** transactions with `commitmentId` are **excluded from discretionary spend**. They are not a reflection of habits; they are obligations already factored in upfront.

**Edge case.** A commitment with an `amount` exceeding `spendableBalance` makes `availableFunds` negative — handled as a minus condition (§4.4), not an error. A commitment created mid-cycle is immediately included if its due occurrence is still within the window. `dueDay` 29–31 in short months is clamped to the last day of the month, just like `cycleAnchorDay` (§4.2).

### 4.4 Daily allowance

Final formula, already double-counting proof:

```
spentToday         = Σ amount  for out, dayKey == today, commitmentId == null
allowanceBasis     = spendableBalance + spentToday
availableFunds     = allowanceBasis − unpaidCommitments − endBuffer
allowanceToday     = availableFunds > 0 ? floor(availableFunds / daysRemaining) : 0
remainingAllowance = allowanceToday − spentToday
```

**Why `allowanceBasis` adds back today's spend.** `spendableBalance` is already reduced by today's expenses. If `allowanceToday` were calculated directly from it and then `spentToday` subtracted again, the same expense would be penalized twice and the number would fluctuate wildly throughout the day. By adding it back, `allowanceToday` remains stable and only `remainingAllowance` goes down — just like a depleting envelope balance. The "wasteful today → tomorrow's allowance drops" effect still occurs, because tomorrow `spendableBalance` is already smaller while `daysRemaining` decreases by one.

**The limit of that stability, stated honestly.** The adding-back only neutralizes **discretionary spend**. It does not neutralize anything else, and indeed it should not:

| Mid-day event | `allowanceToday` | Correct? |
|---|---|---|
| Discretionary spend | unchanged | yes — core mechanism |
| Income received | **increases instantly** | yes — your money actually increased |
| Pay commitment | unchanged | yes — balance and obligation drop together |
| Move to `reserve` wallet | unchanged if via `saving` commitment (§4.3) | yes |
| Old history edited/deleted | changes | yes, but **must be explained** (§7.1) |
| `endBuffer` changed | changes | yes, but **must be previewed** (§7.4) |

The applicable claim is "stable against discretionary spend throughout the day", not "stable throughout the day". The second version of that claim is wrong, and the second review correctly caught it (§13.2, C-02).

**Changes not originating from today must have an explanation.** When `allowanceToday` changes because old history was edited, deleted, restored, or because settings were changed, the Record screen displays a one-time banner: *"Jatah berubah karena riwayat diubah"* or *"Jatah berubah karena buffer diubah"*. An anchor number that moves without a visible cause is an anchor number that ceases to be trusted.

**Verification with the case that broke the initial design:**

> Balance Rp 3.000.000 on day 5. Rent Rp 2.000.000 due on the 25th. Cycle ends on the 30th.

| Without commitments (initial design) | With commitments (final) |
|---|---|
| allowance = 3.000.000 / 26 = **Rp 115.384/day** | funds = 3.000.000 − 2.000.000 = 1.000.000 |
| User spends Rp 100k/day peacefully | allowance = 1.000.000 / 26 = **Rp 38.461/day** |
| On the 25th pay rent → balance Rp 0 | On the 25th pay rent → remaining ≈ Rp 200.000 |
| Allowance plummets to **Rp 0/day** for 5 days | allowance = 200.000 / 6 = **Rp 33.333/day** |
| **Anchor number lies 20 consecutive days** | No cliff. Consistent from the start. |

**Minus condition.** When `availableFunds ≤ 0`, `allowanceToday = 0` and the interface **does not display a negative number in the big slot**. What is displayed:

```
Rp 0
Kamu minus Rp 420.000 sampai 25 Agu
```

That giant negative number punishes without giving direction. An explicit sentence provides the magnitude and time limit.

**Exceeded condition.** When `remainingAllowance < 0`, the big slot displays `Rp 0` with a red line `Lewat Rp 12.500 hari ini`.

### 4.5 Runway

```
daysSinceStart      = daysBetween(today, settings.startedAt)             // 0 on the first day
dailySpend(d)       = Σ amount  for out, dayKey == d, commitmentId == null
N                   = min(28, daysSinceStart)
averageWindow       = [today − N, today − 1]                             // NOT including today
actualAverage       = N > 0 ? mean(dailySpend(d)) for d ∈ averageWindow : 0     // days without spend counted as 0
w                   = min(1, daysSinceStart / 14)
dailyAverage        = w × actualAverage + (1 − w) × seedDailySpend
dailyCommitmentCost = Σ(active commitments) / cycleLength
totalDailyCost      = dailyAverage + dailyCommitmentCost
runway              = totalDailyCost > 0 ? floor(spendableBalance / totalDailyCost) : null
```

The `N > 0` guard is not decorative: without it, `mean([])` produces `NaN`, and `0 × NaN` in JavaScript remains `NaN` — so a zero weight does **not** save the first day. This must be tested explicitly (§10.1).

**Today is intentionally excluded from the average window.** The day in progress is half-baked data. If included, at nine in the morning it contributes Rp 0 and drags the average down, making runway appear longer precisely when you have not spent anything yet — then shortening throughout the day. A runway that flickers throughout the day is a runway that is not trusted.

**No outlier trimming.** The initial design discarded the 2 most wasteful days to dampen a single large purchase. Review showed that this actually discarded rent, electricity, and fertilizer — the largest and most real expenses — making runway falsely optimistic (§13.1, M-03). Because commitments are now modeled separately and explicitly, the source of distortion is eliminated at the root. The formula becomes more honest **and** shorter.

**Cold start.** `seedDailySpend` is populated during onboarding ("Sehari kira-kira habis berapa?"). Its weight decays linearly over 14 days until it is purely real data. While `w < 1`, the interface marks the figure with the label `perkiraan`. This resolves the contradiction between D2 (discard all data) and metrics requiring 28 days of data (§13.1, CS-01), **without** rescinding the data-discard decision.

**When `totalDailyCost == 0`** (no spend yet, no commitments, zero seed): display `—`, not `Infinity`.

### 4.6 Impulse ratio

Primary dashboard metric.

```
period       = [cycleStart, today]                    // running cycle, not calendar month
impulseRatio = Σ(out, intent='impulse', discretionary, period)
             / Σ(out, discretionary, period)
```

The period is the **running cycle**, because that is the same range as the daily allowance — using a calendar month would cause two numbers on the same screen to measure different time spans. If the cycle has been running for less than 3 days, display the numerator as is with the note `<n> hari data` and hide the percentage; a ratio of two transactions is not information, it is noise.

Calculated **only on discretionary spend**. If commitment payments were included in the denominator, the ratio would falsely appear small — large rent would dilute the impulse figure and eliminate its signal.

Presented concretely, not as a bare percentage:

> **Impuls bulan ini Rp 420.000** — setara **9 hari runway**

Conversion to days (`impulseAmount / totalDailyCost`) is the core of its behavioral therapy: transforming an abstract number into lost life time.

**Emergency receives the exact same treatment.** This is important and deliberate. The `emergency` intent was added so truly unavoidable expenses would not contaminate the impulse ratio (§13.1, UX-02) — but precisely because it is free of guilt burden, it becomes a comfortable refuge for anything seeking justification. If `IMPULSIF` has consequences and `DARURAT` does not, every awkward expense will migrate there, and the metric this entire app was built to produce becomes empty.

Because of this, emergency spend is presented with an identical frame — *"Darurat bulan ini Rp 800.000 — setara 17 hari runway"* — and if emergency spend exceeds **20% of discretionary spend** in a single cycle, the Sadar screen raises a single non-judgmental question: *"Pengeluaran darurat siklus ini tinggi. Semuanya benar-benar darurat?"* Forcing reflection, not blocking input.

### 4.7 Supporting metrics

| Metric | Formula | Appears in |
|---|---|---|
| Week comparison | `(spend7DaysToday − average4Weeks) / average4Weeks` | Sadar, weekly recap |
| Tag breakdown | `Σ amount per tag`, top 8 + "lainnya" | Sadar |
| Intent distribution | `Σ amount per intent` | Sadar |
| Sparkline series | `dailySpend(d)` for 28 days + `allowanceToday` line | Sadar |
| Emergency burden | `Σ(intent='emergency', 90 days) / 3` per month | Sadar |

**Thin data guard.** Every metric above must have a "belum cukup data" path and must never display `NaN`, `Infinity`, or a percentage calculated from a zero denominator:

- Week comparison is hidden when `daysSinceStart < 7`. When `average4Weeks == 0`, display `belum cukup data`, not division by zero. When data is less than 4 full weeks, use the available weeks and note the number of weeks.
- Tag breakdown and intent distribution display an empty state when there are no outgoing transactions yet.
- Sparkline draws empty days as zero, rather than skipping them — gaps in the graph deceive the eyes.

---

## 5. Data Model

```ts
type Kind   = 'out' | 'in' | 'move'
type Intent = 'planned' | 'routine' | 'impulse' | 'emergency'

interface Transaction {
  id: string                   // uuid v4
  kind: Kind
  amount: number               // integer rupiah, > 0, always positive
  intent: Intent | null        // mandatory when kind==='out', otherwise null
  tag: string | null           // EXACTLY ONE tag or none at all — not an array
  note: string | null          // max 200 characters, hidden behind "tambah catatan"
  walletId: string             // source for out/move, target for in
  toWalletId: string | null    // mandatory when kind==='move', otherwise null
  commitmentId: string | null   // filled when this out pays a commitment
  at: number                   // epoch ms
  dayKey: string               // 'YYYY-MM-DD', derived, indexed
  createdAt: number
  updatedAt: number
  deletedAt: number | null     // soft delete
}

interface Wallet {
  id: string
  name: string
  kind: 'spendable' | 'reserve'
  initialBalance: number
  archived: boolean
  order: number
}

interface Commitment {
  id: string
  name: string
  amount: number
  kind: 'bill' | 'saving'      // 'saving' is fulfilled with move to reserve wallet
  dueDay: number               // 1..31, clamped to end of month if necessary
  walletId: string | null
  active: boolean
  // NO paidCycles. Paid status is derived from transactions (§4.3).
}

interface NotifSettings {
  allowanceExceeded: boolean   // when remainingAllowance < 0, foreground
  notRecorded: boolean         // 20:00 if today is empty
  dailySummary: boolean        // 21:00
  weeklyRecap: boolean         // Sunday 20:00
  dailyHour: number            // 0..23, default 21
  unrecordedHour: number       // 0..23, default 20
  recapDay: number             // 0=Sunday, default 0
  recapHour: number            // 0..23, default 20
}

interface Settings {
  cycleMode: 'monthly-day' | 'manual' | 'rolling'
  cycleAnchorDay: number
  cycleManualEnd: string | null
  endBuffer: number
  dayStartHour: number         // 0..6
  seedDailySpend: number
  startedAt: string            // 'YYYY-MM-DD', for cold-start ramp
  notif: NotifSettings
  bigDeleteThreshold: number   // default 1_000_000
  schemaVersion: number
}
```

### 5.1 Integrity rules

Validated at the repository layer, not just in the UI — the UI can be bypassed, the repository cannot.

| Rule | Enforcement |
|---|---|
| `amount > 0` and integer | Reject write |
| `intent != null` ⟺ `kind === 'out'` | Reject write |
| `toWalletId != null` ⟺ `kind === 'move'` | Reject write |
| `walletId !== toWalletId` | Reject write |
| `commitmentId != null` ⟹ `kind === 'out'`, or `kind === 'move'` with target wallet `reserve` | Reject write |
| **`at` must not exceed the end of today** | Reject write |
| Wallets still referenced by active transactions cannot be deleted | Reject, offer archive |
| **`spendable` wallets with non-zero balance cannot be archived** | Reject, require moving funds first |
| `note` maximum 200 characters | Truncate in UI, reject in repository |
| `dayKey` always derived from `at` + `dayStartHour` | Recalculated on write |

**Why future dates are forbidden.** `walletBalance` (§4.1) does not filter dates, while `spentToday` (§4.4) only sums `dayKey` for today. Transactions dated tomorrow therefore reduce the balance **without** being added back by the add-back mechanism, causing today's allowance to shrink silently and then get counted once more tomorrow. Forbidding future dates at the repository layer eliminates this entire class of bugs with a single rule, far cheaper than patching the formula.

**Why archiving a wallet with a balance is blocked.** This is actually a flaw born from the safety rule in the previous row: wallets still referenced cannot be deleted, and their replacement is archiving — even though archiving excludes that wallet from `spendableBalance`, so that "safe" path is precisely what causes money to disappear from the allowance basis without explanation. Requiring funds to be moved first makes its balance change visible as an actual `move` transaction.

### 5.1.1 Editing rules

§7.3 allows touching entries to edit them. What can be changed is restricted, because every column has consequences for formulas:

| Column | Editable? | Reason |
|---|---|---|
| `amount` | yes | Typo correction, most common case |
| `intent` | yes, only for `kind === 'out'` | Tap correction — this is what makes §7.1 safe |
| `tag`, `note` | yes | No effect on formulas |
| `walletId`, `toWalletId` | yes | Re-validated against §5.1 rules |
| `at` / `dayKey` | yes, but not to the future | Changes which day is burdened |
| `kind` | **no** | Changing `out` to `in` reverses the money direction and invalidates all integrity rules at once. Delete and recreate instead. |
| `commitmentId` | **no** | Paid status is derived from it (§4.3); only the Pay flow may set it |

Every edit re-runs all §5.1 validations and updates `updatedAt`. Editing a past day's entry changes today's allowance — that is mathematically correct, and must be explained via banner (§4.4).

The last rule is important: changing `dayStartHour` **must** trigger a recalculation of `dayKey` across all rows. This is a data migration, treated as a migration (§9.3).

### 5.2 Dexie Schema

```js
db.version(1).stores({
  transactions: 'id, dayKey, kind, intent, walletId, toWalletId, commitmentId, deletedAt, at',
  wallets:      'id, order, archived',
  commitments:  'id, active, dueDay',
  settings:     'key'
})
```

`toWalletId` **must be indexed.** Balance formulas (§4.1) contain `Σ(move → w)`, which means searching for transactions with `toWalletId == w`. Without an index, every balance calculation per wallet scans the entire table. The scale is small, but balance is recalculated on every anchor number render — this is the hottest path in the app.

Money is stored as **integer rupiah in `number`**. Rupiah has no fractional units in daily practice, and `Number.MAX_SAFE_INTEGER` ≈ 9 quadrillion — there is no precision risk at personal finance scale. No need for BigInt, no need for decimals.

---

## 6. Architecture

```
src/
  lib/
    domain/            ← pure functions. MUST NOT import db/svelte/capacitor.
      money.ts           formatRupiah, parseRupiah
      day.ts             dayKeyOf, daysBetween, dayRange
      cycle.ts           cycleFor(date, settings) → {start, end, length, daysRemaining}
      commitment.ts      commitmentWindow, isPaid, unpaidCommitments
      allowance.ts       computeAllowance(input) → {allowanceToday, spentToday, remainingAllowance, status}
      runway.ts          computeRunway(input) → {days, estimated} | null
      insight.ts         impulseRatio, tagBreakdown, weekComparison, sparklineSeries
      types.ts
    db/
      schema.ts
      repo/              transactions, wallets, commitments, settings
      backup.ts          serialization, parsing, preview
    stores/            ← Svelte stores: connecting db to domain
    notify/
      Notifier.ts        interface
      capacitor.ts       native implementation
      mock.ts            browser/test implementation
    ui/                ← components
  routes/
    +page.svelte         Record (home)
    sadar/+page.svelte
    riwayat/+page.svelte
    atur/+page.svelte
    mulai/+page.svelte   onboarding
```

### 6.1 Why `domain/` is completely isolated

`domain/` receives plain data as input (number arrays and plain objects) and returns plain data as results. It does not know Dexie exists, does not know Svelte exists, does not know Android exists.

Its consequences:

1. **All numerical truth can be tested in milliseconds** with vitest, without emulators, without building APKs, without CI. This is what saved the development cycle on Termux.
2. Number bugs have only one place to hide. If daily allowance is wrong, the cause is definitely in `domain/`, not in the UI or query.
3. Mandatory lint rule: `domain/` must not have any `import` other than from fellow `domain/` modules. Enforced with `eslint-plugin-boundaries` or a single test scanning imports.

This boundary is not architectural decoration. It is the sole reason a financial application can be developed from a phone without heavy toolchains.

---

## 7. Screens

### 7.1 Record (Home)

```
┌────────────────────────────────────┐
│ Rp 87.400                          │  ← remaining allowance today (K1)
│ dari Rp 120.000 · runway 19 hari   │  ← second layer
├────────────────────────────────────┤
│  [ KELUAR ]  masuk   pindah        │  ← mode, default KELUAR
├────────────────────────────────────┤
│            25.000                  │
│  7 8 9                             │
│  4 5 6      ⌫                      │  ← keypad, 000 key
│  1 2 3                             │
│  0 000                             │
├────────────────────────────────────┤
│  #makan #bensin #kopi  + tag       │  ← chips learned from history
│  CASH ▾                            │
├────────────────────────────────────┤
│  TERENCANA   │   RUTIN             │  ← 2×2 grid, THIS is the save button
│  IMPULSIF    │   DARURAT           │
├────────────────────────────────────┤
│  ↩ 25.000 #kopi impulsif   [batal] │  ← 5-second undo
└────────────────────────────────────┘
```

**Core gesture: the intent button is the save button.** Type amount → tap `IMPULSIF` → saved. Intent becomes mandatory with **zero extra tap cost**, and there is no default value that can be lazily accepted. This is what prevents K1 (fast input) and K2 (mandatory intent) from nullifying each other.

**The action row is dynamic** — this closes a gap identified during review (§13.1, UX-01):

| Mode | Action row |
|---|---|
| `KELUAR` (default) | 2×2 grid of four intents |
| `masuk` | One full-width button `SIMPAN PEMASUKAN` |
| `pindah` | Destination wallet selector + `PINDAHKAN` |

A 2×2 grid was chosen over four buttons in a single row: the touch targets are much larger, which actually **reduces** mis-taps compared to the three narrow buttons in the initial design.

**Undo.** Every save displays a 5-second snackbar with a cancel button. The last entry also remains displayed and can be tapped to edit. This addresses the objection that instant-save is costly when mis-tapped (§13.1, UX-03): correction requires one tap, not four.

**Tag chips** are drawn from the 5 most frequently used tags over the last 30 days for the currently active mode. Chips are **single-select**, not stackable: tapping a second chip replaces the first. A single transaction has exactly one tag or none at all (§5). This keeps the `tag breakdown` free from double-counting ambiguity and keeps input to a single tap. Tags are optional and never block saving.

**Notes** are hidden behind a small `+ catatan` link below the tag row. It never appears by default, because free-text fields are the primary enemy of fast input. Maximum 200 characters, searchable via filters in History.

#### Combating habituation

The greatest threat to this app is not miscalculation, but **eyes that stop seeing**. Static numbers in a fixed position turn into background noise within two to three weeks, just like a wall clock. If that happens, this app degrades back into a passive recorder — precisely what must be avoided (§13.2, P-01).

Three mandatory, non-optional mechanisms:

1. **Numbers change form, not just digits.** Visual styling follows the percentage of allowance spent: calm (0–60%), watchful (60–90%), urgent (90–100%), exceeded (>100%). What changes are colors, font weights, and backgrounds — structural changes hold visual attention far longer than digit changes.

2. **Intervention at the moment of decision.** As soon as the amount being typed would exceed the remaining allowance, the intent button area displays a warning line **before** saving: *"Ini akan melewati jatah Rp 12.500."* This is the only mechanism in the app that operates while a decision can still be undone — the rest operate after money has already left. It does not block; it merely makes the choice conscious.

3. **Future consequences are stated, not left to self-inference.** When the allowance is exceeded, display the consequence directly: *"Jatah besok turun jadi Rp 33.100."* Leaving that conclusion to the user means no one will draw it.

**The constraint binding all of this:** no judgmental tone, no red color for intents, no streaks or badges. The user is both the labeler and the entity being judged — once a label feels punitive, it will cease to be used honestly, and data quality dies (§13.2, P-02). The button order in the 2×2 grid must not imply moral ranking.

### 7.2 Sadar (Dashboard)

One tap from the home screen. Contains, ordered from most awareness-raising:

1. **Impulse ratio** — CSS ring/bar + concrete statement: *"Impuls bulan ini Rp 420.000 — setara 9 hari runway."*
2. **28-day sparkline** — Custom SVG (~30 lines), daily spend bars with allowance horizontal line. No libraries.
3. **Weekly comparison** — *"Minggu ini 23% lebih boros dari rata-rata 4 minggu."*
4. **Intent distribution** — four stacked bars.
5. **Tag breakdown** — top 8.
6. **Commitments** — list of bills and savings targets in this cycle, with a Pay button and paid marker.
7. **Intent audit** — once per cycle, display top 10 highest-value `RUTIN` entries and ask: *"Mana yang sebenarnya impulsif?"* Each row can be moved to `IMPULSIF` with a single tap.

The last item is the sole defense against the most likely form of data decay. Because the intent button doubles as the save button, a rushed user will select the most emotionally cheap label, and `RUTIN` is the perfect junk drawer: guilt-free, drama-free, and free of planning obligations. Without an audit, the impulse ratio slowly trends toward zero while actual behavior remains completely unchanged (§13.2, P-02). This audit is cheap, performed when not rushed, and corrects precisely in the direction of the known bias.

All charts use SVG/CSS without dependencies (D10). Charting libraries were dropped after review showed CSS was sufficient for all visual forms above except the sparkline, and that sparkline takes 30 lines.

### 7.3 History

List grouped per day with daily subtotals. Filters: date range, intent, tag, wallet, and note content. Tap to edit according to editing rules in §5.1.1; swipe does **not** delete (the correct v1 legacy rule: swipe-to-delete is forbidden in financial applications).

The **Trash** tab contains deleted entries with restore and permanent delete buttons. Retention is unlimited; there is no automatic cleanup — automatic cleanup in financial applications is a data loss pathway.

### 7.4 Settings

Cycle (mode, anchor date, `endBuffer`), wallets (add/archive/reorder, mark `reserve`), commitments, `dayStartHour`, notifications (four separate toggles), `bigDeleteThreshold`, backup & export/import, app version.

**Every setting that shifts anchor numbers must display its consequences before saving**, not after:

| Change | Mandatory preview |
|---|---|
| `endBuffer` | "Jatah harianmu akan turun dari Rp 60.000 ke Rp 30.000." |
| Cycle mode or anchor date | New cycle end date + its new daily allowance |
| Marking a wallet as `reserve` | "Rp X keluar dari saldo belanja. Jatah turun ke Rp Y." |
| Archiving a `spendable` wallet | Rejected if balance is non-zero (§5.1); prompt to transfer first |
| `dayStartHour` | Warning that this recalculates all `dayKey` entries (§9.3) |

A setting that silently halves anchor numbers will be perceived as a bug, and trust in those numbers will not recover afterward.

**sesuaikan saldo.** All mathematics in this document rests upon an accurate `spendableBalance`, and a single unrecorded transaction causes every number to drift silently. Therefore, each wallet has a "sesuaikan saldo" action: the user inputs their actual balance, and the app creates a **visible correction transaction** for the difference (`in` or `out`, `intent = 'routine'`, tag `#koreksi`).

The app never overwrites balances silently. Rewriting numbers without a trace ruins the entire history that forms the basis for runway and daily averages — and hides untracked money from the user, which is precisely the information they most need to be aware of.

### 7.5 Start (Onboarding)

Three questions, one screen per question, all editable later in Settings:

1. **"Uangmu sekarang berapa?"** → creates `CASH` wallet with `initialBalance`
2. **"Sehari kira-kira habis berapa?"** → `seedDailySpend`
3. **"Gajian tanggal berapa?"** — three paths, because income does not always take the same form:
   - Fixed date each month → `monthly-day` + `cycleAnchorDay`
   - "Aku tahu tanggal masuk berikutnya, tapi tidak tetap" → `manual` + `cycleManualEnd`
   - "Tidak tentu" → `rolling`

Then a fourth screen requesting notification permissions and offering a direct link to battery optimization settings (§8.5).

This onboarding is what enables anchor numbers and runway to function from **day one** even with an empty database (D9).

---

## 8. Notifications

### 8.1 Catalog

| Trigger | Content | Reliability |
|---|---|---|
| Allowance exceeded | "Jatah hari ini lewat Rp 12.500. Jatah besok turun jadi Rp 33.100." | **High** — foreground |
| 20:00, no records yet | "Belum ada catatan hari ini." | Medium |
| 21:00 daily | "Hari ini habis Rp 87.000. Jatah besok Rp 120.000." | Medium |
| Sunday 20:00 | "Minggu ini 23% lebih boros. Impuls Rp 210.000 = 4 hari runway." | Medium |

All four can be turned off individually.

### 8.2 Technical constraints dictating design

Capacitor local notifications are **scheduled with fixed text**. No JavaScript runs when a notification triggers. This means "spent Rp X today" cannot be calculated at trigger time.

**Solution: rescheduling on every write.** Every time a transaction is saved (debounced by 5 seconds), the 21:00 summary notification for that day is rescheduled with the latest figures. Because recording implies opening the app, the numbers are almost always up to date. Its limitation is honest: if a user spends at 20:55 and records it at 22:00, the 21:00 summary is already stale. This is acceptable; the alternative is a background task plugin that adds significant code and is more fragile under Doze.

The **"belum ada catatan"** notification is handled cleanly in reverse: scheduled when the day starts, then **cancelled** as soon as the first transaction of that day occurs.

Weekly notifications are computed and scheduled every time the app is opened on Saturday or Sunday.

### 8.3 `Notifier` Interface

```ts
interface Notifier {
  requestPermission(): Promise<boolean>
  schedule(id: number, at: Date, title: string, body: string): Promise<void>
  cancel(id: number): Promise<void>
  cancelAll(): Promise<void>
}
```

Two implementations: `capacitor.ts` (native) and `mock.ts` (browser and testing, logging to console). As a result, **the entire scheduling logic can be developed and tested in the Termux browser** — only actual delivery requires a device build. This is a direct mitigation against stack weaknesses identified during review (§13.1, P-03).

### 8.4 Notifications are not the source of truth

The mandatory consequence of K3 to enforce: **every notification has an in-app counterpart.** The home screen displays a "today" banner containing the exact sentence that will be / has been sent via notification. If an OEM kills scheduled alarms, the awareness loop remains unbroken — it simply becomes pull instead of push.

### 8.5 Surviving Doze and OEMs

- Declare `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`, schedule as exact alarms.
- During onboarding, present a battery optimization exemption request with a direct link to system settings.
- Reschedule all notifications for the next 7 days every time the app is opened, ensuring unilateral cancellations by the OS recover automatically.
- The Settings screen displays diagnostics: when the last notification was scheduled, and whether battery exemption is active.

Xiaomi, Oppo, Vivo, and Samsung can still kill them. §8.4 is a safety net, not an optional extra.

---

## 9. Data Security

Financial applications have one unforgivable failure mode: losing records.

### 9.1 Storage durability

IndexedDB inside Capacitor's WebView is app-private and far more durable than standard browser storage. Even so, defense is cheap, so there is no reason to debate it:

1. `navigator.storage.persist()` is called on first launch.
2. **Automatic backups**: 30 seconds after the last write (debounced), write a full JSON snapshot to `Directory.Data/backups/latest.json` via Capacitor Filesystem.
3. **Daily rotation**: store 7 dated snapshots.
4. **Weekly copies** to `Directory.Documents/MalasFinance/` so they are visible to the user and can be copied externally. This is *best-effort* — subject to Android scoped storage.
5. The Settings screen displays **when the last backup succeeded**. If longer than 3 days, display a warning.

**Backup file format.** The envelope must carry its own schema version. Without an in-file version marker, cross-version import is impossible to perform safely — the import code has no way of knowing what structure it is reading, or even whether default values are required.

```json
{
  "format": "malasfinance-backup",
  "schemaVersion": 1,
  "appVersion": "2.0.0",
  "exportedAt": 1785000000000,
  "settings":    { },
  "wallets":     [ ],
  "commitments": [ ],
  "transactions":[ ]
}
```

Import reads `schemaVersion` first, runs forward migrations if necessary, and only then writes. If `schemaVersion` is higher than what the app recognizes → reject with a clear message ("cadangan ini dari versi aplikasi yang lebih baru"), do **not** attempt partial reading. Deleted transactions are included along with their `deletedAt` timestamps, as this is a full backup, not a report export.

Automatic backups belong in **Phase 1**, not the final phase. Launching data entry before backups exist is an ordering mistake identified during review (§13.1, S-01).

### 9.2 Import always previews first

Inherited from `next-spec.md` ITEM-3 because it is correct. Flow: select file → parse → **preview** → confirm.

The preview displays: entry count, date range, total in, total out, new wallets to be created, and new commitments to be created.

Two modes:

| Mode | Behavior | Confirmation |
|---|---|---|
| **Merge** | All entries receive a new `id`; no dedup | Button `<n> ENTRI — IMPOR` |
| **Full replace** | Database is cleared then populated | **Type `GANTI`** to confirm |

Corrupted file, invalid JSON, or zero valid entries → *"Tidak ada entri yang bisa dibaca — berkas mungkin rusak"*, not silent success.

### 9.3 Migration

- Dexie schema changes **must** have explicit upgrade functions.
- There is no equivalent of `fallbackToDestructiveMigration()`. If an upgrade fails, the app refuses to run and offers an export, **not** deletion.
- Changing `dayStartHour` is treated as a migration: recalculate `dayKey` for all rows within a single transaction, with an automatic backup triggered first.

### 9.4 Deletion

- Delete → trash (`deletedAt`), always recoverable.
- No swipe-to-delete.
- Permanently deleting an entry with `amount ≥ bigDeleteThreshold` (default Rp 1.000.000) requires **typed confirmation**.
- Emptying the entire trash requires typed confirmation regardless of the amount.
- Wallets still referenced by active transactions cannot be deleted — only archived.

---

## 10. Testing

### 10.1 Domain (majority, vitest, no emulator)

List of cases that **must** exist, because each represents a way this application can lie:

**`cycle.ts`**
- `cycleAnchorDay = 31` in February (28 and 29 days)
- `cycleAnchorDay = 30` in February
- Last day of cycle → `daysRemaining === 1`, never 0
- `manual` mode whose date has passed → `cycle-expired`, falls back to `rolling` behavior
- Year transition

**`allowance.ts`**
- Today's spend is not double-counted: `allowanceToday` is stable against discretionary spend
- Mid-day income **increases** `allowanceToday` immediately (intentional behavior, locked via test)
- Overspending today → tomorrow's `allowanceToday` decreases
- Unpaid commitments reduce allowance from the first day of the cycle
- Commitments paid mid-cycle create neither spikes nor cliffs
- `saving` commitment paid via `move` to `reserve` **does not** change allowance
- `availableFunds ≤ 0` → allowance 0 and `minus` status, not a negative number
- `endBuffer` larger than balance
- `reserve` wallet is not part of `spendableBalance`
- Zero spendable wallets
- Future-dated transactions rejected (§5.1) so they never reach this formula

**`commitment.ts`**
- Overdue but unpaid commitments **still** count — forgetting to pay must not increase allowance
- Paying a commitment marks it paid; deleting payment to trash makes it unpaid **again**
- Restoring payment from trash marks it paid again
- Pay button is idempotent: an already paid commitment cannot be paid twice
- Window `[startOfMonth, cycleEnd]` behaves correctly across all three cycle modes, including `rolling`
- `dueDay = 31` in short months is clamped to the last day
- Commitment created mid-cycle counts immediately if its due date is still within the window
- `amount` exceeds balance → minus condition, not an error

**`runway.ts`**
- Zero days of data → pure seed, marked `"perkiraan"`, and the result is **not `NaN`**
- Day 7 → mix of seed and actual
- Days 14 and 15 → zero-weighted seed
- Zero spend and zero commitments → `null`, not `Infinity`
- Days without spending counted as 0, not skipped
- **Today is excluded from the average window** — runway does not change when today's transaction is saved
- Commitment payments do not pollute discretionary average

**`day.ts`**
- `daysBetween(x, x) === 0` — locked via test because every cycle formula depends on it
- `dayStartHour = 3`: transaction at 01:30 falls into yesterday's `dayKey`
- Month and year transition
- Consistency when device changes time zones

**`insight.ts`**
- Impulse ratio with zero denominator
- Impulse ratio excludes commitment payments from the denominator
- Impulse ratio uses current cycle range, not calendar month
- Week comparison when data is less than 4 weeks
- Week comparison when `average4Weeks == 0` → "belum cukup data", not division by zero
- Not a single metric can return `NaN` or `Infinity` for an empty database

### 10.2 Repository (`fake-indexeddb`)

Every integrity rule in §5.1 has a test proving write rejection — including future-date rejection and rejecting the archiving of a `spendable` wallet with a balance. Plus: soft-delete/restore cycle, deletion of a wallet that is still referenced, every editing rule in §5.1.1 (specifically `kind` and `commitmentId` which must not change), and the idempotency of the Pay button.

### 10.3 Backup and import

Serialization round-trip, corrupted JSON, empty file, duplicate `id`, unknown wallet, preview figures match import results. Plus: files without `schemaVersion` rejected, `schemaVersion` higher than known rejected with a clear message, and deleted transactions included complete with their `deletedAt`.

### 10.4 What is not tested

There are no E2E tests or screenshots. Single-user app, and maintenance costs outweigh the benefits. UI verification is done manually in the browser. This is a conscious decision, not negligence.

---

## 11. Build and Release

### 11.1 Development cycle

```
npm run dev     → Vite server, opened in phone browser. Native features use mocks.
npm run test    → vitest, milliseconds
npm run build   → static assets
npx cap sync android && ./gradlew assembleRelease   → CI only
```

**Boundaries that must be stated explicitly:** native features — notifications, Filesystem — **cannot be tested in the browser**. Phase 3 loses the instant dev loop and falls back to relying on device builds. The `Notifier` interface (§8.3) minimizes the drawback by keeping scheduling logic testable in the browser, but actual delivery still requires an APK.

### 11.2 Termux

Real obstacles that need to be worked around once at the start:

- **Phantom process killer** (Android 12+) kills Termux child processes. Disable via `settings put global settings_enable_monitor_phantom_procs false` (requires adb/Shizuku), or accept occasional restarts.
- **`termux-wake-lock`** before long sessions.
- **File watching** via inotify can miss events on Android storage. If this happens, enable `server.watch.usePolling` in `vite.config.ts` — with the consequence of higher battery usage.

### 11.3 CI and release

- Trigger: changes affecting the APK only, same as v1.
- Steps: `npm ci` → `npm test` → `npm run build` → `cap sync` → `assembleRelease` → sign → release.
- **Keystore and passwords must originate from GitHub Secrets.** The v2 repo must not contain `.keystore`, `.base64`, or passwords in any form. This is technical debt from v1 and must not be inherited.
- Tag `v<version>-b<build>`, APK `MalasFinance-v<version>-b<build>.apk`, release notes containing commit SHA and changelog since previous tag.
- **Single-source version** from `package.json`, injected via Vite `define`, displayed on the Settings screen. No handwritten version strings anywhere — this eliminates v1's chronic issue (three-way drift between build.gradle, README, and UI).

---

## 12. Implementation Phases

| Phase | Contents | Complete when |
|---|---|---|
| **1 — Foundation** | Data model, Dexie, repository + integrity rules (§5.1, §5.1.1), `domain/` complete with tests, onboarding, Record screen, anchor numbers, anti-habituation mechanisms (§7.1), `bill` + `saving` commitments, "sesuaikan saldo", trash, **automatic backup** | Can log a full day and numbers are correct; data survives uninstall-reinstall via backup |
| **2 — Sadar** | Dashboard, SVG sparkline, impulse ratio, tag breakdown, week comparison, intent audit, History screen with filters | All §4.7 metrics displayed and match manual calculation |
| **3 — Voice** | `Notifier`, scheduling, rescheduling on write, in-app banner, battery exception request | Four notifications delivered on real device; disabling notifications breaks nothing |
| **4 — Release** | Full export/import with preview, Markdown export, APK pipeline, GitHub Secrets | Signed APK published from CI; round-trip import produces identical data |

Automatic backup is deliberately placed in Phase 1, not Phase 4.

---

## 13. Adversarial Review and Resolutions

This design underwent **two rounds** of adversarial review with different models before being frozen. Round 1 attacked the initial design; Round 2 attacked the revised document and was forbidden from repeating Round 1 findings.

### 13.1 Round 1 — `gemini-3.6-flash-high`

Thirteen findings; twelve accepted in full or in part, one rejected.

| ID | Finding | Resolution |
|---|---|---|
| **M-01** | Division by zero on the last day of cycle | Clamping `max(1, daysRemaining)` (§4.2); minus condition specified explicitly (§4.4) |
| **M-02** | Daily allowance ignores unpaid fixed bills — **anchor number lies every day** | `Commitment` entity added; `unpaidCommitments` subtracted from available funds (§4.3, §4.4) |
| **M-03** | Trimming the 2 highest spend days actually hides rent and electricity | Trimming completely removed; runway now calculated on discretionary spend with explicit commitments (§4.5) |
| **P-01** | IndexedDB eviction by Android | Claim about OEMs ignoring `persist()` unverified and doubtful, but defense is cheap: automatic backup moved up to Phase 1 (§9.1) |
| **UX-01** | Intent buttons as save buttons provide no path for income and wallet moves | Action row made dynamic per mode (§7.1) |
| **P-02** | Doze and OEMs kill scheduled notifications | Accepted for scheduled ones; threshold alerts run in foreground and remain reliable. Principle §8.4 added: every notification has an in-app counterpart |
| **CS-01** | Discarding all data while metrics need 28 days of data | Seed via onboarding with 14-day weight decay (§4.5, §7.5). Data-discard decision stands |
| **UX-02** | Taxonomy has no place for emergency expenses; forcing them to be impulsive ruins metrics and causes false guilt | Fourth intent `emergency` added; layout becomes 2×2 grid (§7.1) |
| **P-03** | Termux: phantom process killer, inotify, and native features cannot be tested in browser | Acknowledged openly (§11.1, §11.2); `Notifier` interface minimizes impact (§8.3) |
| **UX-03** | Instant-save without undo is costly on mis-taps | 5-second undo snackbar + last entry tappable; 2×2 grid enlarges touch targets (§7.1) |
| **S-01** | Backup placed in Phase 4 while input launches in Phase 1 | Automatic backup moved to Phase 1 (§9.1, §12) |
| **YAGNI** | uPlot charting library is overkill | **Accepted** — struck out; manual SVG/CSS (§7.2, D10) |
| **YAGNI** | Multi-wallet with `move` called "schema complexity without benefit" | **Rejected.** `move` is required for correct per-wallet balance, and separating `reserve` wallets is precisely what keeps `spendableBalance` from counting savings. Without it the anchor number breaks. |

### 13.2 Round 2 — `claude-opus-4-6-thinking`

Twenty-four findings, zero repetitions from Round 1. All accepted; three resolved in a **different and stronger** way than proposed.

> The numbering for both rounds is independent and **collides**: `P-01` in §13.1 means IndexedDB eviction, while `P-01` in §13.2 means habituation. Every reference in this document therefore always specifies its round number.

**A single structural change kills three findings at once.** C-01 (double-write without atomicity), H-01 (no back-sync when payment is deleted), and H-10 (`cycleKey` impossible to define for `manual` and `rolling` modes) all stemmed from one decision: storing paid status in `paidCycles`. Deriving it from transactions (§4.3) removes all three at once, producing less code — not more.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| **C-01** | Critical | Pay button writes to two tables without atomicity; mid-failure → commitment deducted twice | `paidCycles` removed; paid status derived from transactions (§4.3). Single write, no broken windows. |
| **H-01** | Critical | Deleting payment to trash does not restore unpaid status | Vanishes automatically via the same change — `isPaid` is a query over active transactions (§4.3) |
| **H-10** | High | `cycleKey` used but never defined; impossible for `manual` and `rolling` | No more `cycleKey`. Commitment window becomes a single rule `[startOfMonth, cycleEnd]` (§4.3) |
| **H-02** | High | Overdue unpaid bills disappear from calculations — forgetting to pay actually **increases** allowance | Window lower bound changed from `today` to `startOfMonth` (§4.3) |
| **C-02** | High | Claim "allowance stable throughout the day" false — mid-day income changes it | Claim corrected to "stable against discretionary spend", with an explicit table of which events change allowance and which do not (§4.4) |
| **C-03** | High | Moving to `reserve` reduces allowance — app punishes saving | **Different approach:** saving modeled as a commitment `kind: 'saving'` so it is deducted upfront. Moving money thus does not change allowance at all. Zero new concepts. (§4.3) |
| **C-04** | High | Editing old history shifts today's allowance without explanation | One-time banner on Record screen (§4.4) |
| **C-05** | Medium | Future-dated transactions erode allowance without being restored | Future dates rejected at repository layer — one rule kills an entire bug class (§5.1) |
| **C-06** | Medium | Archiving wallet silently reduces allowance | **Different approach:** not merely a warning dialog — archiving a `spendable` wallet with a balance is **rejected**, funds must be moved first (§5.1) |
| **C-07** | Medium | Changing `endBuffer` silently reduces allowance | Preview required before save for all settings that shift allowance (§7.4) |
| **P-01** | High | Static numbers become wallpaper within ~3 weeks | Three anti-habituation mechanisms, including intervention at the decision second before money goes out (§7.1) |
| **P-02** | Medium | Mandatory intent pushes dishonest labeling toward `RUTIN` | Intent audit once per cycle + prohibition of judgmental tone on labels (§7.1, §7.2) |
| **P-03** | Medium | `DARURAT` becomes a guilt-free exit door | Same exact "equivalent to X days of runway" framing + reflection question if emergency > 20% (§4.6) |
| **U-01** | High | `daysBetween` used everywhere but never defined | Formally defined, with consequences detailed and locked via test (§4.1, §10.1) |
| **U-02** | Medium | "Last N days" ambiguous — includes today or not? | Today explicitly excluded; rationale explained (§4.5) |
| **U-03** | Medium | Type `NotifSettings` dangling | Defined (§5) |
| **U-04** | Medium | Data model says one tag, wireframe implies multiple | Decided exactly one; chips become single-select (§5, §7.1) |
| **U-05** | Medium | Transaction editing rules completely absent | Subsection §5.1.1 added |
| **U-06** | Low | `note` field exists in model but absent in UI | Specified: hidden behind link, max 200 characters, searchable (§7.1) |
| **U-07** | Medium | Backup file without schema version → cross-version import impossible | Versioned backup envelope defined (§9.1) |
| **U-08** | Medium | `toWalletId` unindexed despite use in every balance calculation | Added to Dexie index (§5.2) |
| **U-09** | Low | `impulseRatio` period never specified | Current cycle, with thin-data guard (§4.6) |
| **U-10** | Low | Week comparison can divide by zero | Thin-data guard for all metrics (§4.7) |
| **U-11** | Low | Onboarding has no path to `manual` mode | Third question becomes three paths (§7.5) |

---

## 14. Out of Scope

Consciously rejected. Adding any of these requires an explicit new rationale, not merely "while we're at it".

Multi-currency · multi-user · sync/cloud · budget envelopes · receipt photos · OCR · automatic recurring transactions (commitments already cover actual needs) · debt-credit tracking · chart libraries · translation (Indonesian only) · iOS · home screen widget · bank statement import.

---

## 15. Known Risks

Recorded so as not to be a surprise, not to be debated again.

| Risk | Impact | Stance |
|---|---|---|
| Scheduled notifications killed by OEM | K3 weakened | Accepted; §8.4 is the safety net |
| Native features cannot be tested in browser | Phase 3 loses instant dev loop | Accepted; price of D3 |
| Notification content can go stale | Daily summary occasionally off | Accepted; alternative is more fragile |
| Cold-start seed is only a guess | First 14 days runway imprecise | Accepted; marked `"perkiraan"` in UI |
| Termux killed by phantom process killer | Dev occasionally interrupted | Workaround available (§11.2) |
| IndexedDB durability not fully certain | Data loss | Mitigated in layers (§9.1), not eliminated |
| Four intents feel like too many in use | Input slows down | Monitor; taxonomy can be collapsed without migration since `intent` is just a string |
| **Habituation: anchor number stops being looked at** | App quietly reverts to a tracker — total failure against K1 | Mitigated (§7.1) but **not** eliminated. This is an existential risk of this application, not a technical risk. If after two months of use the impulse ratio does not move at all, it is the anti-habituation mechanism that failed, not the user. |
| **Dishonest labeling toward `RUTIN`** | Impulse ratio trends toward zero while behavior remains unchanged | Intent audit per cycle (§7.2) corrects precisely in the direction of bias, but depends on honesty when not in a rush |
| Entire math relies on correct `spendableBalance` | One unrecorded wallet → all numbers wrong | No automatic bank reconciliation. Settings screen needs "sesuaikan saldo" path creating explicit correction transactions, not quietly overwriting balance. |

---

## 16. Definition of Done

Version 2.0.0 is ready for release when:

1. Logging expenses takes a **maximum of three taps** from app launch (default mode, no tags).
2. Remaining daily allowance is visible **without scrolling** when app opens.
3. Every test case in §10.1 passes.
4. Uninstalling then reinstalling, followed by importing the automatic backup, produces **identical** data.
5. All four notifications delivered on a real device with battery optimization exception active.
6. Not a single secret inside the repository.
7. The version displayed on the Settings screen matches `package.json` without manual editing.
8. Daily allowance and runway numbers match manual calculation on paper for one full cycle of real data.

The eighth criterion is the most important. The rest can be patched; lying numbers cannot.
