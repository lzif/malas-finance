# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See [AGENTS.md](AGENTS.md).** It is the canonical instruction file for every AI agent working here, and it is kept current. Duplicating it in a Claude-specific file would only let the two drift apart.

Read in this order: `AGENTS.md`, then `spec.md` (the authoritative design), then `TODO.md` (where the project actually is).

## Claude Code tooling preferences

These are specific to the Claude Code CLI/plugin ecosystem and have no equivalent for Gemini/Codex/Cursor — that's why they live here and not in `AGENTS.md`.

- **Deno first.** This is a Deno project — no `npm`, no `node_modules`, no build. If a fresh session has no `deno` on PATH, install it (`curl -fsSL https://deno.land/install.sh | sh`) before doing anything else; the whole test/check/lint loop depends on it. `deno task test`, `deno task check`, `deno lint src/` are the gates.
- **Review delegation:** after any code change, run an adversarial review pass (a subagent, or `agy-bridge --type review` if configured) rather than reviewing solo — feed it the relevant spec section, the diff, and an explicit out-of-scope list. See the "Review is part of finishing" discipline in `AGENTS.md`.
- **Mechanical-task delegation:** when a task decomposes into genuinely independent, low-judgment subtasks (bulk rewrites, boilerplate scaffolding, repetitive lookups), offload them to a cheaper model to conserve token budget. Don't force it — a cold agent thrashes on tasks needing live environment context (debugging a failing `deno check`, diagnosing CI). Judge fit per-task.
- **The bot has almost no UI to verify in a browser.** Unlike v2, v3's surface is Telegram chat + a Phase-4 read-only WebApp dashboard. Most verification is `deno test` (pure domain + formatter) plus, once the flow exists, exercising the webhook locally with `deno task dev` and `curl`-ing a fake Telegram update at `/webhook`. There is no live device loop to babysit until Phase 4.
- **AI parser output is non-deterministic — never unit-test it against a live LLM.** Test the pure pieces around it (amount parsing, routing, formatting) and mock the model's structured output. spec §6.2's `parseAmount` and `bot/formatter.ts` are pure and fully testable; keep new pure logic out of the AI-call path so it stays that way.
- **When you notice a pattern this section doesn't cover yet — a tool combo that worked, a gotcha that cost a retry, a delegation that paid off — add it here before ending the session.** This file only stays useful if it accumulates; don't let a hard-won discovery evaporate with the conversation.
- **The owner merges PRs without telling you, at any time.** A commit lands in `main` only if it was on the branch's tip at the moment they clicked merge — pushing again afterward does not retroactively include it. Two habits this forces: (1) before pushing a follow-up commit to an already-open PR, check its state first — if it is already `MERGED`/`CLOSED`, open a fresh PR instead of assuming the push still lands; (2) don't trickle small follow-up commits onto one open PR across a long session — batch them into one commit before pushing, so there's no window for the owner to merge mid-stream. This bit once in v2: a PR merged between two pushes, stranding a commit.
