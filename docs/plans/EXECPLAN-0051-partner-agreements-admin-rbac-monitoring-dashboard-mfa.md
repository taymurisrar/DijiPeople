# EXECPLAN-0051 — Partner onboarding, agreements, platform RBAC, monitoring, dashboard and MFA hardening

TASK-0032 · SESSION-0106 · integration branch `agent/partner-agreements-admin-hardening`
· binding decisions ADR-0018 (platform authorization and role list), ADR-0019
(TOTP MFA), ADR-0020 (contextual agreement placeholders) · discovery evidence
`docs/tasks/TASK-0032-streams/discovery/D1..D6` · record map
`docs/tasks/TASK-0032-streams/records-map.md`.

```
CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, services/api/prisma/AGENTS.md,
    apps/admin/AGENTS.md, apps/web/AGENTS.md, apps/landing/AGENTS.md
  - .agent/context/task-orchestration.md, multi-session.md, branch-model.md
  - docs/knowledge/modules/platform-auth.md, contracts-and-agreements.md

SPECIALIST_AGENTS_REQUIRED:
  - database        — one migration for every schema change (WP-01), single writer
  - backend-api     — RBAC, MFA, partners, agreements, monitoring, dashboard
  - frontend        — admin, web and landing screens
  - security        — ADR-0018 authorization change, MFA, redaction, isolation
  - ui-ux           — monitoring and dashboard layout
  - qa              — scenario matrices, e2e, browser journeys
  - reviewer        — security-strengthened pass over the integrated diff
  - integrator      — task branch, develop integration
  - knowledge-graph — architecture docs, Obsidian sync
DELIBERATELY_NOT_USED:
  - integration     — no external contract changes (Stripe, gateway, desktop agent untouched)
  - release-devops for deployment — owner forbade production; it reports health only

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma + prisma/migrations/   (WP-01 only)
  - services/api/src/common/constants/permissions.ts, rbac-matrix.ts,
    modules/platform-auth/platform-permissions.ts, common/guards/*   (WP-02 first; WP-03 after WP-02 merges)
  - package.json / package-lock.json   (WP-03 only — adds `qrcode`)

QA_REQUIRED: yes — authorization, authentication, legal documents, tenant isolation

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - two authorization models answering one question (BUG-0071, BUG-0072 lineage)
  - doc-code-drift
  - a read filter is not an access control (UI hiding is never the control)
  - guard the seam, not the ends

REGRESSION_ENTRIES_IN_SCOPE (reserved ranges; each stream writes
docs/qa/regressions/_incoming/<wp>.md, merged centrally at WP-09):
  - WP-01 REG-520..524 · WP-02 REG-525..534 · WP-03 REG-535..549 · WP-04 REG-550..559
  - WP-05 REG-560..574 · WP-06 REG-575..584 · WP-07 REG-585..589 · WP-08 REG-590..599

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL (throwaway PostgreSQL) — production forbidden by owner
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api | web | admin | landing (at a future owner-run release)
DEPLOYMENT_ORDER:         database -> api -> admin/web/landing (for the future release)
ROLLBACK_CLASS:           MULTI_COMPONENT_CONTRACT + DATABASE_ADDITIVE
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no (health reporting only)
POST_DEPLOY_QA_REQUIRED:  no (no deploy)
MERGE_STRATEGY:           merge --no-ff into the task branch; ref-push to develop after green CI
KNOWN_CONCURRENT_WORK:    none active at start (session list 2026-09-25)
ENVIRONMENT_DEPENDENCIES: none new (SECRET_ENCRYPTION_KEY already mandatory in production)
```

## Objective

See TASK-0032 Objective. In one line: a platform privilege model without tenant
role keys, full audited Super Admin/Platform Admin CRUD, a partner lifecycle with
real type behaviour, context-aware agreements with immutable signed documents,
TOTP MFA in both apps, an investigation-first monitoring page and an operations
dashboard from real data.

## Business requirement

The owner's TASK-0032 brief (phases 1–28). Product rules not derivable from the
code were decided as ADR-0018/0019/0020 under the brief's instruction to take the
most scalable SaaS decision; the one genuine product question (mandatory MFA for
platform users) is an owner decision in TASK-0032 and defaults to optional.

