---
TASK_ID: TASK-0002
aliases: [TASK-0002]
TITLE: Deep documentation of apps/docs, apps/landing and apps/agent-desktop
TYPE: KNOWLEDGE
SIZE: LARGE
STATUS: COMPLETE
PRIORITY: P1
CREATED_AT: 2026-08-16
AFFECTED_MODULES: [apps/docs, apps/landing, apps/agent-desktop, agent, app-releases, leads, partners, contracts, billing]
AGENTS: [Architect, Frontend, Integration, QA, Reviewer, Integrator, Release/DevOps, Knowledge Capture]
DEPENDENCIES: WP-02..WP-04 depend on WP-01; WP-05 depends on WP-02..WP-04; WP-06 depends on WP-05; WP-07..WP-09 depend on WP-06
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS: COMPLETE
---

# TASK-0002 — Deep documentation of apps/docs, apps/landing and apps/agent-desktop

## Objective

Three of the five applications in this monorepo have never been documented as
applications. `apps/landing` is described only through the bugs it produced,
`apps/agent-desktop` appears in the repository map as a single line, and
`apps/docs` is asserted to be "effectively unused" without anywhere recording
what that means for a build, a typecheck or a release. This task produces
code-verified, drift-detectable knowledge for all three — repository knowledge
notes carrying `Last Verified` / `Verified Against SHA` / `Source Paths`, a
cross-application dependency map, corrections to context documents the code now
contradicts, durable records for material findings, and an Obsidian publication
of the result. It is finished when a future Architect can retrieve any of the
three applications' ownership, boundaries and limitations without re-reading the
source, and when a future agent can tell that the note has gone stale.

No product behaviour changes. `KNOWLEDGE` permits exactly one exception —
verified documentation drift — and that is used only to correct documents, never
code.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Existing knowledge audit and repository health | DONE | — | Architect, Release/DevOps | agent/knowledge-monorepo-app-documentation | 88e0259 | NOT_REQUIRED | — | PASS | MERGED |
| WP-02 | `apps/docs` deep audit | DONE | WP-01 | Architect | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-03 | `apps/landing` deep audit | DONE | WP-01 | Frontend | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-04 | `apps/agent-desktop` deep audit | DONE | WP-01 | Integration | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-05 | Cross-application relationship map | DONE | WP-02, WP-03, WP-04 | Architect | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-06 | Repository knowledge notes and context corrections | DONE | WP-05 | Architect, Knowledge Capture | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-07 | Findings to bug and backlog records, with triage | DONE | WP-06 | QA, Reviewer, Architect | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-08 | Documentation verification and review | DONE | WP-06 | QA, Reviewer | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |
| WP-09 | Integration, Obsidian sync and cleanup | DONE | WP-07, WP-08 | Integrator, Release/DevOps | agent/knowledge-monorepo-app-documentation | 88e0259 | PASS | see below | PASS | MERGED |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `docs/knowledge/product/`, `docs/knowledge/architecture/` and `docs/knowledge/modules/` are the established homes for durable app knowledge, and no `docs/knowledge/apps/` folder should be created | `scripts/lib/obsidian-mappings.mjs:17-43` — only these folders have vault mappings; a new folder would be written but never published | HIGH | New notes would be invisible in Obsidian, which is half the task's objective |
| A-02 | The Obsidian vault is reachable and configured locally | `node scripts/retrieve-knowledge.mjs` reported `OBSIDIAN_CONTEXT = AVAILABLE (D:/My Work/hrm-dijipeople/DijiPeople-Vault)` | HIGH | `OBSIDIAN_SYNC_STATUS` becomes `SKIPPED_NO_LOCAL_CONFIG`; repository knowledge still lands |
| A-03 | A documentation-only change may be made on a branch in the primary checkout rather than a dedicated worktree | `docs/development/git-worktrees.md:186-189` — worktrees are for genuinely concurrent work; the primary checkout was verified clean (`DIRTY_PATHS 0`) at `78072d2` | HIGH | Nothing; the branch/PR/CI path is identical either way |
| A-04 | `apps/agent-desktop` is covered by the CI `typecheck` and `build` jobs by virtue of being an `apps/*` workspace with `check-types` and `build` scripts | `package.json` workspaces `apps/*`; `apps/agent-desktop/package.json` declares both; `.github/workflows/ci.yml` runs `npm run typecheck` and `npm run build` through Turborepo | MEDIUM | A claim about CI coverage in the new knowledge would be wrong — verified directly rather than assumed |

## Owner Decisions

Genuine product or business questions only.

Two, both genuine product questions an agent must not answer alone. Neither
blocked any work package.

1. **Is the desktop agent's telemetry consent model adequate?** It captures the
   foreground application name and **window title**, plus a derived browser tab
   title, and queues them to a plaintext file holding up to 5,000 events.
   Whether that is acceptable, and what employees are told, is a policy
   decision — see [[desktop-agent]].
2. **Do the agent's utilisation figures inform pay, performance review or
   client billing?** The answer sets the true severity of
   [[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]],
   which is currently rated HIGH on the assumption that they do not.

## Repository Health

PRE_TASK_REPO_HEALTH = PASS — `node scripts/repo-health.mjs` at `78072d2`,
`MAIN_SYNC_STATUS = SYNCED`, `DIRTY_PATHS 0`, no unfinished Git operations, no
stale worktrees.

POST_TASK_REPO_HEALTH = PASS — re-run after the merge at `aed886e`:
`MAIN_SYNC_STATUS = SYNCED`, local main == origin/main == the merged SHA,
`DIRTY_PATHS 0`, no unfinished Git operations, no stale worktrees.

## History

- 2026-08-16 — created at `78072d2`.
- 2026-08-16 — merged as `aed886e` via PR #19, CI run `31958009868`.
  Record ids renumbered mid-flight after a concurrent branch took BUG-0030 and
  ITEM-0025. Obsidian sync verified on disk. FINAL_STATUS COMPLETE.
