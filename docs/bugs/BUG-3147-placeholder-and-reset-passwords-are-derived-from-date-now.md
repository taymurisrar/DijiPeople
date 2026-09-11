---
ID: BUG-3147
aliases: [BUG-3147]
Title: Placeholder and reset passwords are derived from Date.now()
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3147 — Placeholder and reset passwords are derived from Date.now()

## Summary

Placeholder and reset passwords are derived from Date.now()

Identified by the 2026-09-10 full technical audit as AUTH-12 (confidence: AUTH-12=CONFIRMED (predictability); LIKELY (the multi-workspace exploitation step)).

## Expected Behavior

Every placeholder credential comes from `randomBytes`. Use the existing `unguessableSecret()`.

## Actual Behavior

These "unguessable" values have roughly 10–20 bits of real entropy for an attacker who knows the tenant id (public) and the approximate time the action was taken. The two reset paths write the value into `Identity.passwordHash`, which is the credential `resolveLoginCredential` prefers for **every** workspace that identity belongs to.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-12** (services/api/src/modules/super-admin/, services/api/src/modules/employees/employees.service.ts):

`services/api/src/modules/super-admin/super-admin.service.ts:1884` — no random component at all:
```ts
    const passwordHash = await bcrypt.hash(
      `owner-reset-${tenantId}-${Date.now()}`,
      12,
    );
```
and it is mirrored to the shared identity at `:1899`: `await mirrorPasswordToIdentity(tx, owner.id, passwordHash);`
`services/api/src/modules/super-admin/super-admin.service.ts:1502` — `` `tenant-access-reset-${tenantId}-${Date.now()}` ``, also mirrored (`:1521`).
`services/api/src/modules/super-admin/tenant-identities-provisioning.service.ts:385` — `` `provision-${input.tenantId}-${input.email}-${Date.now()}` ``, under a comment reading *"Unguessable and never communicated."*
`services/api/src/modules/super-admin/platform-onboarding.service.ts:241` — `` `onboarding-${tenant.id}-${Date.now()}` ``.
`services/api/src/modules/employees/employees.service.ts:2113` — `` `invite-${employee.id}-${Date.now()}` ``.
`services/api/src/modules/super-admin/super-admin.service.ts:1391` — `` `tenant-access-${tenantId}-${Date.now()}-${Math.random()}` `` (`Math.random` is not a CSPRNG).
The correct pattern already exists in the codebase — `services/api/src/modules/tenant-control-plane/tenant-access.service.ts:983`:
```ts
function unguessableSecret() { return randomBytes(32).toString('hex'); }
```
`tenantId` is public: `GET /api/public/tenants/resolve?slug=…` returns `tenant.id` (`public-tenants.service.ts:317`), unauthenticated and unthrottled.

---


Full finding text: AUTH-12 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

All the creation paths set `status: INVITED`, which blocks login, so the exposure is narrow. The reset paths are not: if the reset subject holds an `ACTIVE` account in a *second* workspace, that workspace's login now accepts a password an attacker can enumerate over a known millisecond window. Tenant lockout (5 attempts) makes a wide search impractical, but the shape of the weakness — a credential whose entropy is a timestamp — should not survive a review.

## Affected Areas

services/api/src/modules/auth

## Proposed Resolution

Replace all six `Date.now()`-derived strings with `randomBytes(32).toString('hex')`; promote `unguessableSecret()` out of `tenant-access.service.ts` into `common/security/` and add an invariant spec that no `bcrypt.hash` argument in `services/api/src` contains `Date.now()`.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/super-admin/, services/api/src/modules/employees/employees.service.ts (audit id AUTH-12).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-12=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-12` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-12) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
