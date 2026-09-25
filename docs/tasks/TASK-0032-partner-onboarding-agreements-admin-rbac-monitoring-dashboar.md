---
TASK_ID: TASK-0032
aliases: [TASK-0032]
TITLE: Partner onboarding, agreements, admin RBAC, monitoring, dashboard and MFA hardening
TYPE: FEATURE
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-09-25
AFFECTED_MODULES: [super-admin, platform-runtime, platform-auth, platform-users, auth, partners, partner-experience, leads, contracts, error-logs, platform-monitoring, dashboard, apps/admin, apps/web, apps/landing]
AGENTS: [architect, database, backend-api, frontend, ui-ux, security, qa, reviewer, integrator, release-devops, knowledge-graph]
DEPENDENCIES: WP-03 depends on WP-01, WP-02; WP-05, WP-06, WP-07 depend on WP-01; WP-08 depends on WP-02; WP-09 depends on WP-01..WP-08
CURRENT_PACKAGE: WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08
COMPLETED_PACKAGES: [WP-00, WP-01]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS:
---

# TASK-0032 — Partner onboarding, agreements, admin RBAC, monitoring, dashboard and MFA hardening

## Objective

Leave DijiPeople with one coherent platform privilege model (ADR-0018) in which
a Platform Super Admin and a Platform Admin can manage tenants and the other
admin entities through audited, validated operations; a partner lifecycle whose
partner types have defined behaviour, duplicates are handled and every change is
audited; agreements whose placeholders follow their context (ADR-0020) and whose
signed documents are immutable and carry the real signature; standard TOTP MFA
for tenant and platform users (ADR-0019); a monitoring page built for incident
investigation; and an operations dashboard built only from real data. The task
is finished when every record it filed is `FIXED`/`DONE` or explicitly triaged,
the work is integrated into `develop` behind a green exact-SHA CI gate, verified
in a browser on a throwaway local stack, and `main` and production are untouched.

**Production is out of scope by owner instruction:** no deploy, migration, seed,
or data change against production, and no promotion to `main`.

## Work DONDONIN_PROGRESIN_PROGRESIN_PROGRESIN_PROGRESIN_PROGRESIN_PROGRESIN_PROGRESSackages

ff5005b5 10d5d148        | WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-00 | Discovery, records, ADR-0018..0020, ExecPlan | DONE | — | architect, qa | agent/partner-agreements-admin-hardening | ff5005b5 | — | see records-map | — | — |
| WP-01 | Schema: MFA, platform lockout, error module, signature style, role consolidation migration | DONE | — | database | agent/pah-wp01-schema | 10d5d148 | — | — | — | — |
| WP-02 | Platform RBAC and Super Admin: permission-only platform authorization, tenant edit, heartbeat, role consolidation | IN_PROGRESS | — | backend-api, security, frontend | agent/pah-wp02-rbac | — | — | — | — | — |
| WP-03 | TOTP MFA for web and admin, platform lockout, TTL parsing | IN_PROGRESS | WP-01, WP-02 | backend-api, security, frontend | agent/pah-wp03-mfa | — | — | — | — | — |
| WP-04 | Partner domain: type behaviour policy, duplicates, audit, lead attribution UX | IN_PROGRESS | — | backend-api, frontend | agent/pah-wp04-partners | — | — | — | — | — |
| WP-05 | Agreements: contextual placeholders, source guards, audit, signature rendering, agreement UX | IN_PROGRESS | WP-01 | backend-api, frontend | agent/pah-wp05-agreements | — | — | — | — | — |
| WP-06 | Monitoring and observability: health overview, grouped errors, correlation, redaction | IN_PROGRESS | WP-01 | backend-api, frontend | agent/pah-wp06-monitoring | — | — | — | — | — |
| WP-07 | Platform operations dashboard | IN_PROGRESS | WP-01 | backend-api, frontend, ui-ux | agent/pah-wp07-dashboard | — | — | — | — | — |
| WP-08 | Admin CRUD and tenant management sweep: error UX, tenant edit UX, boundaries | IN_PROGRESS | WP-02 | frontend, qa | agent/pah-wp08-admin-crud | — | — | — | — | — |
| WP-09 | Integration: security regression, e2e, browser QA, docs, review, CI, develop | NOT_STARTED | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08 | qa, reviewer, integrator, knowledge-graph | agent/partner-agreements-admin-hardening | — | — | — | — | — |

Package files: [`TASK-0032-streams/`](TASK-0032-streams/). Discovery evidence:
`TASK-0032-streams/discovery/D1..D6`. ExecPlan: EXECPLAN-0051.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The account the owner calls "Super Admin" hits the tenant-edit failure as a `PLATFORM_ADMIN`/`PLATFORM_OPERATIONS` role, or through the heartbeat dialog; a literal `SUPER_ADMIN` saves successfully | Live reproduction 2026-09-25 on a throwaway stack (API 200 for SUPER_ADMIN, 403 for PLATFORM_ADMIN; UI save as SUPER_ADMIN shows "saved.") — production role of the owner's account not read (production out of bounds) | MEDIUM | If a literal SUPER_ADMIN is refused in production for a data reason, the fix here would not cover it; mitigated by fixing every refusal path found and pinning per-role tests |
| A-02 | Production TTL variables use duration strings (`15m`), so the numeric-TTL defect affects local environments only | `docs/environment-variables.md:167-218` | MEDIUM | Production admin sessions would already be unusable, which contradicts daily use |
| A-03 | Agreements are a platform-only surface; tenant admins have no agreement access by design | D3 §2, scenario 26 | HIGH | Tenant-admin agreement scenarios would need a new surface |
| A-04 | The partner portal lives at `apps/web/app/partner/` and signing at `apps/landing/app/sign/[token]` | D2 item 6, D3 §5 | HIGH | Browser journeys would target the wrong app |

## Owner Decisions

1. **Should MFA be mandatory for platform users?** Implemented as available and
   optional (ADR-0019); switching it to mandatory is a one-line policy change.
   Non-blocking — recorded for the owner, not asked mid-task.

## Repository Health

- PRE_TASK_REPO_HEALTH — 2026-09-25: primary checkout clean on `develop`, fast-forwarded to `75fec5b9` (was 112 behind, 0 ahead); `main` 50 commits behind origin (not touched); three other worktrees dirty (other sessions, not touched); `render.yaml` differs from the live service on 31 fields (not in scope). No other active session.
- POST_TASK_REPO_HEALTH — pending.

## History

- 2026-09-25 — created at `75fec5b9`; SESSION-0106 registered; worktree `dp-partner-admin`; throwaway database `dijipeople_pah_test` migrated and seeded.
- 2026-09-25 — six read-only discovery reports (D1..D6). Live reproduction on the throwaway stack confirmed the tenant-edit refusal for `PLATFORM_ADMIN`/`PLATFORM_OPERATIONS`, found the heartbeat 403 dialog and the one-second token TTL trap. ADR-0018, ADR-0019, ADR-0020 accepted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Modules — [[super-admin]], [[platform-auth]], [[auth]], [[partners]], [[leads]]

<!-- GRAPH:END -->
- 2026-09-25 — WP-01 committed at `10d5d148` (additive migration applied to the throwaway DB; `qrcode` added). WP-00 committed at `ff5005b5` (BUG-3544..3555, ITEM-0197..0200, ADR-0018..0020, EXECPLAN-0051). WP-02..WP-08 started in parallel worktrees `dp-pah-wp02`..`dp-pah-wp08` under COMMON-RULES.md.
