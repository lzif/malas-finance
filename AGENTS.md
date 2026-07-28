# AGENTS.md

Instructions for any AI coding agent working in this repository — Claude, Gemini, Codex, Cursor, or anything else. This is the canonical file. `CLAUDE.md` points here because Claude Code looks for that filename specifically; every other tool reads `AGENTS.md` directly, so no further per-tool file is needed.

## What this is

MalasFinance v2 "Sadar" — an offline-first personal finance web app for a single Indonesian user, deployed as a static site to GitHub Pages. Svelte 5 (runes) + Vite + TypeScript + Dexie/IndexedDB. No backend, no accounts, no network calls at runtime.

The app's purpose is **not** to record spending but to make the user notice money before it leaves. That distinction drives every design decision.

## Read these first, in this order

1. **`spec.md`** — the authoritative design (~930 lines). Exact formulas, integrity rules, edge cases, required test cases. **Read the relevant section before changing anything numeric.** Code comments reference it by section (`spec §4.4`); keep those references accurate.
2. **`TODO.md`** — where the project actually is, as opposed to where the spec says it is going. What is built, what is not, and the defects left unfixed on purpose.
3. This file.

`spec.md` survived two rounds of adversarial review, recorded in its §13. Findings there were deliberate fixes — re-introducing the original behaviour silently reintroduces a known bug. Notably: commitment paid-status is **derived from transactions, never stored**; the commitment window is the cycle itself, because an unpaid overdue bill must never vanish and raise the allowance; and future-dated transactions are rejected outright.

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

**`domain/` must import nothing outside `domain/`.** No Dexie, no Svelte, no browser APIs. It takes plain arrays and objects and returns plain objects. This is the load-bearing constraint of the whole project: it lets every formula be tested with vitest in milliseconds, with no emulator and no build, which is what makes the project developable from a phone (Termux). If you want to import the database into `domain/`, the calculation belongs in the repo layer instead — see `db/repo/wallets.ts`, which reduces over transactions and therefore lives outside `domain/` despite being mathematically pure.

`appState.svelte.ts` is the only module that knows about both Dexie and `domain/`. UI components never touch the database directly.

### Traps that have already bitten

- **`dayKey` is denormalized and indexed.** Every transaction stores a `'YYYY-MM-DD'` string derived from `at` + `dayStartHour`. Day-scoped queries use that index instead of doing date math. Never compute a day boundary ad hoc — use `dayKeyOf` / `daysBetween` from `domain/day.ts`. `daysBetween(x, x) === 0`; the cycle and cold-start formulas depend on that exact convention.
- **`today` must never read `Date.now()` directly in reactive code.** `Date.now()` is not `$state`, so nothing recomputes when the day rolls over and the anchor number silently shows yesterday. `appState` holds a reactive `now` ticked by `startClock()` (interval + `visibilitychange`, because backgrounded-tab timers get frozen on mobile).
- **The repository is the only write path and enforces integrity itself.** Validation lives in `db/repo/*`, not the UI, because the UI can be bypassed. Money is whole rupiah stored as `number` — reject non-integers at the boundary.
- **Deletion is always soft.** `deletedAt` is set; rows are never removed. Any destructive UI action needs an undo path, since trash-restore UI is not built yet.
- **A `saving` commitment is settled by a `move`, never an `out`.** Recording it as an `out` destroys the money instead of setting it aside. This shipped as a bug once.

## Language rule

Three layers, and they differ:

| Layer | Language |
|---|---|
| Markdown, docs, `spec.md` | English |
| Code, comments, identifiers, commit messages, PR bodies | English |
| **String literals shown to the app's user** | **Bahasa Indonesia** |

The Indonesian UI copy is deliberate, not leftover. The intent taxonomy `TERENCANA / RUTIN / IMPULSIF / DARURAT` and the onboarding questions are designed in Indonesian and translating them changes the product. `spec.md` quotes those strings verbatim inside English prose. i18n is explicitly out of scope (spec §14).

The repository owner speaks Indonesian; conversation with them is in Indonesian, but nothing written into the repo is.

## Working discipline

**Work in a git worktree, never directly in the main checkout.** An earlier agent worked in `/home/ubuntu/repos/malas-finance` directly and left 99 staged changes there that would have re-added the entire deleted Kotlin app — including a committed keystore — and deleted `CLAUDE.md` and the deploy workflow. One commit from that directory would have undone the whole rewrite. That checkout is also where the owner works; debris left there is a loaded gun, not an untidiness.

Before finishing, confirm the main checkout is clean and say so if it is not.

**Review is part of finishing, not an optional extra.** After completing any change to code, run an adversarial review before reporting it done — especially anything touching money, dates, or persistence. Feed the reviewer the relevant `spec.md` sections alongside the diff, state explicitly what is out of scope so it does not report deliberate omissions as defects, and warn it that code comments quote the spec and may not match what the code does.

