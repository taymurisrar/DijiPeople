---
TASK_ID: TASK-0032
aliases: [TASK-0032]
TITLE: Partner onboarding, agreements, admin RBAC, monitoring, dashboard and MFA hardening
TYPE: FEATURE
SIZE: PROGRAM
STATUS: COMPLETE
PRIORITY: P1
CREATED_AT: 2026-09-25
AFFECTED_MODULES: [super-admin, platform-runtime, platform-auth, platform-users, auth, partners, partner-experience, leads, contracts, error-logs, platform-monitoring, dashboard, apps/admin, apps/web, apps/landing]
AGENTS: [architect, database, backend-api, frontend, ui-ux, security, qa, reviewer, integrator, release-devops, knowledge-graph]
DEPENDENCIES: WP-03 depends on WP-01, WP-02; WP-05, WP-06, WP-07 depend on WP-01; WP-08 depends on WP-02; WP-09 depends on WP-01..WP-08
CURRENT_PACKAGE: 
COMPLETED_PACKAGES: [WP-00, WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10, WP-11, WP-12]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS: COMPLETE_WITH_WARNINGS — integrated into develop and released to production at b586ac0a (PR #81, CI required gate PASS on 293c643f); API, web, admin and landing deploys live on b586ac0a; both migrations applied; pre-release production checks clear (ITEM-0205); deferred with disposition: BUG-3220, BUG-3231, BUG-3588, ITEM-0200, ITEM-0201
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

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-00 | Discovery, records, ADR-0018..0020, ExecPlan | DONE | — | architect, qa | agent/partner-agreements-admin-hardening | ff5005b5 | — | see records-map | — | — |
| WP-01 | Schema: MFA, platform lockout, error module, signature style, role consolidation migration | DONE | — | database | agent/pah-wp01-schema | 10d5d148 | — | — | — | MERGED |
| WP-02 | Platform RBAC and Super Admin: permission-only platform authorization, tenant edit, heartbeat, role consolidation | DONE | — | backend-api, security, frontend | agent/pah-wp02-rbac | 3b2dbf6e | PASS | BUG-3544, BUG-3545, BUG-3547 | — | MERGED |
| WP-03 | TOTP MFA for web and admin, platform lockout, TTL parsing | DONE | WP-01, WP-02 | backend-api, security, frontend | agent/pah-wp03-mfa | cc95bfbf | PASS | BUG-3146, BUG-3548, BUG-3567 | — | MERGED |
| WP-04 | Partner domain: type behaviour policy, duplicates, audit, lead attribution UX | DONE | — | backend-api, frontend | agent/pah-wp04-partners | a7aa2974 | PASS | BUG-3549, BUG-3550, BUG-3551, BUG-3566 | — | MERGED |
| WP-05 | Agreements: contextual placeholders, source guards, audit, signature rendering, agreement UX | DONE | WP-01 | backend-api, frontend | agent/pah-wp05-agreements | bdb168d7 | PASS | BUG-3231, BUG-3552, BUG-3553, BUG-3554 | — | MERGED |
| WP-06 | Monitoring and observability: health overview, grouped errors, correlation, redaction | DONE | WP-01 | backend-api, frontend | agent/pah-wp06-monitoring | 69213a72 | PASS | BUG-3227, BUG-3555, ITEM-0198 | — | MERGED |
| WP-07 | Platform operations dashboard | DONE | WP-01 | backend-api, frontend, ui-ux | agent/pah-wp07-dashboard | 52951c8e | PASS | ITEM-0199 | — | MERGED |
| WP-08 | Admin CRUD and tenant management sweep: error UX, tenant edit UX, boundaries | DONE | WP-02 | frontend, qa | agent/pah-wp08-admin-crud | 8ad8f62b | PASS | BUG-3220, BUG-3546, BUG-3564, BUG-3565, BUG-3566, BUG-3567 | — | MERGED |
| WP-09 | Integration: security regression, e2e, browser QA, docs, review, CI, develop | DONE | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08 | qa, reviewer, integrator, knowledge-graph | agent/partner-agreements-admin-hardening | dfe42ea9 | PASS | BUG-3597, BUG-3598, BUG-3599 | PASS (run 36159588565) | develop ref-pushed to dfe42ea9 |
| WP-10 | Platform audit trail: read endpoints for PlatformAuditLog, admin bulk-delete tier fix | DONE | WP-02 | backend-api, frontend | agent/pah-wp10-audit-trail | 8a7c6c5c | PASS | BUG-3564 | — | MERGED |
| WP-11 | Agreement QA fixes: placeholder rendering, signature dates, template signature blocks, partner placeholders | DONE | WP-05, WP-09 | backend-api | agent/pah-wp11-agreement-qa-fixes | fa3cf1d7 | PASS | BUG-3580, BUG-3581, BUG-3582, BUG-3583, BUG-3584 | — | MERGED |
| WP-12 | Architecture documentation | DONE | WP-02 | architect | agent/partner-agreements-admin-hardening | 53c44f04 | — | — | — | MERGED |

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
- 2026-09-25 — WP-01..WP-08, WP-10..WP-12 finished on their branches and merged into the task branch; owner decisions recorded as ADR-0021 (countersign line only when DijiPeople signs; platform MFA optional; legal publishing Super Admin only).
- 2026-09-25 — integration QA on the throwaway stack; agreement re-verification found and fixed BUG-3597 (drawn signature dropped from the signed PDF/DOCX), BUG-3598 (regenerated executed copy ignored the evidence), BUG-3599 (unsupported format 500).
- 2026-09-25 — CI run 36157494919 on `1e287b8f` failed (axe scrollable region on the admin dashboard; stale `@nestjs/core` advisory disposition); fixed in `dfe42ea9`; CI run 36159588565 PASS; `develop` ref-pushed to `dfe42ea9`. `main` untouched.
- 2026-09-26 — released on the owner's instruction: read-only production checks clear (ITEM-0205); PR #81 merged `develop` into `main` as `b586ac0a`; Render pre-deploy applied both migrations and the deploy went live; `/api/health` reports `b586ac0`; web, admin and landing READY on `b586ac0a`; `develop` fast-forwarded to `main`. Neon data-transfer quota incident found in deploy history and filed as ITEM-0208.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3146]], [[BUG-3220]], [[BUG-3227]], [[BUG-3231]], [[BUG-3544]], [[BUG-3545]], [[BUG-3546]], [[BUG-3547]], [[BUG-3548]], [[BUG-3549]], [[BUG-3550]], [[BUG-3551]], [[BUG-3552]], [[BUG-3553]], [[BUG-3554]], [[BUG-3555]], [[BUG-3564]], [[BUG-3565]], [[BUG-3566]], [[BUG-3567]], [[BUG-3580]], [[BUG-3581]], [[BUG-3582]], [[BUG-3583]], [[BUG-3584]], [[BUG-3588]], [[BUG-3597]], [[BUG-3598]], [[BUG-3599]], [[ITEM-0198]], [[ITEM-0199]], [[ITEM-0200]], [[ITEM-0201]], [[ITEM-0205]], [[ITEM-0208]]
- Modules — [[super-admin]], [[platform-auth]], [[auth]], [[partners]], [[leads]]

<!-- GRAPH:END -->
- 2026-09-25 — WP-01 committed at `10d5d148` (additive migration applied to the throwaway DB; `qrcode` added). WP-00 committed at `ff5005b5` (BUG-3544..3555, ITEM-0197..0200, ADR-0018..0020, EXECPLAN-0051). WP-02..WP-08 started in parallel worktrees `dp-pah-wp02`..`dp-pah-wp08` under COMMON-RULES.md.
- 2026-09-25 — WP-02..WP-08 merged into the task branch (`3b2dbf6e`, `cc95bfbf`, `a7aa2974`, `bdb168d7`, `69213a72`, `52951c8e`, `8ad8f62b`). WP-10 (platform audit trail, `8a7c6c5c`), WP-11 (agreement QA fixes from WP-09 live QA, `fa3cf1d7`) and WP-12 (architecture docs, `53c44f04`) merged. The records clerk pass fixed this file's corrupted "Work Packages" heading and an orphaned line of stray commit shas left ahead of the table header, folded every staged regression entry (REG-525..REG-626) into the register, filed and closed the QA findings from WP-09's live-QA pass, and gave every REG-520+ entry a reusable QA scenario. WP-09 (integration) is IN_PROGRESS.
