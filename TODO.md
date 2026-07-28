# TODO

`spec.md` says where this is going. This file says where it actually is.

Kept deliberately as one file: the phase plan already lives in spec §12, and a
second document restating it would only drift out of sync with the first.

Last updated: 2026-07-28

## Pick up here

Phase 4 (Release) is now built: import UI with preview (merge/full-replace),
Markdown export, and a signed-APK release workflow. See the Phase 4 section
below for what's verified vs. still pending (the CI signing step specifically
— it cannot be exercised until the owner sets four GitHub Secrets). Phase 2
(the Sadar dashboard) and Phase 3 (notifications) remain not started; nothing
blocks starting either.

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
is still untested — the Phase 4 import UI now exists to drive the reinstall
side, but actually exercising "uninstall, reinstall, import the automatic
backup, get identical data" needs a real device and hasn't been done yet.

Next up: Phase 2 (the Sadar dashboard) or Phase 3 (notifications) — neither
is started, and nothing built so far blocks either one.

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
| Automatic backup (§9.1) | done — `Directory.Data` daily snapshots + weekly `Documents` copy verified on real device (2026-07-28); rotation-past-7-days untested (needs real week), uninstall-survival untested (import UI now exists, see Phase 4, but the real-device round trip hasn't been run yet) |
| Balance adjustment (§7.4) | done — "sesuaikan saldo" per wallet on the Komitmen screen, creates a visible `#koreksi` transaction |
| Trash restore UI (§7.3) | done — Sampah sub-tab, restore, typed-confirm permanent delete (§9.4) |

## Phase 2 — Sadar (dashboard)

Not started. Impulse ratio, 28-day SVG sparkline, tag breakdown, weekly
comparison, intent audit, History filters.

## Phase 3 — Voice (notifications)

Not started. Needs Capacitor, so it also loses the instant browser dev loop
(§11.1). `NotifSettings` already exists in the schema and is unused.

## Phase 4 — Release

- **Import with preview (§9.2)** — done. `db/import.ts` adds pure planning
  functions (`planMergeImport`, `planFullReplaceImport`) plus thin Dexie
  wrappers (`applyMergeImport`, `applyFullReplaceImport`), wired into the
  Cadangan panel on the Komitmen screen (no separate Settings screen exists
  yet — this is where the JSON export UI already lived). Merge assigns every
  transaction a fresh id and recomputes `dayKey` under the local
  `dayStartHour` (never trusts the file's own dayKey); wallets/commitments are
  inserted only if their id isn't already present locally. Full replace
  clears all four tables and restores the file verbatim (same ids, same
  `deletedAt`), gated behind typed `GANTI` confirmation (same pattern as
  History's `HAPUS`). Both a parse failure and a parse success with zero
  active entries surface the same
  `"Tidak ada entri yang bisa dibaca — berkas mungkin rusak"` message — a file
  that's all soft-deleted rows must not silently report success.
  `previewBackup` (`db/backup.ts`) now takes an optional `current` argument to
  compute real new-wallet/new-commitment counts against local state, which
  **resolves the `previewBackup.walletCount` known-defect entry** that used to
  live in this file (computing the delta needed the current wallet list,
  which only exists now that this UI does). Verified live in the browser: a
  4-transaction fixture file (1 soft-deleted, amount 999.999) previewed as
  "3 entri · 2 Jan s/d 4 Jan", "Masuk Rp 1.000.000 · Keluar Rp 165.000",
  "Dompet baru: 2 · Komitmen baru: 1" — the Rp 165.000 figure (not
  Rp 1.164.999) confirms the soft-deleted row was correctly excluded from the
  preview, not just from the count. GANTI SEMUA's confirm button was
  observed disabled until "GANTI" was typed, then enabled. A deliberately
  corrupted (non-JSON) file produced exactly
  `"Tidak ada entri yang bisa dibaca — berkas mungkin rusak"` with no preview
  panel. "Unduh Markdown" triggered a download with no console errors.
- **Markdown export (§9.5)** — done. `db/markdownExport.ts`, format documented
  in spec §9.5. Active transactions only, grouped by day newest-first,
  Indonesian intent labels, pipe/newline-safe note cells.
- **Signed APK release pipeline (§11.3)** — done as code, **untested
  end-to-end**. `.github/workflows/android-release.yml`, `workflow_dispatch`
  only (deliberately manual — see spec §11.3 for why). Needs four secrets the
  owner hasn't set yet: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (named at the top of the
  workflow file). `android/app/build.gradle` gained an intentionally-empty
  `signingConfigs.release` block that AGP fills from
  `-Pandroid.injected.signing.*` command-line properties at build time — no
  keystore, password, or path is ever committed. Cannot be verified until
  those secrets exist; this workflow has never actually run.

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

## Sharpest risk

Habituation (spec §15). The anchor number becoming wallpaper is the failure
mode that kills the whole premise, and no test can catch it. If the impulse
ratio has not moved after two months of real use, the anti-habituation
mechanisms failed — not the user.