## Existing behavior

- Tenant edit: `SuperAdminService.updateTenant` refuses every platform role but
  `SUPER_ADMIN`/`PLATFORM_OWNER` (tenant role-key check); reproduced live (D1 §2).
- `POST /auth/activity` requires tenant permission `user-preferences.write`; 403
  for most platform roles raises a blocking dialog in admin (live).
- 16 platform roles; `SUPER_ADMIN` and `PLATFORM_OWNER` identical and both
  labelled "Platform Owner" (D1 §3).
- No MFA; platform login has no lockout (D5; BUG-3146).
- Numeric `*_TTL_SECONDS` produce 1-second tokens (live).
- Partner type has no behaviour; no duplicate check on admin create; no audit on
  partner mutations (D2). Lead↔partner attribution exists and is audited
  (`PATCH /super-admin/leads/:leadId/attribution`) — kept.
- Placeholder registry is flat; editor shows every group; no source-state guards
  on agreement creation; no `AuditService` calls in contracts (BUG-3231); signed
  content frozen and signatures rendered (keep) (D3).
- Monitoring: grouped fingerprint/count/first/last exist in `ErrorLog` but are
  not surfaced; no health overview; redaction covers only auth secrets; traceId
  never reaches logs or audit rows (BUG-3227) (D4).
- Dashboard: real data, 9 views; missing auth/MFA/error/job metrics (D4).
- Admin: 18 runtime entities, delete refusals intentional; no loading/error
  boundaries (BUG-3220); in-memory pagination on 9 modules (BUG-3175) (D6).

## Existing architecture

Reuse, do not rebuild: `PlatformPermissionsGuard`/`userHasPlatformPermission`
(platform-auth), `PlatformRuntimeService` + `platform-module-registry.ts`
(admin runtime), `AuditService`, `SecretEncryptionService`, `LoginLockoutService`,
`PublicRateLimitGuard`, `CONTRACT_PLACEHOLDER_REGISTRY`,
`assertValidContractPlaceholderValues`, `assertSourceCanFillTemplate`,
`ErrorLog` fingerprinting, `DASHBOARD_VIEWS`, `ProDataTable`, `MonitoringNav`.

## Requirements

1. Every platform role holding `tenants.update` can save tenant profile fields;
   status changes only through governed lifecycle actions (ADR-0018).
2. No platform code path decides by tenant role key; `@RequireRoles(tenant key)`
   is not the platform gate.
3. `POST /auth/activity` succeeds for every authenticated platform and tenant user.
4. Role picker shows one top role ("Platform Super Admin"); `PLATFORM_OWNER`
   assignments migrate; `MEMBER` not assignable.
5. MFA per ADR-0019 in both apps: setup with QR + manual key, verify-to-enable,
   login challenge, recovery codes, regenerate, disable, admin reset, tenant
   `mfaRequired`, audit, lockout, rate limits, no secrets logged.
6. Platform login lockout (BUG-3146); numeric TTLs are seconds.
7. Partner type drives required fields and behaviour via one typed policy;
   duplicate detection by email / tax id / registration number on every create
   path; partner mutations audited; lead attribution picker searchable, shows
   type and status, refuses inactive partners.
8. Placeholders per ADR-0020; source-state guards; consistent partner/lead/
   customer combination; duplicate-submission guard; contracts audited
   (BUG-3231); typed-signature style rendered or removed; agreement actions
   status-appropriate.
9. Monitoring: health overview (API, DB, jobs/outbox, auth, storage, email/
   integrations), grouped errors with count/first/last/status/module/tenant/
   correlation id, filters, error detail with sanitized context and related audit
   events; traceId on audit rows and access log; PII/stack redaction.
10. Dashboard: operational KPIs from real sources with drill-down links;
    responsive; no fabricated metric.
11. Admin CRUD matrix executed; failures surfaced with the API's message; no
    blocking dialog for background requests; loading/error boundaries.
12. Tenant isolation and platform/tenant boundary tests for every changed path.

## Dependencies

WP graph in TASK-0032. External: none (local PostgreSQL only).

## Files / modules affected

