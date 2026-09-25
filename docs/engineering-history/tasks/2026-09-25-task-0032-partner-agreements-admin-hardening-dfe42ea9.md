# Engineering History — Task 0032 partner agreements admin hardening

| | |
|---|---|
| **Task Title** | TASK-0032 — Partner onboarding, agreements, admin RBAC, monitoring, dashboard and MFA hardening |
| **Task Type** | FEATURE (PROGRAM size; BUG, SECURITY, UI/UX, DATABASE and DOC work inside it) |
| **Date** | 2026-09-25 |
| **Architect Plan** | `docs/plans/EXECPLAN-0051-partner-agreements-admin-rbac-monitoring-dashboard-mfa.md`; ADR-0018 (platform privilege model), ADR-0019 (TOTP MFA), ADR-0020 (context-aware placeholders), ADR-0021 (owner decisions) |
| **Agents Used** | Architect (orchestration, discovery synthesis, integration, re-verification); Database (WP-01); Backend/API + Security (WP-02, WP-03, WP-10); Backend/API + Frontend (WP-04..WP-08, WP-11); UI/UX (WP-07 dashboard); QA (journeys, authorization matrix, agreements re-verification); Reviewer (per-package review); Integrator; Release/DevOps (CI, advisory disposition); Knowledge & Graph. Not used: none of the thirteen roles was skipped; no deployment work was in scope. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/partner-agreements-admin-hardening` |
| **Base SHA** | `75fec5b95651e2e1aab124a26895abd89c13cc9a` |
| **Final Task SHA** | `dfe42ea9344ec1d5a4a1c6aa36376b978a681cbd` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `develop` was ref-pushed to the CI-verified task tip `dfe42ea9`. |
| **Final Target SHA** | `dfe42ea9344ec1d5a4a1c6aa36376b978a681cbd` (the closure commits that follow this record are integrated the same way) |

### Commits

```
10d5d148 feat(db): MFA, platform sign-in lockout, error module and typed-signature style (TASK-0032 WP-01)
ff5005b5 docs(task): TASK-0032 plan, decisions, discovery and records (WP-00)
6e27aa37 fix(auth): a bare-integer TTL means seconds for the token too (BUG-3548)
d19e62b6 fix(auth): lock platform sign-in after repeated failures (BUG-3146)
5b46d850 feat(auth): RFC 6238 TOTP and recovery-code primitives (ADR-0019)
bc2f9592 fix(platform-rbac): authorize platform routes by platform permission only (BUG-3544, ADR-0018)
01672ca2 fix(auth): session heartbeat needs a session only; background failures never raise the dialog (BUG-3545)
9acbb72e wip(TASK-0032 WP-03): checkpoint uncommitted work after a session interruption
63ebc122 wip(TASK-0032 WP-02): checkpoint uncommitted work after a session interruption
7928c02c wip(TASK-0032 WP-05): checkpoint uncommitted work after a session interruption
5dfb4de4 wip(TASK-0032 WP-04): checkpoint uncommitted work after a session interruption
c45da293 wip(TASK-0032 WP-06): checkpoint uncommitted work after a session interruption
11c74257 wip(TASK-0032 WP-07): checkpoint uncommitted work after a session interruption
9baf16e1 wip(TASK-0032 WP-08): checkpoint uncommitted work after a session interruption
1fbcfd97 fix(e2e): correct admin CRUD harness fixtures found during a live run
d67e7821 feat(auth): MFA service, endpoints and sign-in challenge (ADR-0019)
d58f1330 wip(TASK-0032 WP-02): checkpoint after a second session interruption
9a7ac0e2 wip(TASK-0032 WP-05): checkpoint after a second session interruption
9f3c3dd5 wip(TASK-0032 WP-04): checkpoint after a second session interruption
31d57471 wip(TASK-0032 WP-06): checkpoint after a second session interruption
72dd4d05 wip(TASK-0032 WP-07): checkpoint after a second session interruption
0ec7fd3a wip(TASK-0032 WP-08): checkpoint after a second session interruption
3b2dbf6e docs(qa): regression entries for the platform role list and RolesGuard (BUG-3547, BUG-3544)
579c57ed docs(tasks): file the WP-07 platform operations dashboard report
d6746868 fix(e2e): stop misreporting duplicate-onboarding and add view-404 finding
e7d353ee fix(contracts): update pre-existing specs for the async placeholder API and new constructor arg
94d2dfbd fix(admin): drop the `as never` cast on LeadAttributionPanel's record prop
86be0253 fix(e2e): support-cases belongs in UPDATE_CAPABLE
392913e8 fix(landing): stop asking an individual partner for a company registration number
95695851 test(auth): MfaService lifecycle, replay, recovery codes, reset scope (ADR-0019)
10a78518 fix(tenant-erasure): erase MFA recovery codes with the tenant (TASK-0032 WP-01)
d5535f0a merge: TASK-0032 WP-02 platform RBAC (ADR-0018) into the task branch
d7ce82fc feat(admin): monitoring health tiles, incident detail panel, and route boundaries
aaa2b05a docs(tasks): file the WP-02 report and per-route authorization mapping (TASK-0032)
c09cfe71 wip(TASK-0032 WP-03): checkpoint after a third session interruption
cbe749ce wip(TASK-0032 WP-04): checkpoint after a third session interruption
8c51981c wip(TASK-0032 WP-05): checkpoint after a third session interruption
22459656 wip(TASK-0032 WP-07): checkpoint after a third session interruption
91c5e11f wip(TASK-0032 WP-08): checkpoint after a third session interruption
8ad8f62b docs(tasks): file the WP-08 report
20027574 test(auth): sign-in MFA challenge and platform reset authorization (ADR-0019)
b967aae1 merge: TASK-0032 WP-08 admin CRUD sweep into the task branch
52951c8e docs(tasks): correct the operations endpoint path and record the full-suite result
c20e3418 wip(TASK-0032 WP-03): checkpoint after a session interruption
1ad7aa7d wip(TASK-0032 WP-04): checkpoint after a session interruption
c03d0d33 wip(TASK-0032 WP-06): checkpoint after a session interruption
c6fb718d merge: TASK-0032 WP-07 platform operations dashboard into the task branch
7c460b98 feat(web): sign-in route passes MFA challenges through without cookies (ADR-0019)
7b8fc644 feat(web): MFA step on the sign-in screen (ADR-0019)
d80ab317 test(api): allowlist PlatformHealthController in the authorization wiring invariant
64ef347c test(contracts): prove the source guards, context gate, template refusal and audit wiring at the service level
9ab6f226 feat(web): My Profile MFA card and administrator Reset MFA (ADR-0019)
69213a72 docs(tasks): file the WP-06 monitoring report
a49f0983 feat(web): tenant security setting to require two-factor authentication (ADR-0019)
e96ce7c0 test(contracts): prove the placeholder-artifact guard, typed-style fonts and drawn-image embedding
f8336e65 fix(auth): audit every platform sign-in outcome (TASK-0032 WP-07 finding)
e052b2d3 docs(bugs): file BUG-3564..3567 and ITEM-0201 from the admin CRUD sweep (TASK-0032)
aa9b3132 wip(TASK-0032 WP-03): checkpoint after a connection drop
2ee8c5c7 wip(TASK-0032 WP-05): checkpoint after a connection drop
eb172564 wip(TASK-0032 WP-04): checkpoint after a connection drop
9abb01f4 merge: TASK-0032 WP-06 monitoring and observability into the task branch
8b247f2e feat(admin): sign-in route passes MFA challenges through; MFA route handlers (ADR-0019)
db36f3e3 docs(qa): file WP-05 regression entries REG-560..REG-574
e2cfbdcb docs(qa): append REG-560 for BUG-3566 (UpdatePartnerDto was never partial)
b06d294b feat(admin): MFA sign-in step, Security page card and Reset MFA (ADR-0019)
b67439f0 test(contracts): prove the null-actor signing audit and the passive signature expiry transition
a7aa2974 docs(tasks): file the WP-04 report for TASK-0032 (partner domain)
0149bef6 fix(platform-runtime): open contract templates and signature requests by id (BUG-3565)
7f134e70 merge: TASK-0032 WP-04 partner domain into the task branch
33bc4ecf docs(tasks): TASK-0032 WP-03 report
bdb168d7 docs(tasks): file the WP-05 agreements report
cc95bfbf fix(tenant-control-plane): erase UserMfaRecoveryCode with the tenant
0d12f192 docs(qa): allocate REG-601 to WP-04's partial-update entry (TASK-0032)
2204cd75 merge: TASK-0032 WP-05 agreements into the task branch
f5b4b9d1 merge: TASK-0032 WP-03 TOTP MFA into the task branch
b8198c76 fix(auth): MFA code submission gets a tighter per-address budget (ADR-0019)
e6b9cdf9 chore(config): regenerate the platform runtime schema (TASK-0032)
09042920 feat(db): audit indexes for cross-tenant sign-in metrics and trace lookups (TASK-0032)
2ec5d1a5 docs(env): document REQUEST_LOGGING_ENABLED for the request access log (TASK-0032)
1712e957 fix(audit): add a platform-guarded reader for PlatformAuditLog (BUG-3564)
cac4a93c fix(super-admin): bulk-delete customers/onboarding require admin tier (BUG-3564)
910fcb50 fix(admin,monitoring): hydration-safe incident times, honest health headline, readable MFA column (TASK-0032)
7e625f14 feat(admin): add a platform audit trail screen under monitoring (BUG-3564)
8a7c6c5c docs(tasks): file the WP-10 stream report (TASK-0032 platform audit trail)
38065748 fix(web,admin): MFA status reads On while the new recovery codes are shown (TASK-0032)
3dccd1e6 merge: TASK-0032 WP-10 platform audit trail into the task branch
e52a345c fix(api): catalogue the error codes TASK-0032 introduced
bbb61ab5 test(api): import isErrorCode from app-error in the TASK-0032 catalogue spec
0a84a58e fix(partners,leads): refuse restricted deletes by name, show the attributed partner (TASK-0032)
a7d8c7c5 fix(api): render agreement previews and signature dates through one path
231bcf7b docs(tasks): TASK-0032 WP-09 QA summary from the live throwaway stack
cd8aa6f1 fix(api): give counterparty placeholders their own picker group
6a74cbd0 fix(api): resolve partner.* from an agreement's linked partner
16218cc9 wip(TASK-0032 WP-11): checkpoint after a session interruption
d91a3229 wip(TASK-0032 WP-12): checkpoint after a session interruption
53c44f04 docs(architecture): fix the WP-02-report anchor in the RBAC doc
301eda2c fix(seed): give every system agreement template a signature block
fa3cf1d7 docs(tasks): WP-11 report for the agreement QA defects
18a22c86 test(auth): the replay test reuses the exact code that confirmed MFA setup (TASK-0032)
0e62bc61 merge: TASK-0032 WP-11 agreement QA defect fixes into the task branch
e639a8a1 merge: TASK-0032 WP-12 architecture documentation into the task branch
02d9bebf feat(contracts): DijiPeople's signature line appears only when DijiPeople signs (ADR-0021)
d0b92236 docs(qa): fold TASK-0032's staged regression entries into the register
2d7046e9 docs(bugs): file the TASK-0032 WP-09 live-QA findings as durable records
0d33172f docs(bugs): close TASK-0032's fixed records with their commits and regressions
8ad6edc6 docs(qa): give every TASK-0032 regression a reusable scenario
ed5228f0 fix(contracts): drawn signatures reach the signed PDF/DOCX; regenerated copies render from evidence
91083b59 test(api): type the new TASK-0032 spec mocks so the lint ratchet holds at 787
1e287b8f docs(TASK-0032): close the findings, merge the regression register, regenerate derived docs
dfe42ea9 fix(ci): keyboard-reachable dashboard chart scroll; drop the stale @nestjs/core disposition
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            75fec5b9 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-closeout                   caad4a56 [agent/closeout-sweep]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/dp-partner-admin                      dfe42ea9 [agent/partner-agreements-admin-hardening]
D:/My Work/hrm-dijipeople/dp-plans-review                       516b6ede [agent/review-subscription-plans-screen]
D:/My Work/hrm-dijipeople/dp-s1-openbugs                        6b87e8fa [agent/cs-s1-openbugs]
D:/My Work/hrm-dijipeople/dp-s10-pii                            484e44c4 [agent/cs-s10-pii]
D:/My Work/hrm-dijipeople/dp-s2-decisions                       3da4a860 [agent/cs-s2-decisions]
D:/My Work/hrm-dijipeople/dp-s3-itemsa                          7017d36f [agent/cs-s3-itemsa]
D:/My Work/hrm-dijipeople/dp-s4-itemsb                          1df6f9e8 [agent/cs-s4-itemsb]
D:/My Work/hrm-dijipeople/dp-s5-security                        eaf29471 [agent/cs-s5-security]
D:/My Work/hrm-dijipeople/dp-s6-triaged                         f3f0977b [agent/cs-s6-triaged]
D:/My Work/hrm-dijipeople/dp-s7-planbugs                        00a5058a [agent/cs-s7-planbugs]
D:/My Work/hrm-dijipeople/dp-s8-planitems                       7b197797 [agent/cs-s8-planitems]
D:/My Work/hrm-dijipeople/dp-s9-auditrecords                    7977a9fd [agent/cs-s9-auditrecords]
D:/My Work/hrm-dijipeople/dp-ux-findings                        b7bd1ca7 [agent/ux-findings-sweep]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

