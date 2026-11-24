---
ID: BUG-4624
aliases: [BUG-4624]
Title: A tenant Global Administrator can publish, promote and disable the global desktop-agent releases every tenant installs
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-11-21
DetectedInSha: 4c2517e7
AffectedModules: [app-releases]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-702
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-21
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-24
---

# BUG-4624 — A tenant Global Administrator can publish, promote and disable the global desktop-agent releases every tenant installs

## Summary

The desktop agent releases (`ApplicationRelease`) belong to no tenant: they are the artefacts every tenant's agent updates from, and STABLE is the channel every assigned tenant's agent auto-updates from. The routes that publish, promote, disable and enable them, and the management catalogue, were guarded only by `JwtAuthGuard` and `PermissionsGuard` on `appDownloads.manage`. A tenant Global Administrator passes `PermissionsGuard` for every key through the `hasElevatedTenantRole` bypass, so a tenant admin could change what every customer installs.

## Expected Behavior

Only a platform subject may publish, promote, disable or enable a release or read the management catalogue. `rbac-matrix.ts` already says so: "publishing a DijiPeople application release is a platform action, not a tenant one." A tenant keeps read access to the catalogue it downloads from.

## Actual Behavior

A tenant Global Administrator received 201 on `POST /app-releases/:id/disable`, `POST /app-releases/:id/promote` (to STABLE) and `POST /app-releases` (publish, with an arbitrary `externalUrl`), and 200 on `GET /app-releases/manage`, which lists disabled releases and every channel. The release row changed in the database.

## Reproduction

1. In an isolated database, create a tenant with a user holding the Global Administrator role, and one `ApplicationRelease` row on the BETA channel.
2. Sign a tenant access token for that user and call `POST /app-releases/<id>/disable` with `X-DijiPeople-App: web`.
3. Observe 201 and `isActive = false` on the row. Repeat for `promote` with `{ "channel": "STABLE" }` (a STABLE copy is created) and for publish.

Reproduced on 2026-11-22 by `services/api/test/app-release-authority.e2e-spec.ts` before the fix: 4 of 6 tests failed with 201, 201, 201 and 200 where 403 was expected.

## Evidence

- `services/api/src/modules/app-releases/app-release.controller.ts`: the class carried `@UseGuards(JwtAuthGuard, PermissionsGuard)` and nothing that requires a platform subject; the controller comment itself says these routes "are not tenant-scoped".
- `services/api/src/common/constants/rbac-matrix.ts` (comment near `appDownloads.manage`): the intent is platform-only, and "Global Administrator and System Administrator reach everything regardless, via hasElevatedTenantRole".
- Test run on the isolated database: tenant admin disable 201, promote 201, publish 201, manage 200, before the fix; all 403 after.

## Root Cause

The intent ("platform action") was written as a comment and enforced only by excluding the key from non-elevated tenant roles. The elevated-role bypass in `PermissionsGuard` ignores that exclusion, and nothing checked that the caller is a platform subject.

## Impact

Reachable in production by any tenant Global Administrator account, including a compromised one. The consequence is control of the artefact every tenant's desktop agent installs on employees' machines: promote a release to STABLE, publish one pointing at a URL the attacker controls, or disable the current one for every customer. The agent's builds are unsigned today (ITEM-0238), so the update path has no publisher signature to stop it. Whether a published row is actually served depends on the update feed's tenant assignment and checksum handling, which was not exercised. Not known to have been exploited; the audit log records `platform.application_release_*` actions with the tenant admin as actor, so past use can be searched.

## Affected Areas

`services/api/src/modules/app-releases` (`app-release.controller.ts`): publish, disable, enable, promote and the management catalogue. Not affected: the release-publisher controller (its own publisher token), the update feed, and tenant read routes (`GET /app-releases`, `/latest`, `/:id`, download).

## Proposed Resolution

Require a platform subject (`user.platform.id`) on every mutation route and on `manage`, in the controller, leaving the service callable by the release-publisher path. Done.

## Acceptance Criteria

- A tenant Global Administrator gets 403 on publish, promote, disable, enable and the management catalogue, and the release rows are unchanged.
- A platform super admin can still disable and enable a release.
- A tenant admin can still read the catalogue.

## Regression Coverage

`services/api/test/app-release-authority.e2e-spec.ts` (REG-702, QA-AUTHZ-020). Fails without the fix: 4 of 6 tests.

## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

Fixed on branch `agent/dependency-alert-remediation` (SESSION-0137, WP3): `assertPlatformSubject(user)` added to `publish`, `disable`, `enable`, `promote` and `manage` in `app-release.controller.ts`. A sweep for other writes to tenant-less models from tenant-reachable modules found only the shared geography lookups (QUESTION-3931, already an owner decision) and internal auth-lockout counters.

## QA Retest

QA-AUTHZ-020, run on the isolated database on 2026-11-22: 6 of 6 passing, including the positive controls. Independent QA/Security review of this fix is pending.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): app-release.controller.ts calls assertPlatformSubject in publish/disable/enable/promote/manage; app-release-authority e2e (11 pass) asserts tenant admin is refused on each and may still read the catalogue, with a platform control.

## History

- 2026-11-21 — created from qa run at `4c2517e7`.
- 2026-11-22 — root cause established, fixed in source, regression REG-702 and scenario QA-AUTHZ-020 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-702 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
