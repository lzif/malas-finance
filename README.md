# MalasFinance

[![Version](https://img.shields.io/badge/version-1.5.2-blue)](app/build.gradle.kts)
[![Build](https://img.shields.io/github/actions/workflow/status/lzif/malas-finance/build.yml?branch=main&label=latest%20build)](https://github.com/lzif/malas-finance/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/lzif/malas-finance?label=latest%20release&color=success)](https://github.com/lzif/malas-finance/releases/latest)

[Download latest versioned APK](https://github.com/lzif/malas-finance/releases/latest)

MalasFinance is an offline-first personal finance logger designed for fast thumb-first entry, local-only storage, and safer recovery from mistakes.

## Features
- **Quick Logging:** Fast transaction entry for income, expense, and transfers.
- **Categorization:** Track spending across CORE, OPER, HOBBY, and VAULT.
- **Local Persistence:** Data stays on device in a Room database; Android cloud backup is disabled.
- **Safer Deletion:** Entries move to trash first, can be restored, and require confirmation before permanent delete.
- **Date Editing:** Transaction date/time can be adjusted using `yyyy-MM-dd HH:mm`.
- **Export / Restore:** Markdown reports plus JSON backup export/import for restoring app data.

## Releases
GitHub Actions builds signed release APKs for `arm64-v8a` from APK-affecting changes on `main`.

Release format:
- Tag: `v<version>-b<build>`
- Title: `MalasFinance v<version> (Build <build>)`
- APK: `MalasFinance-v<version>-b<build>.apk`
- Notes: version code, commit SHA, and changelog since previous version tag.

Example APK filename: `MalasFinance-v1.5.1-b15.apk`.
This keeps downloads unique, so repeated downloads do not become `MalasFinance (1).apk`.

## CI/CD
The build workflow runs tests, assembles the release APK, and publishes a versioned GitHub release.
README-only and other non-APK changes do not trigger builds.