- api: `super-admin`, `platform-runtime`, `platform-auth`, `platform-users`,
  `auth`, `partners`, `partner-experience`, `leads`, `contracts`, `error-logs`,
  `platform-monitoring`, `dashboard`, `common/guards`, `common/config`,
  `common/security`; **single-writer**: `schema.prisma`, `permissions.ts`,
  `rbac-matrix.ts`, `platform-permissions.ts`.
- admin: runtime registry, security page, login, tenants, partners, contracts,
  templates, monitoring, dashboard, error dialog.
- web: login, my-profile security, employee admin MFA reset.
- landing: signing experience (typed style).
- packages/config: none planned.

## Database impact

One migration (WP-01), additive:
- `User`: `mfaEnabled Boolean @default(false)`, `mfaSecretEncrypted String?`,
  `mfaPendingSecretEncrypted String?`, `mfaEnabledAt DateTime?`,
  `mfaLastUsedStep BigInt?`; relation `mfaRecoveryCodes`.
- `PlatformUser`: same five MFA fields, `failedLoginAttempts Int @default(0)`,
  `lockedUntil DateTime?`; relation `mfaRecoveryCodes`.
- `UserMfaRecoveryCode` (tenant-owned: `tenantId`, `userId`, `codeHash @unique`,
  `usedAt`, `createdAt`, `@@index([tenantId, userId])`, cascade on user/tenant).
- `PlatformUserMfaRecoveryCode` (`platformUserId`, `codeHash @unique`, `usedAt`,
  `createdAt`, index, cascade).
- `ErrorLog.module String?` + `@@index([module, lastSeenAt])` (backfilled by the
  writer, historical rows null).
- `SignatureEvidence.typedStyle String?`.
- Data: `UPDATE "PlatformUser" SET role='SUPER_ADMIN' WHERE role='PLATFORM_OWNER'`.
  Idempotent. Access-preserving (identical permission sets).
Applied to a fresh throwaway DB with `migrate deploy`; delta authored with
`migrate diff --from-schema` (repo drift prevents `migrate dev`).

## Backend impact

Per WP brief (TASK-0032-streams/WP-nn-brief.md). New endpoints (MFA):
tenant `POST /auth/mfa/setup` · `POST /auth/mfa/setup/confirm` ·
`POST /auth/mfa/verify` (public, challenge token) · `POST /auth/mfa/recovery-codes`
· `POST /auth/mfa/disable` · `GET /auth/mfa/status` · `POST /users/:userId/mfa/reset`;
platform `…/admin/auth/mfa/verify` and `platform-users/me/mfa/*`,
`platform-users/:userId/mfa/reset`. Monitoring: `GET /platform/monitoring/health`.

## Frontend impact

Admin runtime pages reused; bespoke only where the runtime already is bespoke
(security page, login, monitoring, dashboard, template editor). Loading, empty,
error and access-denied states on every touched surface; responsive at tablet and
phone widths; labelled controls.

## Permission / RBAC impact

- Platform: new `platform-users.manage` (held only via `platform.*`), used by
  platform-user management and platform MFA reset. `tenants.update` becomes the
  tenant-profile gate. `@RequireRoles(SYSTEM_ADMIN)` on `SuperAdminController`
  replaced by explicit platform permissions, route by route, preserving who can
  do what except the ADR-0018 widening for tenant edit.
- Tenant: MFA admin reset uses existing `users.update` with
  `@Permissions('users.update')` + `@RequirePermission(ENTITY_KEYS.USERS,'write')`
  and row scope via `buildScopedAccessWhere`.
- `/auth/activity`: authentication only.
- No change to the elevated tenant role list.

## Tenant-isolation impact

Tenant MFA endpoints act on `request.user` only; admin reset loads the target by
`{ id, tenantId: user.tenantId }`. Recovery-code rows carry `tenantId`. Platform
endpoints are platform-guarded and never widened to tenant callers. New e2e:
tenant A admin cannot reset tenant B user's MFA; tenant user cannot reach
`platform-runtime`, `platform-users`, `platform/monitoring`, `contracts`.

## Audit / event / logging impact

