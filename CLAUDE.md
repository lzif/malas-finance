# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See [AGENTS.md](AGENTS.md).** It is the canonical instruction file for every AI agent working here, and it is kept current. Duplicating it in a Claude-specific file would only let the two drift apart.

Read in this order: `AGENTS.md`, then `spec.md` (the authoritative design), then `TODO.md` (where the project actually is).

## Claude Code tooling preferences

These are specific to the Claude Code CLI/plugin ecosystem and have no equivalent for Gemini/Codex/Cursor — that's why they live here and not in `AGENTS.md`.

- **Caveman mode: always run at `ultra`** in this repo. If a session starts at a lower level, switch with the `caveman:caveman` skill (`args: ultra`). Code, commits, PR bodies, and anything security-relevant still get written in normal English regardless of chat mode.
- **Review delegation:** after any code change, run the adversarial review pass via `agy-bridge --type review --model claude-opus-4-6-thinking` (see the "Review is part of finishing" discipline in `AGENTS.md`) rather than reviewing solo — feed it the relevant spec section, the diff, and an explicit out-of-scope list.
- **Mechanical-task delegation:** when a task decomposes into several genuinely independent, low-judgment subtasks (bulk rewrites, boilerplate scaffolding, repetitive lookups), offload them to `agy-bridge --type implement` or `agy-search` with `gemini-3.6-flash-high` to conserve Claude token budget. Don't force this — a cold flash agent thrashes on tasks needing live environment context (debugging a build, diagnosing CI failures) or on code that's already been written out verbatim in a plan; those stay with the primary agent. Judge fit per-task rather than delegating by default.
- **UI/UX work:** invoke the `ui-ux-pro-max` skill (or its sub-skills — `ui-styling`, `design-system`, `banner-design`, etc.) before designing or reviewing any UI surface — components, color/typography choices, layout, accessibility, charts. Don't freehand UI decisions this repo has a skill for.
