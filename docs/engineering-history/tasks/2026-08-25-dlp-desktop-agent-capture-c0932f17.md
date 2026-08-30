# Engineering History — DLP capture for the desktop agent

| | |
|---|---|
| **Task Title** | DLP capture for the desktop agent |
| **Task Type** | FEATURE (SECURITY) |
| **Date** | 2026-08-25 |
| **Architect Plan** | [`docs/plans/EXECPLAN-0022-dlp-desktop-agent-capture.md`](../../plans/EXECPLAN-0022-dlp-desktop-agent-capture.md) (`PLAN-022`), under [[TASK-0020]] |
| **Agents Used** | Database, Backend/API, Security, Integration, Frontend, QA. Deliberately not used: Release/DevOps — `develop` only, `main` untouched; the owner promotes to production. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/dlp-desktop-agent` |
| **Base SHA** | `bb740183` (origin/develop at task start) |
| **Final Task SHA** | `c0932f177a6ae26a26ebf2824cf3eaeeb4f4b670` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — `develop` fast-forwarded (ref-push `agent/dlp-desktop-agent:develop`), so the target tip equals the CI-verified SHA exactly. |
| **Final Target SHA** | `c0932f17` |

### Commits

```
c0932f17 fix(dlp): register DLP models for tenant erasure, runtime schema, lint
78dd7bc5 feat(web): DLP tenant config and investigator review UI (WP-05)
728b3c2b test(api): validate DLP capture payloads against the DTOs (WP-06)
c372fc90 feat(agent-desktop): wire DLP capture into the running agent (WP-04)
c9433eb5 feat(api): DLP capture ingest, review and RBAC (WP-02, WP-03)
e5389893 feat(prisma): DLP capture schema and migration (WP-01)
cd23ac79 feat(agent-desktop): DLP capture config and detection core (WP-04)
415436d3 docs(dlp): TASK-0020 plan and work packages
(plus docs commits and two merges: origin/develop, then origin/main)
```

### Files Changed

29 source files, +3112 / -138, plus `services/api/prisma/schema.prisma`
(4 models, 1 enum, 5 columns, 4 Tenant relations), the migration
`20260825120000_dlp_capture`, the regenerated
`packages/config/platform-runtime-schema.generated.json`, and the TASK-0020 /
PLAN-022 records. Principal new modules:

- `apps/agent-desktop/src/main/dlp/` — `clipboard-watcher`, `rule-evaluator`,
  `dlp-manager`, `electron-adapters` (+ specs).
- `services/api/src/modules/agent/dlp/` — `dlp.service`, `dlp.controller`,
  `dlp.service.spec`; `dto/dlp-capture.dto.ts`.
- `apps/web/app/(authenticated)/dlp-review/` and the DLP settings section.

## Conflicts

Two merges were performed to bring the stale branch (16 behind) up to date and
to satisfy `DEVELOP_CONTAINS_MAIN`:

1. **`origin/develop` into the branch** — conflicts in four *generated* index
   files only: `docs/tasks/active.md`, `docs/tasks/index.md`,
   `docs/sessions/index.md`, `docs/knowledge/dashboards/Engineering Control Center.md`.
   No source-code conflicts (schema.prisma, permissions.ts, rbac-matrix.ts all
   auto-merged).
2. **`origin/main` into the branch** — clean (main and develop were
   content-identical; main was one content-empty release/merge commit ahead).

## Conflict Resolutions

For the four generated indexes, the resolution was **take develop's side, then
regenerate from the record files** (`rebuild-tasks`, `rebuild-sessions`,
`generate-dashboards`). Choosing my branch's side instead would have dropped the
other sessions' records that landed on develop while this task ran; regenerating
from the source-of-truth records folds in both my TASK-0020 / SESSION-0050 and
theirs. These files are generated, so a hand-merge of either side would have been
overwritten by the next generator run anyway — regeneration is the only correct
resolution.

## QA

| | |
|---|---|
| **QA Report** | Covered by unit + contract specs (below); no separate `docs/qa/runs` entry — this is a new capability with no prior QA plan, and its invariants are pinned by tests rather than a manual run. |
| **Bug IDs** | None created or closed. |
| **Backlog Items** | None. The ExecPlan's follow-ups (screenshot body-size limit; wiring the monitoring-consent legal document) are noted in code comments and the ExecPlan, not yet filed as ITEMs. |

Tests added/verified: `dlp.service.spec` (7 — server-enforced flags, consent
gate, full-content vs metadata, over-cap, replay dedupe, audited read);
`rule-evaluator.spec`, `clipboard-watcher.spec`, `dlp-manager.spec`,
`config-manager.spec` (agent detection + config); `agent-client-contract.spec`
(the DLP payloads against the DTOs — the BUG-0035 guarantee);
`tenant-erasure.constants.spec` (the four DLP models registered for erasure).

## CI

| | |
|---|---|
| **CI Run ID** | `32869165168` |
| **CI Result** | PASS — read on the exact merged SHA `c0932f17`. |

The first run (`fa8b6c52`) FAILED on three checks that the local environment
could not reproduce: `tenant-erasure.constants.spec` (the four new tenant-owned
models were unregistered), the stale `platform-runtime-schema.generated.json`,
and 5 ESLint `unbound-method` errors in the DLP spec. All three were fixed in
`c0932f17` and re-verified locally before the re-run went green.

## Post-Merge Validation

`develop` fast-forwarded to `c0932f17` — the merged SHA is byte-for-byte the
CI-verified SHA (no merge commit, so no unverified integrated result exists).
`origin/develop` now contains `origin/main` (`DEVELOP_CONTAINS_MAIN` resolved).

## Release / Deployment Impact

None — not deployed. `main` is `UNTOUCHED`; the feature ships to production only
when the owner promotes `develop`. All capture is defaulted **off**, so the
merge changes no runtime behaviour until a tenant enables it.

## Knowledge Capture

[`docs/knowledge/framework/migrate-diff-around-schema-drift-2026-08-25.md`](../../knowledge/framework/migrate-diff-around-schema-drift-2026-08-25.md)
— authoring a Prisma migration with `migrate diff base→edited` to isolate the
delta when `migrate dev` is non-interactive and the repo carries schema/migration
drift. Also captured in memory: the DLP architecture and the throwaway-DB
convention ([`docs/development/local-throwaway-database.md`](../../development/local-throwaway-database.md)).

## Obsidian Sync

`node scripts/knowledge:sync` requires a local vault config that is not present
in this environment; sync is NOT_REQUIRED here and runs wherever the vault is
configured. The Git-tracked knowledge note and records above are the durable
record.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/DijiPeople-dlp` removed after
integration; session SESSION-0050 marked COMPLETE. The primary checkout was
never written by this task and stays clean.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0035]] · [[PLAN-022]] · [[SESSION-0050]] · [[TASK-0020]]

<!-- GRAPH:END -->