356 file(s) against `75fec5b9`.

```
M	.agent/context/component-index.md
A	apps/admin/app/(internal)/_lib/classify-internal-error.spec.ts
A	apps/admin/app/(internal)/_lib/classify-internal-error.ts
A	apps/admin/app/(internal)/error.tsx
A	apps/admin/app/(internal)/loading.tsx
M	apps/admin/app/(internal)/page.tsx
M	apps/admin/app/(internal)/security/page.tsx
M	apps/admin/app/(internal)/settings/demo-data/page.tsx
A	apps/admin/app/(internal)/settings/monitoring/audit-logs/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/error-logs/page.tsx
A	apps/admin/app/(internal)/settings/monitoring/error.tsx
A	apps/admin/app/(internal)/settings/monitoring/loading.tsx
M	apps/admin/app/(internal)/settings/monitoring/page.tsx
M	apps/admin/app/(internal)/settings/platform-defaults/page.tsx
M	apps/admin/app/(internal)/settings/users/page.tsx
M	apps/admin/app/_components/admin-shell.tsx
M	apps/admin/app/_components/admin-sidebar.tsx
M	apps/admin/app/_components/dashboard/platform-dashboard.tsx
M	apps/admin/app/_components/documents/contract-document-editor.tsx
M	apps/admin/app/_components/documents/contract-template-editor.tsx
A	apps/admin/app/_components/leads/lead-attribution-panel.tsx
A	apps/admin/app/_components/monitoring/audit-trail-link.spec.ts
A	apps/admin/app/_components/monitoring/audit-trail-nav.spec.ts
A	apps/admin/app/_components/monitoring/audit-trail-table.tsx
M	apps/admin/app/_components/monitoring/error-logs-table.tsx
A	apps/admin/app/_components/monitoring/health-overview-tiles.tsx
M	apps/admin/app/_components/monitoring/monitoring-nav.tsx
M	apps/admin/app/_components/monitoring/monitoring-overview.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/runtime/runtime-view-selector.tsx
A	apps/admin/app/_components/security/mfa-security.tsx
M	apps/admin/app/_components/settings-users-client.tsx
M	apps/admin/app/api/auth/login/route.ts
A	apps/admin/app/api/auth/mfa/verify/route.ts
A	apps/admin/app/api/platform-users/me/mfa/disable/route.ts
A	apps/admin/app/api/platform-users/me/mfa/recovery-codes/route.ts
A	apps/admin/app/api/platform-users/me/mfa/route.ts
A	apps/admin/app/api/platform-users/me/mfa/setup/confirm/route.ts
A	apps/admin/app/api/platform-users/me/mfa/setup/route.ts
A	apps/admin/app/api/platform/audit-logs/[id]/route.ts
M	apps/admin/app/api/platform/logs/events/[traceId]/route.ts
A	apps/admin/app/api/super-admin/leads/[leadId]/attribution/route.ts
A	apps/admin/app/api/users/[userId]/mfa/reset/route.ts
M	apps/admin/app/login/login-form.tsx
M	apps/admin/components/errors/error-provider.tsx
A	apps/admin/lib/admin-login-classify.spec.ts
A	apps/admin/lib/admin-login-classify.ts
A	apps/admin/lib/admin-session-response.ts
A	apps/admin/lib/audit-trail.spec.ts
A	apps/admin/lib/audit-trail.ts
A	apps/admin/lib/background-request.spec.ts
A	apps/admin/lib/background-request.ts
A	apps/admin/lib/dashboard/operations-dashboard-metrics.spec.ts
A	apps/admin/lib/dashboard/operations-dashboard-metrics.ts
M	apps/admin/lib/platform-rbac.spec.ts
M	apps/admin/lib/platform-rbac.ts
A	apps/admin/lib/runtime/edit-tab-selection.spec.ts
A	apps/admin/lib/runtime/edit-tab-selection.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/admin/lib/runtime/platform-runtime.types.ts
M	apps/admin/lib/runtime/runtime-lookups.ts
M	apps/landing/app/partners/onboarding/[token]/partner-onboarding-form.tsx
M	apps/landing/app/sign/[token]/signing-experience.tsx
M	apps/web/app/(authenticated)/my-profile/page.tsx
M	apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts
M	apps/web/app/(public)/login/login-form.tsx
A	apps/web/app/(public)/login/mfa-login-step.tsx
M	apps/web/app/api/auth/login/route.ts
A	apps/web/app/api/auth/mfa/challenge/setup/confirm/route.ts
A	apps/web/app/api/auth/mfa/challenge/setup/route.ts
A	apps/web/app/api/auth/mfa/disable/route.ts
A	apps/web/app/api/auth/mfa/recovery-codes/route.ts
A	apps/web/app/api/auth/mfa/setup/confirm/route.ts
A	apps/web/app/api/auth/mfa/setup/route.ts
A	apps/web/app/api/auth/mfa/status/route.ts
A	apps/web/app/api/auth/mfa/verify/route.ts
A	apps/web/app/api/users/[userId]/mfa/reset/route.ts
M	apps/web/app/components/runtime/module-widget-renderer.tsx
A	apps/web/app/components/security/mfa-panels.tsx
A	apps/web/app/components/security/mfa-settings-card.tsx
A	apps/web/lib/auth-login-classify.spec.ts
A	apps/web/lib/auth-login-classify.ts
A	apps/web/lib/auth-login-response.ts
M	apps/web/lib/forwarded-headers.invariant.spec.ts
M	docs/architecture/README.md
A	docs/architecture/agreements.md
M	docs/architecture/authentication.md
A	docs/architecture/mfa.md
A	docs/architecture/monitoring.md
A	docs/architecture/partners.md
M	docs/architecture/rbac.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0197-totp-multi-factor-authentication-for-tenant-and-platform-use.md
A	docs/backlog/items/ITEM-0198-admin-monitoring-platform-health-overview-grouped-error-fiel.md
A	docs/backlog/items/ITEM-0199-admin-dashboard-operational-metrics-for-logins-mfa-adoption-.md
A	docs/backlog/items/ITEM-0200-agreements-have-no-end-to-end-test-coverage-and-partners-lea.md
A	docs/backlog/items/ITEM-0201-platform-runtime-edits-ignore-the-record-version-so-concurre.md
A	docs/backlog/items/ITEM-0202-mfa-status-reads-off-while-new-recovery-codes-are-shown.md
M	docs/backlog/open.md
M	docs/bugs/BUG-3146-platform-admin-login-has-no-account-lockout-of-any-kind.md
M	docs/bugs/BUG-3220-apps-admin-has-zero-loading-and-error-boundary-files-apps-we.md
M	docs/bugs/BUG-3227-no-access-log-and-traceid-never-reaches-an-application-log-l.md
M	docs/bugs/BUG-3231-whole-modules-have-no-audit-trail-contracts-31-mutating-endp.md
A	docs/bugs/BUG-3544-a-platform-admin-can-open-and-edit-a-tenant-but-every-save-i.md
A	docs/bugs/BUG-3545-the-admin-session-heartbeat-is-refused-for-most-platform-rol.md
A	docs/bugs/BUG-3546-tenant-record-edit-leaves-the-operator-on-a-tab-with-nothing.md
A	docs/bugs/BUG-3547-the-platform-role-picker-offers-two-platform-owner-roles-and.md
A	docs/bugs/BUG-3548-a-numeric-value-in-a-ttl-seconds-variable-issues-access-toke.md
A	docs/bugs/BUG-3549-partner-type-individual-or-company-drives-no-behaviour-and-i.md
A	docs/bugs/BUG-3550-partners-can-be-created-as-duplicates-admin-create-has-no-du.md
A	docs/bugs/BUG-3551-partner-create-update-lifecycle-and-onboarding-review-are-no.md
A	docs/bugs/BUG-3552-the-agreement-template-editor-offers-every-placeholder-group.md
A	docs/bugs/BUG-3553-an-agreement-can-be-created-for-an-inactive-partner-or-an-ar.md
A	docs/bugs/BUG-3554-the-typed-signature-style-selector-is-cosmetic-the-chosen-st.md
A	docs/bugs/BUG-3555-error-log-redaction-covers-auth-secrets-only-stack-traces-an.md
A	docs/bugs/BUG-3564-the-platform-audit-trail-is-write-only-no-screen-or-endpoint.md
A	docs/bugs/BUG-3565-opening-a-contract-template-or-signature-request-from-its-ad.md
A	docs/bugs/BUG-3566-a-partial-partner-edit-is-rejected-because-the-update-dto-re.md
A	docs/bugs/BUG-3567-platform-administrator-sign-ins-and-failed-sign-ins-are-not-.md
A	docs/bugs/BUG-3578-deleting-a-partner-or-lead-with-restricted-history-crashes-w.md
A	docs/bugs/BUG-3579-an-attributed-lead-never-shows-its-referral-partner.md
A	docs/bugs/BUG-3580-agreement-preview-documents-print-unresolved-placeholders.md
A	docs/bugs/BUG-3581-signature-date-placeholders-block-sending-and-freeze-a-fabri.md
A	docs/bugs/BUG-3582-system-agreement-templates-have-no-signature-block.md
A	docs/bugs/BUG-3583-counterparty-placeholders-are-grouped-under-customer.md
A	docs/bugs/BUG-3584-a-partner-agreement-never-fills-partner-placeholders-from-it.md
A	docs/bugs/BUG-3585-error-codes-added-for-mfa-platform-authorization-and-agreeme.md
A	docs/bugs/BUG-3586-the-monitoring-health-headline-reads-unknown-when-no-email-h.md
A	docs/bugs/BUG-3587-the-monitoring-overview-raises-a-hydration-error-that-covers.md
A	docs/bugs/BUG-3588-a-signed-in-operator-without-the-users-permission-sees-a-log.md
A	docs/bugs/BUG-3597-a-drawn-or-uploaded-signature-inside-a-signature-paragraph-i.md
A	docs/bugs/BUG-3598-generate-document-on-an-executed-agreement-renders-from-draf.md
A	docs/bugs/BUG-3599-generating-an-agreement-in-an-unsupported-format-returns-a-5.md
A	docs/decisions/ADR-0018-platform-operations-are-authorized-by-platform-permission-only.md
A	docs/decisions/ADR-0019-totp-mfa-for-tenant-and-platform-users.md
A	docs/decisions/ADR-0020-agreement-placeholders-are-offered-by-agreement-context.md
A	docs/decisions/ADR-0021-owner-decisions-countersign-platform-mfa-legal-publishing.md
M	docs/environment-variables.md
M	docs/knowledge/architecture/screen-map.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/data-model/domain-map.md
M	docs/knowledge/data-model/entity-customer-account.md
M	docs/knowledge/data-model/entity-tenant.md
M	docs/knowledge/data-model/entity-user.md
A	docs/plans/EXECPLAN-0051-partner-agreements-admin-rbac-monitoring-dashboard-mfa.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-AUTH-017-a-numeric-ttl-seconds-value-is-interpreted-as-seconds-everyw.md
A	docs/qa/scenarios/QA-AUTH-018-every-platform-sign-in-outcome-writes-a-platform-audit-row-n.md
A	docs/qa/scenarios/QA-AUTH-019-five-wrong-platform-admin-passwords-lock-the-account-for-30-.md
A	docs/qa/scenarios/QA-AUTH-020-totp-mfa-enrolment-sign-in-recovery-codes-and-administrator-.md
A	docs/qa/scenarios/QA-AUTHZ-017-every-platform-role-that-holds-tenants-update-can-save-a-ten.md
A	docs/qa/scenarios/QA-AUTHZ-018-the-admin-session-heartbeat-never-requires-a-tenant-business.md
A	docs/qa/scenarios/QA-CONTRACT-002-a-partner-agreement-template-offers-only-the-placeholder-gro.md
A	docs/qa/scenarios/QA-CONTRACT-003-an-agreement-cannot-be-created-against-a-suspended-partner-a.md
A	docs/qa/scenarios/QA-CONTRACT-004-the-chosen-typed-signature-style-reaches-the-signed-document.md
A	docs/qa/scenarios/QA-CONTRACT-005-a-generated-agreement-preview-prints-resolved-values-never-r.md
A	docs/qa/scenarios/QA-CONTRACT-006-a-template-with-a-dated-signature-line-can-be-sent-and-the-s.md
A	docs/qa/scenarios/QA-CONTRACT-007-every-seeded-system-agreement-template-has-a-platform-and-co.md
A	docs/qa/scenarios/QA-CONTRACT-008-counterparty-placeholders-are-labelled-counterparty-not-cust.md
A	docs/qa/scenarios/QA-CONTRACT-009-a-partner-agreement-resolves-partner-placeholders-from-its-l.md
A	docs/qa/scenarios/QA-CONTRACT-010-error-codes-this-task-introduced-reach-clients-as-their-own-.md
A	docs/qa/scenarios/QA-CONTRACT-011-contracts-module-mutations-and-public-signing-events-write-a.md
A	docs/qa/scenarios/QA-CONTRACT-012-an-executed-agreement-s-signed-and-regenerated-copies-show-e.md
A	docs/qa/scenarios/QA-LEAD-006-an-attributed-lead-embeds-and-shows-its-referral-partner.md
A	docs/qa/scenarios/QA-PARTNER-008-individual-partner-onboarding-requires-a-national-id-not-a-c.md
A	docs/qa/scenarios/QA-PARTNER-009-creating-a-partner-with-an-existing-email-tax-id-or-company-.md
A	docs/qa/scenarios/QA-PARTNER-010-partner-create-update-and-lifecycle-transitions-write-a-plat.md
A	docs/qa/scenarios/QA-PARTNER-011-a-one-field-partner-patch-updates-only-that-field.md
A	docs/qa/scenarios/QA-PARTNER-012-deleting-a-partner-or-lead-with-restricted-history-is-refuse.md
A	docs/qa/scenarios/QA-PLATFORM-033-edit-on-a-tenant-record-lands-on-a-tab-with-an-editable-fiel.md
A	docs/qa/scenarios/QA-PLATFORM-034-the-platform-role-picker-offers-each-assignable-role-once.md
A	docs/qa/scenarios/QA-PLATFORM-035-the-platform-audit-trail-can-be-listed-and-read-and-a-tenant.md
A	docs/qa/scenarios/QA-PLATFORM-036-opening-a-contract-template-or-signature-request-from-its-ad.md
A	docs/qa/scenarios/QA-PLATFORM-037-every-request-writes-one-access-log-line-and-its-trace-id-re.md
A	docs/qa/scenarios/QA-PLATFORM-038-the-monitoring-health-headline-never-reads-unknown-for-a-nor.md
A	docs/qa/scenarios/QA-PLATFORM-039-the-monitoring-overview-never-raises-a-hydration-error-on-lo.md
A	docs/qa/scenarios/QA-PLATFORM-040-the-monitoring-health-occurrence-module-facet-and-related-ev.md
A	docs/qa/scenarios/QA-PLATFORM-041-the-admin-dashboard-reports-operational-metrics-honestly-nev.md
A	docs/qa/scenarios/QA-PLATFORM-042-the-admin-route-group-has-a-loading-and-error-boundary-pair.md
A	docs/qa/scenarios/QA-SECURITY-004-error-log-redaction-covers-national-id-bank-account-and-free.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-001-authentication.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-005-lead-management.md
M	docs/qa/test-plans/PLAN-006-partner-lifecycle.md
M	docs/qa/test-plans/PLAN-015-legal.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-030-monitoring.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0106-task-0032-partner-agreements-admin-rbac-monitoring-dashboard.md
M	docs/sessions/active.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0032-partner-onboarding-agreements-admin-rbac-monitoring-dashboar.md
A	docs/tasks/TASK-0032-streams/COMMON-RULES.md
A	docs/tasks/TASK-0032-streams/QA-summary.md
A	docs/tasks/TASK-0032-streams/t0032-wp-02-report.md
A	docs/tasks/TASK-0032-streams/platform-route-mapping.md
A	docs/tasks/TASK-0032-streams/t0032-wp-03-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-04-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-05-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-06-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-07-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-08-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-10-report.md
A	docs/tasks/TASK-0032-streams/t0032-wp-11-report.md
A	docs/tasks/TASK-0032-streams/discovery/D1-super-admin-rbac.md
A	docs/tasks/TASK-0032-streams/discovery/D2-partners-leads.md
A	docs/tasks/TASK-0032-streams/discovery/D3-agreements-signatures.md
A	docs/tasks/TASK-0032-streams/discovery/D4-monitoring-dashboard.md
A	docs/tasks/TASK-0032-streams/discovery/D5-auth-mfa.md
A	docs/tasks/TASK-0032-streams/discovery/D6-admin-crud-inventory.md
A	docs/tasks/TASK-0032-streams/records-map.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
A	e2e/tools/admin-crud-matrix.mjs
M	package-lock.json
M	packages/config/platform-runtime-schema.generated.json
M	scripts/check-production-advisories.mjs
M	services/api/package.json
A	services/api/prisma/migrations/20260925120000_mfa_platform_lockout_error_module_signature_style/migration.sql
A	services/api/prisma/migrations/20260925180000_audit_log_trace_and_action_indexes/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-config.ts
M	services/api/src/app.module.ts
M	services/api/src/common/config/auth.config.spec.ts
M	services/api/src/common/config/auth.config.ts
M	services/api/src/common/constants/audit-actions.ts
M	services/api/src/common/constants/wiring-invariants.spec.ts
A	services/api/src/common/decorators/authentication-only.decorator.ts
A	services/api/src/common/errors/derive-error-module.spec.ts
A	services/api/src/common/errors/derive-error-module.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/errors/sanitize-error-log.spec.ts
M	services/api/src/common/errors/sanitize-error-log.ts
A	services/api/src/common/errors/task-0032-error-codes.spec.ts
M	services/api/src/common/filters/http-exception.filter.ts
M	services/api/src/common/guards/permissions.guard.ts
M	services/api/src/common/guards/public-rate-limit.guard.spec.ts
M	services/api/src/common/guards/public-rate-limit.guard.ts
A	services/api/src/common/guards/roles.guard.spec.ts
M	services/api/src/common/guards/roles.guard.ts
A	services/api/src/common/middleware/access-log.middleware.spec.ts
A	services/api/src/common/middleware/access-log.middleware.ts
M	services/api/src/common/middleware/request-id.middleware.ts
M	services/api/src/common/request-context/request-context.module.ts
A	services/api/src/common/request-context/trace-context.service.ts
M	services/api/src/common/security/tenant-auth-policy.service.ts
M	services/api/src/modules/audit/audit-actions.spec.ts
M	services/api/src/modules/audit/audit-snapshot.spec.ts
A	services/api/src/modules/audit/audit.controller.spec.ts
M	services/api/src/modules/audit/audit.controller.ts
M	services/api/src/modules/audit/audit.module.ts
M	services/api/src/modules/audit/audit.repository.ts
M	services/api/src/modules/audit/audit.service.spec.ts
M	services/api/src/modules/audit/audit.service.ts
A	services/api/src/modules/audit/dto/platform-audit-log-query.dto.ts
M	services/api/src/modules/audit/lifecycle-audit-coverage.spec.ts
A	services/api/src/modules/audit/platform-audit-authorization.spec.ts
A	services/api/src/modules/audit/platform-audit-trail.spec.ts
A	services/api/src/modules/audit/platform-audit.controller.ts
M	services/api/src/modules/auth/admin-auth.controller.ts
A	services/api/src/modules/auth/auth-activity-authorization.spec.ts
M	services/api/src/modules/auth/auth.controller.ts
M	services/api/src/modules/auth/auth.module.ts
M	services/api/src/modules/auth/auth.service.ts
A	services/api/src/modules/auth/mfa/auth-mfa.controller.ts
A	services/api/src/modules/auth/mfa/dto/mfa.dto.ts
A	services/api/src/modules/auth/mfa/mfa-challenge.ts
A	services/api/src/modules/auth/mfa/mfa-login.spec.ts
A	services/api/src/modules/auth/mfa/mfa-test-prisma.fixture.ts
A	services/api/src/modules/auth/mfa/mfa.service.spec.ts
A	services/api/src/modules/auth/mfa/mfa.service.ts
A	services/api/src/modules/auth/mfa/recovery-codes.spec.ts
A	services/api/src/modules/auth/mfa/recovery-codes.ts
A	services/api/src/modules/auth/mfa/totp.spec.ts
A	services/api/src/modules/auth/mfa/totp.ts
A	services/api/src/modules/auth/platform-login-audit.spec.ts
A	services/api/src/modules/auth/platform-login-lockout.service.ts
A	services/api/src/modules/auth/platform-login-lockout.spec.ts
A	services/api/src/modules/contracts/agreement-source-guards.spec.ts
A	services/api/src/modules/contracts/agreement-source-guards.ts
A	services/api/src/modules/contracts/contract-templates.seed.spec.ts
A	services/api/src/modules/contracts/contracts.agreement-guards.spec.ts
A	services/api/src/modules/contracts/contracts.agreement-rendering.spec.ts
M	services/api/src/modules/contracts/contracts.contracting.spec.ts
A	services/api/src/modules/contracts/contracts.controller.generate.spec.ts
M	services/api/src/modules/contracts/contracts.controller.ts
M	services/api/src/modules/contracts/contracts.domain.spec.ts
M	services/api/src/modules/contracts/contracts.module.ts
A	services/api/src/modules/contracts/contracts.partner-source.spec.ts
M	services/api/src/modules/contracts/contracts.service.ts
M	services/api/src/modules/contracts/contracts.workflow.spec.ts
M	services/api/src/modules/contracts/dto/contracts.dto.ts
A	services/api/src/modules/contracts/placeholder-context.spec.ts
A	services/api/src/modules/contracts/placeholder-context.ts
A	services/api/src/modules/contracts/platform-signature-lines.spec.ts
M	services/api/src/modules/demo-data/demo-data.controller.ts
M	services/api/src/modules/error-logs/error-logs.service.spec.ts
M	services/api/src/modules/error-logs/error-logs.service.ts
M	services/api/src/modules/leads/admin-leads.controller.ts
A	services/api/src/modules/leads/lead-attribution-correction.spec.ts
A	services/api/src/modules/leads/lead-delete-and-partner.spec.ts
M	services/api/src/modules/leads/leads.service.ts
M	services/api/src/modules/legal/admin-legal.controller.ts
M	services/api/src/modules/partner-experience/partner-activation.workflow.spec.ts
A	services/api/src/modules/partner-experience/partner-experience-audit.spec.ts
M	services/api/src/modules/partner-experience/partner-experience.module.ts
M	services/api/src/modules/partner-experience/partner-experience.service.ts
M	services/api/src/modules/partner-experience/partner-portal-access.spec.ts
A	services/api/src/modules/partners/dto/partner-update-partial.spec.ts
M	services/api/src/modules/partners/dto/partner.dto.ts
M	services/api/src/modules/partners/partner-deletion.service.spec.ts
M	services/api/src/modules/partners/partner-deletion.service.ts
A	services/api/src/modules/partners/partner-duplicate-detection.spec.ts
A	services/api/src/modules/partners/partner-duplicate-detection.ts
A	services/api/src/modules/partners/partner-type-policy.spec.ts
A	services/api/src/modules/partners/partner-type-policy.ts
A	services/api/src/modules/partners/partners-audit.spec.ts
A	services/api/src/modules/partners/partners-partial-update.spec.ts
M	services/api/src/modules/partners/partners-platform-authorization.spec.ts
M	services/api/src/modules/partners/partners.service.ts
M	services/api/src/modules/platform-auth/platform-permissions.spec.ts
M	services/api/src/modules/platform-auth/platform-permissions.ts
A	services/api/src/modules/platform-monitoring/platform-health.controller.ts
A	services/api/src/modules/platform-monitoring/platform-health.service.spec.ts
A	services/api/src/modules/platform-monitoring/platform-health.service.ts
A	services/api/src/modules/platform-monitoring/platform-monitoring-list-filters.spec.ts
M	services/api/src/modules/platform-monitoring/platform-monitoring.module.ts
M	services/api/src/modules/platform-monitoring/platform-monitoring.service.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
A	services/api/src/modules/platform-runtime/runtime-get-coverage.spec.ts
M	services/api/src/modules/platform-users/platform-password.spec.ts
A	services/api/src/modules/platform-users/platform-user-mfa-reset.spec.ts
A	services/api/src/modules/platform-users/platform-users-rbac.spec.ts
M	services/api/src/modules/platform-users/platform-users.controller.ts
M	services/api/src/modules/platform-users/platform-users.service.ts
A	services/api/src/modules/super-admin/bulk-delete-admin-tier.spec.ts
M	services/api/src/modules/super-admin/dto/update-tenant.dto.ts
A	services/api/src/modules/super-admin/operations-dashboard.service.spec.ts
A	services/api/src/modules/super-admin/operations-dashboard.service.ts
M	services/api/src/modules/super-admin/platform-lifecycle.service.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.module.ts
M	services/api/src/modules/super-admin/super-admin.service.spec.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.constants.ts
M	services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts
M	services/api/src/modules/tenant-settings/tenant-settings.catalog.ts
M	services/api/src/modules/users/users.controller.ts
M	services/api/src/modules/users/users.service.ts
```

