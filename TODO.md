# TODO

`spec.md` says where this is going. This file says where it actually is.

Kept deliberately as one file: the phase plan already lives in spec §12, and a
second document restating it would only drift out of sync with the first.

Last updated: 2026-07-28

## Pick up here

In order.

1. **Balance adjustment** (spec §7.4). Every formula stands on `spendableBalance`
   being right; one forgotten transaction skews everything silently and there is
   currently no way to correct it.
2. **`manual` cycle mode in onboarding.** Reachable from settings only.

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

Then Phase 2 (the Sadar dashboard). Nothing in Phase 2 is started.

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
| Onboarding | partial — 2 of 3 cycle paths; `manual` mode missing |
| Record screen, anchor number | done |
| Anti-habituation mechanisms (§7.1) | done — all three |
| Commitments, `bill` + `saving` (§4.3) | done |
| Automatic backup (§9.1) | done — `Directory.Data` daily snapshots + weekly `Documents` copy verified on real device (2026-07-28); rotation-past-7-days untested (needs real week), uninstall-survival untested (no import UI yet, see Phase 4) |
| Balance adjustment (§7.4) | **not started** |
| Trash restore UI (§7.3) | done — Sampah sub-tab, restore, typed-confirm permanent delete (§9.4) |

## Phase 2 — Sadar (dashboard)

Not started. Impulse ratio, 28-day SVG sparkline, tag breakdown, weekly
comparison, intent audit, History filters.

## Phase 3 — Voice (notifications)

Not started. Needs Capacitor, so it also loses the instant browser dev loop
(§11.1). `NotifSettings` already exists in the schema and is unused.

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

## Sharpest risk

Habituation (spec §15). The anchor number becoming wallpaper is the failure
mode that kills the whole premise, and no test can catch it. If the impulse
ratio has not moved after two months of real use, the anti-habituation
mechanisms failed — not the user.
