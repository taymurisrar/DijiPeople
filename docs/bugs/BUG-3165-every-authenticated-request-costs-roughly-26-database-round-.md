---
ID: BUG-3165
aliases: [BUG-3165]
Title: Every authenticated request costs roughly 26 database round trips before the handler runs
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
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

# BUG-3165 — Every authenticated request costs roughly 26 database round trips before the handler runs

## Summary

Every authenticated request costs roughly 26 database round trips before the handler runs

Identified by the 2026-09-10 full technical audit as ORCH-04 (confidence: ORCH-04=CONFIRMED for the structure and the absence of caching; LIKELY for the exact count of 26, which is derived from Prisma's relation loading strategy rather than measured against a live database.).

## Expected Behavior

Authentication should cost one or two round trips — a session check and a cached or joined access context.

## Actual Behavior

~26 database round trips execute before any controller body runs, on every authenticated call to any of the 111 controllers. The API runs as a single Render starter instance (render.yaml) against Neon, and each request holds a pooled connection for the whole sequence.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**ORCH-04** (services/api/src/common/guards/jwt-auth.guard.ts and services/api/src/modules/auth/auth-access.service.ts):

auth-access.service.ts:72-136 — loadAccessContext issues one user.findUnique carrying a four-level-deep include tree. Counting the relation loads Prisma must perform: tenant, businessUnit, businessUnit.organization, employee, userPermissions, userPermissions.permission, userRoles, userRoles.role, role.rolePermissions, rolePermissions.permission, role.rolePrivileges, role.miscPermissions, teamMemberships, teamMemberships.team, team.teamRoles, teamRoles.role, and that role's rolePermissions, permission, rolePrivileges and miscPermissions — 20 relation loads plus the base query.

schema.prisma:6-9 — the generator block declares no previewFeatures = ["relationJoins"], so Prisma resolves each relation with a separate round trip rather than a single join. (These are one query per relation level, not per row, so this is not an N+1 in the row-count sense — it is a fixed ~21 round trips regardless of how much data comes back.)

auth-access.service.ts:242 then calls resolveBusinessUnitAccess, which at :337 runs businessUnit.findMany({ where: { tenantId } }) — every business unit in the tenant, unbounded, filtered afterwards in JavaScript at :346-351 rather than in the where clause.

jwt-auth.guard.ts adds four more on the same path: refreshToken.findFirst (session liveness, :283), tenantSetting.findFirst (idle timeout, :369, on every web request when sliding sessions are on), and inside assertTimesheetRestrictionAllowsRequest both employee.findFirst (:200) and timesheetAccessRestriction.findFirst (:208).

grep -rn "loadAccessContext" services/api/src shows the result is not cached anywhere — it is recomputed from the database on every single request.

---


Full finding text: ORCH-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

This is the platform's dominant latency and connection-hold cost and it scales with request volume, not data volume, so it degrades uniformly as usage grows. Three multipliers make it worse: the front ends reach the API through ~501 Next.js route handlers, so one screen is many API calls and each pays the full toll; resolveBusinessUnitAccess grows linearly with a tenant's business units, so the largest customer is the slowest; and a single instance means the connection pool is the hard ceiling. At even 5 ms per round trip this is ~130 ms of pure overhead per request. This is the most likely candidate for "what breaks first as usage increases".

## Affected Areas

services/api/src/common

## Proposed Resolution

In priority order, and measure before and after. 1. Cache the access context per (userId, tenantId, sessionId) with a short TTL (30-60 s) in process memory, invalidated on role, permission, team or employment change. Note the trade-off explicitly: a revoked permission stays live for up to the TTL, so keep the TTL short and invalidate on the specific mutations. This is a case where a cache is genuinely the right answer. 2. Push the resolveBusinessUnitAccess filter into the where clause and stop loading every business unit in the tenant. 3. Fold the timesheet-restriction lookup into the access context query, or skip it entirely for tenants with no active restriction rows — today it costs two queries on every request to serve a feature most tenants never enable. 4. Evaluate Prisma's relationJoins preview feature so the access-context tree resolves in one query instead of 21.

(Difficulty: MEDIUM; Regression risk: MEDIUM — caching an authorization context is exactly where a stale-data bug becomes a security bug. Invalidation must be driven by the mutation sites, and the TTL must be short. Steps 2 and 3 are low-risk and can ship first.; Fix now: YES for steps 2 and 3; step 1 next, with tests.)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/guards/jwt-auth.guard.ts and services/api/src/modules/auth/auth-access.service.ts (audit id ORCH-04).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: ORCH-04=MEDIUM — caching an authorization context is exactly where a stale-data bug becomes a security bug. Invalidation must be driven by the mutation sites, and the TTL must be short. Steps 2 and 3 are low-risk and can ship first.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `ORCH-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (ORCH-04) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