**Then verify the findings yourself before accepting any.** Reviewers overstate, misread intent, and occasionally argue for the exact opposite of what is correct — that has happened more than once here, including a review that proposed a commitment-window bound which turned out to over-count. Open the code, confirm each claim, and say plainly which you reject and why.

**Sync the docs to match reality before ending the session.** `TODO.md` says where the project actually is — a finished item left marked `not started` there is a lie that costs the next session a wasted re-read of code to discover the truth. Update its status and its "Pick up here" order every time a listed item gets built. If the work also pinned down a concrete detail `spec.md` left open — a literal string, a threshold, a confirmation word — add it to `spec.md` too, in the same style as existing entries (spec already quotes literals like the import confirmation word `GANTI` verbatim; a new one like a delete-confirmation word belongs there the same way). Don't leave a decision only in code and a commit message: `spec.md` and `TODO.md` are what the next session reads first, before the code.

## Android / Capacitor

The stack includes Capacitor 8 (`@capacitor/core`, `@capacitor/filesystem`, `@capacitor/android`) and a committed `android/` platform directory, added to unblock filesystem-backed automatic backup (spec §9.1) and Phase 3 (Voice/notifications) — both need native APIs the web build doesn't have.

- **Two build modes, two base paths.** `npm run build` (base `/malas-finance/`) feeds GitHub Pages; `npm run build:android` (`vite build --mode capacitor`, base `./`) feeds the Android project. A Capacitor WebView loads `index.html` from local app storage, not from a path under `/malas-finance/` — using the web base there 404s every asset. Never let these merge into one build step.
- **Never build Gradle locally on this VPS.** No Android SDK/`ANDROID_HOME` is installed and there's not enough RAM (2GB) to run one comfortably even if there were. `.github/workflows/android-debug-build.yml` does the build (unsigned debug APK, no keystore — signing is Phase 4); download the artifact and sideload it instead.
- **`cap sync android` regenerates `android/app/src/main/assets/public` and `android/app/src/main/assets/capacitor.config.json`** — both gitignored. The rest of `android/` (including `gradlew` and the gradle wrapper) is committed so CI can build without a separate Gradle install.
- **Backup file writes mirror the `Notifier` pattern (spec §8.3):** `src/lib/db/fsBackup/` has an interface (`BackupFileWriter`), a `capacitor.ts` (native, uses `Directory.Data` for daily/rotated snapshots + a best-effort weekly copy to `Directory.Documents/MalasFinance/`), and a `mock.ts` (browser/test, no-op). `capacitor.ts` has no unit test — `@capacitor/filesystem` can't be faked meaningfully under vitest (spec §11.1); it's verified manually, on a real device. Keep the pure fan-out/rotation logic (`writeToAllTargets.ts`, `rotate.ts`) separate from the native adapter specifically so *that* part stays testable against the mock.
- **`Directory.Data` is wiped on Android uninstall.** Only the best-effort weekly `Directory.Documents` copy would survive it — spec §12's "uninstall-reinstall produces identical data" criterion can't be verified until the Phase 4 import UI exists (parse/preview functions already exist in `db/backup.ts`, nothing calls them yet). Don't claim that criterion passed without an import UI to actually drive the reinstall side.
- **`workflow_dispatch` only works once the workflow file exists on the default branch.** To test a brand-new workflow on a feature branch first, temporarily add that branch name to the `push: branches:` list (same pattern already in `deploy.yml`), push, let it self-trigger, then remove the temporary branch entry before merging.
- **When a plan adds a native/platform pipeline that nothing has exercised yet, front-load it.** Reorder the plan so the riskiest, most unproven step (does the app even boot in a WebView? does the CI build wiring work at all?) runs right after minimal setup, before writing feature code on top of it. Finding out AGP/JDK/WebView problems exist *after* six new files depend on the pipeline is a worse debugging position than finding out first.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys to GitHub Pages. Live at **https://luki.is-a.dev/malas-finance/**.

- `vite.config.ts` must keep `base: '/malas-finance/'`. Without it the page still returns 200 while every asset 404s — an HTML-only smoke test looks green over a completely broken app. Always check a bundle URL too.
- **Never add a `CNAME` file.** `luki.is-a.dev` is the custom domain of the owner's *user* site (`lzif.github.io`); this project page inherits it. A `CNAME` here would hijack the apex site.
- The repo's `default_workflow_permissions` is intentionally `read` — the workflow declares its own `permissions:` block. Verified to work; do not broaden it.
- Never push to `main` directly, never force-push, never merge your own PR. Open a draft PR and let the owner merge.

## Current state

The spec describes the finished product; the app is most of Phase 1 (spec §12). See `TODO.md` for the authoritative list — it is kept current and is more specific than this section.
