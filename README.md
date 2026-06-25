# MalasFinance

[![Version](https://img.shields.io/badge/version-1.5.0-blue)](app/build.gradle.kts)
[![Build](https://img.shields.io/github/actions/workflow/status/lzif/malas-finance/build.yml?branch=main&label=latest%20build)](https://github.com/lzif/malas-finance/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/lzif/malas-finance?label=latest%20release&color=success)](https://github.com/lzif/malas-finance/releases/latest)

[Download latest APK](https://github.com/lzif/malas-finance/releases/tag/latest)

MalasFinance is an offline-first financial logger designed for quick data entry and monitoring with a sleek, hacker-style UI.

## Features
- **Quick Logging:** Ultra-fast transaction logging specifically tailored for quick thumb reach.
- **Categorization:** Separate your expenses across CORE, OPER, HOBBY, and VAULT.
- **Visual Analytics:** Breakdown your expenditures by category and observe real-time balance calculations.
- **Local Persistence:** Your data stays on your device using a local Room Database.
- **Export Capabilities:** Easily export logs using a clipboard format.

## CI/CD
GitHub Actions builds and uploads a release APK for `arm64-v8a` whenever code is pushed to `main`.
The build badge shows latest `main` build status, including failures.
