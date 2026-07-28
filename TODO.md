# TODO

`spec.md` says where this is going. This file says where it actually is.

Kept deliberately as one file: the phase plan already lives in spec §12, and a
second document restating it would only drift out of sync with the first.

Last updated: 2026-07-29

## Pick up here

Phase 3 (Voice/notifications) is built — see its section below for exactly
what shipped, what was deliberately narrowed, and what still needs a real
device. Nothing blocking is left in Phase 1 or Phase 3. Next up: Phase 2 (the
Sadar dashboard).

Balance adjustment (was #1 here) is done — each wallet row on the Komitmen
screen has a "sesuaikan saldo" action; entering the actual balance previews
the difference and, on save, records it as a visible `#koreksi` transaction
(`in` or `out`; `intent = 'routine'` for `out`, `intent = null` for `in` since
§5.1 requires intent iff `out`) rather than overwriting anything silently
(spec §7.4). Verified live in the browser: both directions on the same
wallet (Rp 500.000 → 450.000 → 600.000 → 700.000), correct preview text
("keluar"/"masuk") before each save, correct running balance after each,
both transactions showing in Riwayat with the right sign, tag, and intent,
no console errors.

`manual` cycle mode in onboarding (was #2 here) is done — the third onboarding
question now offers all three paths from spec §7.5, including "tahu tanggal
masuk berikutnya, tapi tidak tetap" with a date picker clamped to today or
later (bound to the reactive `appState.today`, not a raw `Date.now()`, so it
can't go stale if onboarding is left open across midnight). Verified live in
the browser: all 3 choices render, picking a manual date 4 days out and
completing onboarding produced an anchor number of exactly Rp 100.000 (Rp
500.000 balance / 5-day cycle) — proving `cycleManualEnd` was actually saved
and used, not silently dropped to the 30-day rolling fallback (which would
have shown ~Rp 16.700).

Trash restore UI (was #1 here) is done — History has a Sampah sub-tab with
restore and permanent-delete, typed `HAPUS` confirmation for entries at or
above `bigDeleteThreshold` and for emptying the trash entirely (spec §9.4).
Verified live in the browser: delete → restore, delete → permanent-delete
(both below and at-threshold amounts), empty-trash confirmation.

Filesystem backup (was #1 here) is done — Capacitor is in, `Directory.Data`
snapshots + weekly `Documents` copy verified on a real device 2026-07-28.
Two pieces of it stay open, not blocking anything above: rotation past 7
daily files is untested (needs a real week to elapse), and uninstall-survival
is untested (needs the Phase 4 import UI, which also doesn't exist yet).

Phase 3 (Voice/notifications) is done for everything verifiable without a
physical device — see its section below. Then Phase 2 (the Sadar dashboard).
Nothing in Phase 2 is started, apart from the two narrow formulas
(`domain/weekComparison.ts`, `domain/impulse.ts`) pulled forward early
because the weekly notification needed them; the rest of §4.6/§4.7 and the
whole dashboard UI remain unbuilt.

**Before adding features, use the app on a phone for a few days.** Every check so
far is automated — tests, types, build, HTTP status. None of them prove the
numbers look sane to a human or that the keypad is comfortable under a thumb. A
broken keypad layout once passed the entire suite and was only caught by reading
the CSS.

---

## Phase 1 — Foundation (spec §12)

| Item | Status |
|---|---|
| Data model, Dexie schema | done |
| Repository integrity rules (§5.1) | done |
| `domain/` pure functions + tests | done |
| Onboarding | done — all 3 cycle paths (monthly-day, manual, rolling) |
| Record screen, anchor number | done |
| Anti-habituation mechanisms (§7.1) | done — all three |
| Commitments, `bill` + `saving` (§4.3) | done |
| Automatic backup (§9.1) | done — `Directory.Data` daily snapshots + weekly `Documents` copy verified on real device (2026-07-28); rotation-past-7-days untested (needs real week), uninstall-survival untested (no import UI yet, see Phase 4) |
| Balance adjustment (§7.4) | done — "sesuaikan saldo" per wallet on the Komitmen screen, creates a visible `#koreksi` transaction |
| Trash restore UI (§7.3) | done — Sampah sub-tab, restore, typed-confirm permanent delete (§9.4) |

## Phase 2 — Sadar (dashboard)

Not started. Impulse ratio, 28-day SVG sparkline, tag breakdown, weekly
comparison, intent audit, History filters.

## Phase 3 — Voice (notifications)

Done for everything verifiable without a physical Android device. Built:
`@capacitor/local-notifications` added; `src/lib/notify/` (Notifier
interface, capacitor.ts, mock.ts, index.ts platform switch — mirrors
`db/fsBackup/`'s shape exactly, per AGENTS.md); scheduling/rescheduling logic
in `notify/schedule.ts` (pure, tested against `mock.ts`) with its
localStorage-backed glue in `db/notifySchedule.ts` (debounce timer, 5s,
separate from `autoBackup.ts`'s 30s one); all four notification types from
spec §8.1; the in-app "today" banner on Record.svelte (spec §8.4, shares the
exact same message builders as the real notifications — `notify/messages.ts`
— so wording cannot drift); Onboarding's 4th screen (permission + exact-alarm
link); Settings screen (`Settings.svelte`, new, wired into `App.svelte`'s
nav as "Setelan") scoped to the four toggles + diagnostics; `AndroidManifest.xml`
declares `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`.

Verified: `npm test` (all pass, including `weekComparison`/`impulse`/
`messages`/`schedule`/`diagnostics` suites), `svelte-check` (0 errors),
`npm run build` and `npm run build:android` (both succeed). Manually verified
live in the browser (fresh onboarding → 4th screen → Setelan toggles →
today-banner) — see the PR for the exact recap.

**Explicitly NOT verified — needs a real Android device/emulator, neither of
which exists in this environment:** actual notification delivery, Doze
survival, exact-alarm permission behavior, and the battery/exact-alarm
settings deep link. Spec §12's Phase 3 done-criterion ("four notifications
delivered on real device") is NOT met by this session and must not be
reported as met until someone verifies it on a device.

Deliberately narrowed, not oversights:
- Only `impulseAmount` (the rupiah sum) and `computeWeekComparison` (§4.7's
  one formula) were pulled forward from Phase 2 — just enough for the weekly
  notification's content. The dashboard itself, the full impulse-ratio
  percentage + its emergency-parallel treatment + 20%-reflection prompt, tag
  breakdown, sparkline, and History filters are all still Phase 2, not started.
- The weekly recap has no in-app "today banner" counterpart — §8.4 literally
  scopes the banner to "today"; the weekly recap's natural in-app home is the
  (unbuilt) Sadar dashboard.
- Allowance-exceeded fires at most once per dayKey (pinned in spec §8.1) —
  an undo-then-re-exceed within the same day does not re-push, though the
  live in-app banner is unaffected and still shows the current true state.
- "Battery optimization" (§8.5) is approximated with the installed plugin's
  exact-alarm settings screen (`checkExactNotificationSetting` /
  `changeExactNotificationSetting`) — there is no
  `ACTION_IGNORE_BATTERY_OPTIMIZATIONS` equivalent in
  `@capacitor/local-notifications`. A true battery-optimization intent needs
  a custom native plugin; not attempted.
- Settings this phase covers notifications only (see spec §7.4's scope note)
  — cycle, wallets, commitments, `dayStartHour`, `bigDeleteThreshold`, and
  backup/export/import have no Settings UI yet.

**Housekeeping the owner needs to do, not just future-session me:** an agy-bridge
mechanical-delegation task in this session wrote its first draft of
`src/lib/notify/{Notifier,mock,capacitor,index}.ts` into the **main checkout**
(`/home/ubuntu/repos/malas-finance/src/lib/notify/`) instead of this worktree
— the sandbox's worktree-isolation guard then correctly refused to let this
session delete them. Those 4 files are stray, untracked, and safe to delete;
the real (reviewed, tested) versions live in this branch. Please `rm -rf
/home/ubuntu/repos/malas-finance/src/lib/notify/` in the main checkout.

## Phase 4 — Release

Not started. Import with preview (§9.2) — the parse and preview functions exist
in `db/backup.ts` but nothing calls them. Markdown export, APK pipeline,
keystore into GitHub Secrets.

---

## Known defects, deliberately unfixed

Each was found by review, verified in the code, and judged not worth fixing yet
at single-user scale. None are forgotten; none are safe to forget.

- **`allActiveTransactions()` scans the whole table** on every mutation. The
  `deletedAt` index cannot help: IndexedDB does not index `null` keys, so
  querying it would require a sentinel value and that contradicts the
  `deletedAt: number | null` model in spec §5. Fine at a few thousand rows.
- **`dayKey` values become inconsistent if the device changes timezone.**
  Recorded in spec §10.1 as a required test; no code handles it.
- **Rolling mode does not surface overdue bills.** In `rolling` mode the cycle
  starts today, so a bill that fell due earlier this month is outside the
  commitment window and does not reduce the allowance. In rolling mode there is
  no cycle for it to be overdue *within*; fixing it properly means giving
  rolling mode a real period, which belongs to a spec revision, not a patch.
- **`previewBackup.walletCount` is the wallet count in the file, not the number
  of wallets that would be newly created.** Computing the delta needs the
  current wallet list, which a pure function does not have. Matters only once
  the import UI exists.
- **Rapid mode toggles queue unbounded tag queries.** A request token means only
  the newest result is applied, so this is wasted work rather than a wrong
  answer.
- **Backup lives in localStorage, not the filesystem.** Different eviction
  policy from IndexedDB, so it is real redundancy — but it is not the
  filesystem and shared-Documents copies §9.1 asks for.
- **A downward `#koreksi` correction (`kind: 'out'`) counts toward
  `dailySpendMap` (and so toward runway's daily average) on the day it is
  entered**, even though the drift it corrects usually accrued on earlier,
  unrecorded days. `dailySpendMap` only sums `out` transactions, so an upward
  correction (`kind: 'in'`) is unaffected. Excluding the `out` case needs a
  rule spec §7.4 does not state, and the alternative — leaving the average
  built on a balance that was already known to be wrong — is worse. Only
  matters for large corrections; not worth machinery at single-user scale.
- **The allowance-exceeded push notification does not re-fire after an
  undo-then-re-exceed within the same day** (pinned in spec §8.1) — its
  at-most-once-per-dayKey de-dup is keyed only on the day, not on which
  transaction tripped it. The in-app "today" banner is unaffected (it always
  reflects the live allowance), so K3's safety net still holds; only the
  push itself can go quiet for the rest of that day after an undo.

## Sharpest risk

Habituation (spec §15). The anchor number becoming wallpaper is the failure
mode that kills the whole premise, and no test can catch it. If the impulse
ratio has not moved after two months of real use, the anti-habituation
mechanisms failed — not the user.
