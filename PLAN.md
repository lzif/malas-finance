# Project Cleanup Plan

This is a pragmatic cleanup list for a personal finance app. Goal: protect data first, reduce debugging pain second, delete unused noise last. No architecture cosplay.

## Priority 1: Critical Data Safety

Fix these before cosmetic work. Finance app failure mode must not be lost or corrupted records.

- [x] **Make JSON import safe:** Imported transactions currently keep their original IDs, which can collide with existing rows and trigger `REPLACE`. For merge imports, force imported `id = 0` so Room/SQLite assigns new IDs. If exact restore is needed later, make it a separate explicit restore flow.
- [ ] **Prevent orphaned wallet data:** Do not delete a wallet while transactions still reference it. Cheapest safe fix: block deletion and show a message. Only add reassignment if you actually need it.
- [ ] **Move signing secrets out of Gradle:** Remove keystore passwords from `app/build.gradle.kts`. Use local ignored properties for local builds and GitHub secrets for CI/release builds.

## Priority 2: Minimal Refactor For Debuggability

Keep app simple, but stop making one file responsible for everything.

- [ ] **Split non-UI logic out of `MainScreen.kt`:** Move backup JSON, markdown export, date filtering, and file save helpers into small utility files. Leave Compose UI in screen code.
- [ ] **Exclude trash from normal exports:** Markdown/report exports should use active transactions only. If backup needs deleted records, name it clearly as full backup and keep that behavior intentional.
- [ ] **Report file save failures correctly:** In `saveToFile`, show success only after a non-null output stream writes successfully. Null stream or exception should show failure.
- [ ] **Use stable date parsing locale:** Change fixed-format `SimpleDateFormat("yyyy-MM-dd HH:mm", ...)` calls to `Locale.ROOT` to avoid device-locale surprises.

## Priority 3: Delete Bloat And Noise

Unused code and dependencies make builds slower and failures harder to read.

- [ ] **Remove Roborazzi until used:** Drop plugin and dependencies if there are no screenshot tests.
- [ ] **Replace dummy tests:** Delete generated placeholder tests, or replace them with small tests for import/export/date filtering logic.
- [ ] **Stop regenerating Gradle wrapper in CI:** Commit wrapper files and let CI use them. Build pipeline should verify repo state, not mutate tooling each run.

## Leave Alone For Now

These are not worth touching unless they block release or real maintenance.

- [ ] **Keep `com.example` namespace:** Not pretty, but harmless for personal side-loaded APKs.
- [ ] **Defer version cleanup:** README/build/db version naming can wait as long as APK installs and data migrations remain safe.
- [ ] **Keep string categories/types:** Dropdown-controlled strings are acceptable for now. Upgrade to constants/enums only if typos or external imports become real bugs.