## Conflicts

Integration of the eleven work-package branches into the task branch, in
dependency order:

- **`tenant-erasure.constants.ts`** (additive/additive): WP-03 and the
  integration branch both registered `userMfaRecoveryCode` as an erasable
  model.
- **`platform-users.service.ts`** (additive/additive): WP-02's permission-only
  authorization and WP-03's MFA reset both added methods and imports.
- **Regression ids** (id collision, records): WP-04 used REG-560, which WP-05's
  reserved range held; WP-10 used REG-602..609, overlapping the integration
  range.
- **`platform-runtime-schema.generated.json`** (generated artifact): stale after
  the WP-01 and WP-04 DTO changes.

The merge of the task branch into `develop` was clean: `develop` had not moved
since the base.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

- Erasure list: kept one entry (WP-03's). Keeping both would have registered
  the model twice and failed the erasure-coverage invariant.
- Platform users service: kept both sides. Choosing either would have lost
  either the ADR-0018 authorization or the admin MFA reset.
- REG ids: WP-04's REG-560 became REG-601; the integration range moved to
  REG-620+. Keeping the collision would have made two regressions answer to
  one id in the register.
- Runtime schema: regenerated rather than hand-merged. A hand merge would have
  matched neither branch, which is what `runtime-write-contract.spec` caught.

## QA

| | |
|---|---|
| **QA Report** | `docs/tasks/TASK-0032-streams/QA-summary.md` (journeys, 8×11 authorization matrix, defect dispositions) — PASS after fixes; agreements re-verification on the throwaway stack 38/38 PASS plus a visual read of the signed PDF |
| **Bug IDs** | Fixed: BUG-3146, BUG-3227, BUG-3544..3555, BUG-3564..3567, BUG-3578..3587, BUG-3597..3599. Deferred with disposition: BUG-3220, BUG-3231, BUG-3588. |
| **Backlog Items** | Done: ITEM-0197, ITEM-0198, ITEM-0199, ITEM-0202. Deferred: ITEM-0200, ITEM-0201 (optimistic concurrency). |

## CI

| | |
|---|---|
| **CI Run ID** | 36159588565 (on `dfe42ea9`). The previous run, 36157494919 on `1e287b8f`, failed two jobs — an axe `scrollable-region-focusable` violation on the admin dashboard and a stale `@nestjs/core` advisory disposition — both fixed in `dfe42ea9`. |
| **CI Result** | PASS — `CI required gate` green on the exact SHA ref-pushed to `develop`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merged SHA is the task tip (fast-forward), so the task-tip runs are the
merged-SHA runs. Locally at `1e287b8f`, whose code differs from `dfe42ea9` only
by a `tabIndex` on one chart element and a removed advisory entry:
`npm --workspace {api,web,admin,landing} run check-types` — all PASS; API jest
385 suites / 7,365 tests PASS; web jest 2,033 PASS; admin jest 482 PASS; API
ESLint 787 warnings (ceiling 787); every `check:*` and `test:*` runtime script
PASS; component index, data model, screen map and record graph current;
`validate-framework` 6,043 checks PASS; backlog, QA, tasks, sessions and
remediation checks PASS. CI on `dfe42ea9` then ran the full gate, including the
browser e2e journeys, and passed.

## Release / Deployment Impact

None — not deployed. `main` is untouched; production promotion is the owner's.
Before promoting: two migrations
(`20260925120000_mfa_platform_lockout_error_module_signature_style`, which also
folds PLATFORM_OWNER into SUPER_ADMIN — capture those accounts first; and
`20260925180000_audit_log_trace_and_action_indexes`, index builds that lock
the audit tables briefly); `SECRET_ENCRYPTION_KEY` must be set (MFA returns 503
without it); `seed:config` rewrites version 1 of the system agreement
templates; `REQUEST_LOGGING_ENABLED` is optional. Rollback class: code
revertible; the role-folding migration is not automatically reversible.

## Knowledge Capture

`docs/knowledge/modules/contracts-and-agreements.md` (module knowledge): the
three agreement render paths, the platform-signature-line rule and the
per-block PDF/DOCX extractor lesson from BUG-3597. The architecture
documentation was written by WP-12 under `docs/architecture/`, and the stream
reports sit under `docs/tasks/TASK-0032-streams/`.

## Obsidian Sync

TODO — whether `node scripts/sync-obsidian.mjs` ran, and which `Generated/`
folders changed.

## Cleanup

Worktrees `dp-pah-wp02`..`wp12` removed with `npm run worktree:remove` (primary
verified intact each time) and their local branches deleted, all confirmed
merged into `develop` and clean first. Dev servers stopped; throwaway database
`dijipeople_pah_test` dropped after the test-database guard confirmed it. The
task worktree `dp-partner-admin` stays until the closure commits are
integrated.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0018]] · [[ADR-0019]] · [[ADR-0020]] · [[ADR-0021]] · [[BUG-3146]] · [[BUG-3220]] · [[BUG-3227]] · [[BUG-3231]] · [[BUG-3544]] · [[BUG-3545]] · [[BUG-3546]] · [[BUG-3547]] · [[BUG-3548]] · [[BUG-3549]] · [[BUG-3550]] · [[BUG-3551]] · [[BUG-3552]] · [[BUG-3553]] · [[BUG-3554]] · [[BUG-3555]] · [[BUG-3564]] · [[BUG-3565]] · [[BUG-3566]] · [[BUG-3567]] · [[BUG-3578]] · [[BUG-3579]] · [[BUG-3580]] · [[BUG-3581]] · [[BUG-3582]] · [[BUG-3583]] · [[BUG-3584]] · [[BUG-3585]] · [[BUG-3586]] · [[BUG-3587]] · [[BUG-3588]] · [[BUG-3597]] · [[BUG-3598]] · [[BUG-3599]] · [[ITEM-0197]] · [[ITEM-0198]] · [[ITEM-0199]] · [[ITEM-0200]] · [[ITEM-0201]] · [[ITEM-0202]] · [[PLAN-001]] · [[PLAN-002]] · [[PLAN-005]] · [[PLAN-006]] · [[PLAN-015]] · [[PLAN-019]] · [[PLAN-030]] · [[QA-AUTH-017]] · [[QA-AUTH-018]] · [[QA-AUTH-019]] · [[QA-AUTH-020]] · [[QA-AUTHZ-017]] · [[QA-AUTHZ-018]] · [[QA-CONTRACT-002]] · [[QA-CONTRACT-003]] · [[QA-CONTRACT-004]] · [[QA-CONTRACT-005]] · [[QA-CONTRACT-006]] · [[QA-CONTRACT-007]] · [[QA-CONTRACT-008]] · [[QA-CONTRACT-009]] · [[QA-CONTRACT-010]] · [[QA-CONTRACT-011]] · [[QA-CONTRACT-012]] · [[QA-LEAD-006]] · [[QA-PARTNER-008]] · [[QA-PARTNER-009]] · [[QA-PARTNER-010]] · [[QA-PARTNER-011]] · [[QA-PARTNER-012]] · [[QA-PLATFORM-033]] · [[QA-PLATFORM-034]] · [[QA-PLATFORM-035]] · [[QA-PLATFORM-036]] · [[QA-PLATFORM-037]] · [[QA-PLATFORM-038]] · [[QA-PLATFORM-039]] · [[QA-PLATFORM-040]] · [[QA-PLATFORM-041]] · [[QA-PLATFORM-042]] · [[QA-SECURITY-004]] · [[SESSION-0106]] · [[TASK-0005]] · [[TASK-0032]]

<!-- GRAPH:END -->
