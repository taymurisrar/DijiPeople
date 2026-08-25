---
TASK_ID: TASK-0020
aliases: [TASK-0020]
TITLE: DLP capture for desktop agent: clipboard and triggered screenshots
TYPE: SECURITY
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-24
AFFECTED_MODULES: [apps/agent-desktop, services/api/src/modules/agent, services/api/prisma]
AGENTS: [database, backend, security, integration, frontend, qa]
DEPENDENCIES:
CURRENT_PACKAGE: WP-04
COMPLETED_PACKAGES: [WP-01]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 4
FINAL_STATUS:
---

# TASK-0020 — DLP capture for desktop agent: clipboard and triggered screenshots

## Objective

A tenant can enable clipboard capture and rule-triggered screenshot capture on
the desktop agent to investigate data exfiltration (the WhatsApp-share
incidents). Captured content is stored encrypted, scoped to the tenant, readable
only under a new `dlp.review` permission with every read audited, and purged by
the existing retention job. Keylogging remains impossible; the employee always
sees when capture is active. Done when the ExecPlan's Definition of Done is
fully checked and the work is integrated into `develop`.

Full design: [[EXECPLAN-0022-dlp-desktop-agent-capture]] (`PLAN-022`).
Owner decisions recorded in the ExecPlan's Business requirement section.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Schema, migration, settings columns | DONE | — | database | agent/dlp-desktop-agent | e538989 | n/a | local | — | UNMERGED |
| WP-02 | API capture ingest (clipboard + screenshot) | READY | WP-01 (done) | backend | agent/dlp-desktop-agent | — | — | — | — | — |
| WP-03 | API review surface + `dlp.review` RBAC + audit | READY | WP-01 (done) | security | agent/dlp-desktop-agent | — | — | — | — | — |
| WP-04 | Agent capture (clipboard, rule evaluator, screenshot, tray indicator, config flags) | IN_PROGRESS | — | integration | agent/dlp-desktop-agent | cd23ac7 | — | — | — | — |
| WP-05 | Tenant DLP config + investigator review UI | NOT_STARTED | WP-01, WP-02, WP-03 | frontend | agent/dlp-desktop-agent | — | — | — | — | — |
| WP-06 | Contract spec + QA + end-to-end | NOT_STARTED | WP-02, WP-03, WP-04 | qa | agent/dlp-desktop-agent | — | — | — | — | — |

WP-04 is PARALLEL_SAFE (mocked endpoint, agreed DTO shapes) and is the starting
package while the WP-01 database credential is obtained.

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The heartbeat queue/batch path can carry a new event kind without a second transport | `session-manager.ts`, `offline-queue.ts`, `api-client.ts` already batch + retry generic events | HIGH | Would need a separate sender; more surface, same idempotency need |
| A-02 | `StorageService` + `SecretEncryptionService` are sufficient for encrypted screenshot bytes at rest | `storage.service.ts`, release-download streaming precedent | HIGH | Would need a new blob/crypto path |
| A-03 | Electron `clipboard` + `desktopCapturer` are available in the agent's Electron 39 main process | `electron@39.2.6` in `apps/agent-desktop/package.json` | HIGH | Screenshot/clipboard capture needs a native addon instead |
| A-04 | The BUG-0036 `dedupeKey` NULL-excluded-unique pattern applies unchanged to the new event tables | `ActivityEvent.dedupeKey` at `schema.prisma:10627` | HIGH | Replays double-record; investigator counts wrong |

## Owner Decisions

Recorded via `AskUserQuestion`, 2026-08-25. Full context in
[[EXECPLAN-0022-dlp-desktop-agent-capture]] › Business requirement.

1. **Keylogging — dropped.** Clipboard + triggered screenshots only;
   `allowKeylogging` stays hardcoded off.
2. **Capture depth — full content.** Store clipboard text and full screenshots,
   not only metadata. (Higher exposure accepted; see ExecPlan Risk 1.)
3. **Prevention — record only.** Observe and report; no block/warn this task
   (`DlpRule.action` designed to add it later without a migration).
4. **Consent — tenant toggle only.** No per-employee acknowledgement required;
   the consent gate is still built and defaulted off, and the visible
   active-capture indicator ships regardless. (Legal defensibility flagged;
   ExecPlan Risk 2.)

## Repository Health

- PRE_TASK_REPO_HEALTH — clean start. Base `origin/develop @ bb740183`; primary
  checkout carried only the user's two pre-existing files
  (`apps/landing/next-env.d.ts`, `services/api/prisma/seed-legal.ts`), untouched.
- Work is on `agent/dlp-desktop-agent` in a dedicated worktree; the primary
  checkout is not written. MAIN_CHANGE_STATUS = UNTOUCHED (ordinary task).
- POST: task IN_PROGRESS — WP-04 core landed on the branch (not yet integrated
  to `develop`); WP-01 BLOCKED on a throwaway `DATABASE_URL`.

## Status Notes

- **WP-01 done** (`e538989`): four DLP models + `DlpRuleAction` enum + five
  `AgentTrackingSettings` columns, migration `20260825120000_dlp_capture`
  authored via `prisma migrate diff` (to isolate the delta from pre-existing
  schema/migration drift) and applied clean against a local throwaway DB —
  `prisma migrate status` reports up to date. `prisma generate` deliberately not
  run locally (shared junctioned `node_modules`; CI regenerates). Throwaway DB
  and the convention documented in
  [`docs/development/local-throwaway-database.md`](../development/local-throwaway-database.md).
- **WP-02 and WP-03 are now READY** (WP-01 satisfied).
- WP-04 partial (`cd23ac7`, 67/67 agent-desktop tests green): config plumbing +
  `ClipboardWatcher` + `DlpRuleEvaluator`. Still in WP-04: the orchestrator, the
  `desktopCapturer` screenshot, the tray active-capture indicator, `ApiClient`
  send methods, and the `session-manager` wiring — aligned to the WP-02 contract.
- Not yet integrated to `develop` (branch `agent/dlp-desktop-agent`); all changes
  are additive and inert until wired.

## History

- 2026-08-24 — created at `bb740183`.
- 2026-08-25 — ExecPlan `PLAN-022`; WP-04 detection core at `cd23ac7`;
  WP-01 schema + migration at `e538989`; throwaway DB `dijipeople_dlp_test`
  created and documented.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0036]]

<!-- GRAPH:END -->
