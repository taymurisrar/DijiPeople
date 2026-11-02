# DijiPeople engineering constitution

One standard, followed by people and agents alike, enforced by code wherever code can enforce it.

## How the layers fit (progressive disclosure)

| Layer | File(s) | Loaded |
|---|---|---|
| Entrypoint | `AGENTS.md` (authoritative), `CLAUDE.md` (Claude navigation) | always |
| Path-scoped rules | `.claude/rules/*.md` (each has `paths:`) | only when you touch matching files |
| Policy catalogue | `policy-catalogue.json` — id, level, statement, **how it is enforced** | on demand, by id |
| Standards | `standards/*.md` | when doing that kind of work |
| Agents / skills | `.claude/agents/dp-*.md`, `.claude/skills/dp-*/SKILL.md` | when invoked |
| Hooks | `.claude/settings.json` → `scripts/hooks/*.mjs` | automatically, deterministically |
| Gates | `scripts/check-*.mjs`, `scripts/preflight.mjs`, CI | every push |

Root files stay short. Detail lives below them and is pulled in by relevance, not pasted everywhere.

## Rule tiers

- **MANDATORY** — a violation blocks. Prefer an executable check or hook over prose; the catalogue records which.
- **RECOMMENDED** — the default pattern. Deviate with a one-line justification in the PR.
- **EXCEPTION_ADR** — permitted only with an ADR in `docs/adr/` approved by the owner (e.g. a breaking public-API change, an unsafe verb on a sensitive resource). The ADR id goes in the manifest entry that carries the exception.

`level` and `enforcement.kind` (`executable | hook | review | manual`) are in `policy-catalogue.json`; `scripts/governance.test.mjs` fails if a critical rule is only prose, if an enforcement target no longer exists, or if two policies say the same thing.

## Daily commands

```bash
npm run preflight                          # fast, no DB/network: engines, branch drift, API + module gates, governance tests
npm run preflight -- --full                # + validate:framework, advisories, typecheck
node scripts/check-api-completeness.mjs --inventory
node scripts/check-module-completeness.mjs
node scripts/ci-doctor.mjs --limit 50      # classify CI failures (read-only)
node scripts/hotfix.mjs dry-run --severity P1 --title "<incident>"
node scripts/lessons.mjs suggest|new|check|stale
```

## Owner decisions (agents never decide these)

Pricing, subscription and entitlement policy · material business-rule changes · destructive migrations or data deletion · security weakening · breaking public API without an approved transition · customer-contract behaviour · production deployment and emergency bypasses · new recurring infrastructure cost. See `standards/agent-autonomy.md`.

## Adopting this in running Claude Code sessions

1. Merge `agent/engineering-governance` to `develop` through the normal Integrator path (not part of any go-live release unless the owner chooses).
2. In each existing worktree: `git fetch && git rebase origin/develop`, then start a **new** session (hooks and agents load at session start; a running session will not see them).
3. `.claude/` is excluded by this clone's `.git/info/exclude`; the files are tracked (force-added), so they appear in every checkout of the branch.
4. Run `npm run preflight` once to confirm the toolchain (node 22 / npm 11).
5. Hand off between sessions with `handoffs/TEMPLATE.md`.

What is automated versus still human: `automation-matrix.md`. Evidence for this work: `baseline-2026-11-03.md`.
