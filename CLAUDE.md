# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MalasFinance v2 "Sadar" — an offline-first personal finance web app for a single Indonesian user, deployed as a static site to GitHub Pages. Svelte 5 (runes) + Vite + TypeScript + Dexie/IndexedDB. No backend, no accounts, no network calls at runtime.

The app's purpose is **not** to record spending but to make the user notice money before it leaves. That distinction drives every design decision — see `spec.md`.

## `spec.md` is the source of truth

`spec.md` (~930 lines) is the authoritative design document, not background reading. It contains the exact formulas, integrity rules, edge cases, and required test cases. **Read the relevant section before changing anything numeric.** Code comments reference it by section (`spec §4.4`); keep those references accurate when editing.

It survived two rounds of adversarial review (§13.1, §13.2). Findings recorded there were deliberate fixes — re-introducing the original behaviour will silently reintroduce a known bug. Notably: commitment paid-status is **derived from transactions, never stored**; the commitment window's lower bound is the start of the month (an unpaid overdue bill must not raise the allowance); and future-dated transactions are rejected outright.

## Commands

```bash
npm run dev            # Vite dev server — the normal dev loop, no build step needed
npm run build          # production build to dist/
npm test               # vitest run (all tests)
npm run test:watch     # vitest in watch mode

npx vitest run src/lib/domain/allowance.test.ts   # single file
npx vitest run -t "name of the test"              # single test by name
npx svelte-check --threshold error                # type-check .svelte + .ts
```

There is no lint step. `svelte-check` is the type gate and must report 0 errors before pushing.

## Architecture

Four layers, strictly one-directional:

```
src/lib/domain/   pure functions — the numeric truth
src/lib/db/       Dexie schema + repositories (the only write path)
src/lib/stores/   appState.svelte.ts — the single bridge between db and domain
src/lib/ui/       Svelte components
```

**`domain/` must import nothing outside `domain/`.** No Dexie, no Svelte, no browser APIs. It takes plain arrays and objects and returns plain objects. This is the load-bearing constraint of the whole project: it lets every formula be tested with vitest in milliseconds, with no emulator and no build, which is what makes the project developable from a phone (Termux). If you find yourself wanting to import the database into `domain/`, the calculation belongs in the repo layer instead — see `db/repo/wallets.ts`, which reduces over transactions and therefore lives outside `domain/` despite being mathematically pure.

`appState.svelte.ts` is the only module that knows about both Dexie and `domain/`. UI components never touch the database directly.

### Things that are easy to get wrong

- **`dayKey` is denormalized and indexed.** Every transaction stores a `'YYYY-MM-DD'` string derived from `at` + `dayStartHour`. Day-scoped queries use that index instead of doing date math. Never compute a day boundary ad hoc — use `dayKeyOf` / `daysBetween` from `domain/day.ts`. `daysBetween(x, x) === 0`; the cycle and cold-start formulas depend on that exact convention.
- **`today` must never read `Date.now()` directly in reactive code.** `Date.now()` is not `$state`, so nothing recomputes when the day rolls over and the anchor number silently shows yesterday. `appState` holds a reactive `now` ticked by `startClock()` (interval + `visibilitychange`, because backgrounded-tab timers get frozen on mobile).
- **The repository is the only write path and enforces integrity itself.** Validation lives in `db/repo/*`, not the UI, because the UI can be bypassed. Money is whole rupiah stored as `number` — reject non-integers at the boundary.
- **Deletion is always soft.** `deletedAt` is set; rows are never removed. Any destructive UI action needs an undo path, since trash-restore UI is not built yet.

## Language rule

Three layers, and they differ:

| Layer | Language |
|---|---|
| Markdown, docs, `spec.md` | English |
| Code, comments, identifiers, commit messages, PR bodies | English |
| **String literals shown to the app's user** | **Bahasa Indonesia** |

The Indonesian UI copy is deliberate, not leftover. The intent taxonomy `TERENCANA / RUTIN / IMPULSIF / DARURAT` and the onboarding questions are designed in Indonesian and translating them changes the product. `spec.md` quotes those strings verbatim inside English prose. i18n is explicitly out of scope (spec §14).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys to GitHub Pages. Live at **https://luki.is-a.dev/malas-finance/**.

- `vite.config.ts` must keep `base: '/malas-finance/'`. Without it the page still returns 200 while every asset 404s — an HTML-only smoke test will look green over a completely broken app. Always check a bundle URL too.
- **Never add a `CNAME` file.** `luki.is-a.dev` is the custom domain of the owner's *user* site (`lzif.github.io`); this project page inherits it. A `CNAME` here would hijack the apex site.
- The repo's `default_workflow_permissions` is intentionally `read` — the workflow declares its own `permissions:` block. Deploys have been verified to work this way; do not broaden it.

## Current state vs. spec

The spec describes the finished product; the app is an MVP of Phase 1 (spec §12). Deliberately **not** built yet, so do not treat these as bugs: Capacitor/APK packaging, notifications, commitments, the "Sadar" dashboard and charts, filesystem backup, `move` transactions, multi-wallet UI, `manual` cycle mode, trash-restore UI, and the intent audit.

Commitments are out of scope but `unpaidCommitments` and `dailyCommitmentCost` remain **required parameters** of the domain functions, passed as `0`. Do not remove them from the signatures — adding commitments later must not reshape `domain/`.

Known technical debt, deliberately unaddressed: rapid consecutive saves drop the first undo window; concurrent `load()` calls can race; `allActiveTransactions()` scans the full table on every mutation; `dayKey` values become inconsistent if the device changes timezone; `topTags` uses raw epoch arithmetic instead of respecting `dayStartHour`.