New audit actions: `TENANT_PROFILE_UPDATED` (before/after), `PLATFORM_USER_ROLE_MIGRATED`
(one-off, via the migration note), MFA actions per ADR-0019, `PARTNER_CREATED`,
`PARTNER_UPDATED`, `PARTNER_STATUS_CHANGED`, `PARTNER_APPLICATION_APPROVED/REJECTED`,
contract create/update/send/sign/decline/void/terminate/amend/renew/delete,
template create/version/state. Snapshots exclude secrets, TOTP seeds, recovery
codes, signature images and raw tokens. `traceId` threaded into audit rows.

## Integration impact

None external. Signing page (landing) posts one new optional field.

## Migration / data compatibility

Additive columns with defaults; old API code ignores them. Admin/web built
against the new API tolerate absent MFA endpoints only in the sense that the old
API never returns `mfaRequired` — deploy API first (future release).

## Parallel-safe tasks

- `PARALLEL_SAFE`: WP-01, WP-02, WP-04 (disjoint modules; WP-02 holds the
  permissions lease; WP-01 holds the schema lease).
- After WP-01 lands on the task branch: WP-05, WP-06, WP-07 in parallel.
- After WP-02 lands: WP-03, WP-08 in parallel.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED`: WP-03 (schema + permissions map), WP-05/06/07 (schema),
  WP-08 (RBAC behaviour it tests).

## Integration tasks

- `INTEGRATION`: WP-09 — merge, regenerate derived artifacts, e2e on a fresh
  throwaway DB, browser journeys, security regression, docs, review, CI, develop.

## Testing strategy

- `npm --workspace api run test`, `check-types`, `lint`; `npm --workspace admin
  run test`/`check-types`; `npm --workspace web run test`/`check-types`;
  `npm run lint`; `npm run typecheck`; `npm run build`; `npm run validate:framework`.
- DB-backed: `npm --workspace api run test:e2e` against `dijipeople_pah_*_test`.
- New specs: per-role tenant-edit matrix; activity for every platform role;
  RFC 6238 vectors; MFA lifecycle (enable, challenge, wrong/expired/replayed
  code, recovery single-use, regenerate, disable, admin reset, lockout); partner
  type policy; duplicate detection; placeholder availability per type and per
  linked entity; source guards; audit coverage for contracts and partners;
  redaction of PII and stacks; dashboard metric sources.
- Browser (repo Playwright, local stack): admin dashboard, tenants, users, roles,
  partners, agreements, templates, monitoring, security/MFA; web login + MFA +
  profile; landing signing typed and drawn; responsive at 1440, 1024, 768, 390.

## Risks

1. **Authorization widening** (HIGH impact, MEDIUM likelihood) — replacing
   `@RequireRoles` could open a route to a role that should not have it.
   Mitigation: route-by-route mapping table in the WP-02 report, per-role spec,
   Reviewer pass.
2. **Login lockout from MFA defects** (HIGH/LOW) — nobody is enrolled at
   release; recovery codes and admin reset exist; e2e covers the whole cycle.
3. **Placeholder narrowing breaks existing templates** (MEDIUM/MEDIUM) —
   validation reports rather than mutates; existing agreements unaffected.
4. **Parallel merge conflicts in `platform-module-registry.ts`** (LOW/HIGH) —
   distinct sections; integration re-runs the runtime schema generator.

## Rollback considerations

Code-only revert restores behaviour; the migration is additive and can stay.
The `PLATFORM_OWNER`→`SUPER_ADMIN` update is reversible only from a list of the
affected accounts; the release checklist (TASK-0032 final report, "Production
deployment requirements") captures `SELECT id,email FROM "PlatformUser" WHERE
role='PLATFORM_OWNER'` before the migration runs. Because both roles carry
`platform.*`, not reversing it changes nobody's access.

## Definition of Done

- [ ] Every requirement above verified by a spec or a browser journey
- [ ] All validation commands pass locally; CI green on the exact SHA
- [ ] Both permission systems wired; no tenant-role-key platform gate remains
- [ ] Audit in place for every listed action; no secret in any snapshot
- [ ] Tenant isolation e2e for every changed tenant path
- [ ] Records FIXED/DONE with REG + QA scenario; docs updated; Obsidian synced
- [ ] `main` untouched; production untouched
