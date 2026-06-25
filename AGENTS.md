# AGENTS.md

## Project Context
- MalasFinance is a personal Android finance logger.
- Local environment is Termux; do not expect Java, Android SDK, or local Gradle builds to work.
- GitHub Actions is the source of truth for build/test/release verification.
- Use `gh` CLI to inspect and trigger workflow runs.

## Working Style
- Keep changes minimal and practical. Personal app, not enterprise architecture.
- Prefer fixing real data-loss, privacy, and release issues over broad refactors.
- Do not add new dependencies unless current Android/Kotlin stdlib/platform APIs cannot cover the need.
- Avoid speculative cleanup. Big `MainScreen.kt` is acceptable unless a change directly benefits safety or maintainability now.

## Build And Verification
- Local `./gradlew` may fail with `JAVA_HOME is not set`; this is expected in Termux.
- After pushing APK-affecting changes, watch GitHub Actions:
  - `gh run list --limit 5 --branch main`
  - `gh run view <run-id> --json status,conclusion,jobs`
  - `gh run view <run-id> --log-failed`
- For long builds, poll up to 6 minutes before reporting status.
- README-only and non-APK changes should not trigger builds.

## Release Workflow
- Workflow file: `.github/workflows/build.yml`.
- Builds run for APK-affecting paths only: `app/**`, `gradle/**`, root Gradle files, wrappers, workflow file.
- Releases must be conventional versioned releases, not a mutable APK filename.
- Expected release format:
  - Tag: `v<version>-b<build>`
  - Title: `MalasFinance v<version> (Build <build>)`
  - APK: `MalasFinance-v<version>-b<build>.apk`
  - Notes: version code, commit SHA, changelog since previous `v*` tag.
- Use `fetch-depth: 0` in checkout when changelog generation needs tags/history.

## Data Safety Rules
- Never reintroduce `fallbackToDestructiveMigration()`.
- Any Room schema change must bump DB version and include migration.
- Finance data deletion must be recoverable or confirmed:
  - No swipe-to-delete for transactions.
  - Delete moves entries to trash first.
  - Permanent delete requires confirmation.
- Android cloud backup should remain disabled unless explicitly requested.

## Current Safety Features
- Transactions include `deletedAt` for soft delete/trash.
- Active transaction queries exclude deleted rows.
- Trash view supports restore and permanent delete.
- Transaction date/time can be edited using `yyyy-MM-dd HH:mm`.
- JSON backup export/import exists for restore.
- Markdown export includes date/time and escapes table-breaking characters.

## Versioning
- Keep `app/build.gradle.kts` `versionName` and README version badge in sync.
- Bump `versionCode` for release-relevant app changes.
- UI hardcoded version strings, if present, must match `versionName`.

## Git Practices
- Check `git status --short` before edits and before commits.
- Do not revert unrelated user changes.
- Commit and push only requested/related files.
- If CI fails, inspect logs with `gh run view --log-failed`, patch, commit, push, and watch again.
