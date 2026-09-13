---
ID: BUG-3491
aliases: [BUG-3491]
Title: Customization pages crash for a user who holds customization permissions but no customizer role
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, customization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-481
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0013-customization-access-is-granted-by-permission.md
RelatedImplementation: [docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md, services/api/src/modules/customization/customization-access.guard.ts, services/api/src/modules/customization/customization.controller.ts, apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts, apps/web/app/(authenticated)/settings/customization/_lib/customization-page-permissions.json]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3491 — Customization pages crash for a user who holds customization permissions but no customizer role

## Summary

The fix for [[BUG-3374]] made the web Customization layout admit anyone who
holds the `customization.read` permission. The API behind every Customization
screen was not changed and still admits only the Global Administrator and
System Customizer roles. So a user the web lets in, such as the workspace owner,
now reaches a page whose first server-side API call returns 403. The server
component throws, and the user gets a generic "SERVER ERROR" page instead of
Customization. Before BUG-3374 was fixed the same user was silently redirected
to Roles. Now they reach a crash. The section is still unusable either way.

## Expected Behavior

One rule decides who can use Customization, and the web and the API apply the
same rule. The owner decided on 2026-09-13 that customization access is granted
by the `customization.*` permissions, not by role (ADR-0013). A user who holds
`customization.read` and the matching read permission for a screen sees that
screen with its data. A user without them gets an access-denied state on the
route they asked for. No outcome is a server error page.

## Actual Behavior

For the workspace owner, every leaf route under `/settings/customization/`
renders the generic "SERVER ERROR" page (production React error #441). Affected
routes: `modules`, `tables`, `packages`, `publish` and `publish-center`. The
Fields, Forms, Views, Action Bars and Widgets cards redirect to `modules` and
crash there. The error digests observed were 2236283562, 4173519308, 537670098
and 809367064.

After the System Customizer role was added to the workspace owner, the same
routes loaded normally. Nothing else changed.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner. The owner holds the `system-admin` role and all 44 `customization.*`
   permission keys, but neither `global-admin` nor `system-customizer`.
2. Open `/settings/customization`. The landing page renders, because it makes
   no role-gated API call.
3. Open `/settings/customization/tables`, or click any Customization card.
4. Observe the "SERVER ERROR" page. The server's API call to
   `GET /api/customization/tables` returned 403 `CUSTOMIZATION_ACCESS_ROLE_REQUIRED`.
5. Add the System Customizer role to the same user and reload. The page renders.

Reproduced on the live demo tenant at `df0f84f1`, confirmed as the build
reported by `/api/health`.

## Evidence

- `apps/web/app/(authenticated)/settings/customization/layout.tsx:21-23` calls
  `requireCustomizationAccess(["customization.read"])` and renders children when
  it passes.
- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts:95-104`
  shows that, since BUG-3374's fix (e9e4ba84), `requireCustomizationAccess`
  delegates to `hasAnySettingsPermission`. That function (lines 30-38) passes on
  `customization.read`, or on any role in `SETTINGS_ADMIN_ROLES` (lines 6-10).
  That set includes `SYSTEM_ADMIN`.
- `apps/web/app/(authenticated)/settings/customization/tables/page.tsx:8-14`
  passes its own permission check and then calls
  `apiRequestJson("/customization/tables")` with no error handling.
- `services/api/src/modules/customization/customization-access.guard.ts:13-36`
  admits only `GLOBAL_ADMIN` and `SYSTEM_CUSTOMIZER`, plus their spelling
  variants. It throws `ForbiddenException` with code
  `CUSTOMIZATION_ACCESS_ROLE_REQUIRED` and the message "Customization requires
  the Global Administrator or System Customizer role." It never checks the
  `customization.*` permissions, except for the publish check at lines 44-53.
- `services/api/src/modules/customization/customization-access.guard.spec.ts:44-50`
  asserts the old rule on purpose: "does not give an ordinary System
  Administrator customization access". Any fix must change this test knowingly.
- Three role lists for one section disagree:
  - The web helper `SETTINGS_ADMIN_ROLES` includes `SYSTEM_ADMIN`.
  - The API guard excludes it.
  - The settings navigation catalog
    (`apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts:835-838`,
    `861-864`, `886-889`, `904-907`) lists `GLOBAL_ADMIN` and `SYSTEM_CUSTOMIZER`
    only, next to its permission lists.
- REG-420 (`docs/qa/regressions/index.md`) covers BUG-3374 with a unit test of
  the web helper only
  (`apps/web/app/(authenticated)/settings/_lib/require-settings-permission.spec.ts`).
  That test never reaches the API guard, so it passed while the journey broke.

## Root Cause

The web and the API decide customization access with two different models.
BUG-3374's fix moved the web layout to the permission model. The API's
`CustomizationAccessGuard` stayed on the role-only model. A user admitted by the
web and refused by the API reaches a server component whose unguarded
`apiRequestJson` call throws on the 403. Next.js renders that throw as a server
error, not as an access-denied state.

This regression came from BUG-3374's fix. It was not caught because that fix's
only regression test was a unit test on the web side of the seam.

## Impact

Customization is unusable for every tenant user who holds the customization
permissions without one of the two named roles. That includes the workspace
owner on the demo tenant, whose role is System Administrator. Delegating
customization by permission, which the owner has confirmed is the intended
model, does not work. Each crash also produces a server error digest.

This is reachable in production today. The demo tenant only works because the
System Customizer role was added to the owner as a temporary workaround. That
role is to be removed once this fix ships.

## Affected Areas

- API: `customization` module, all controller routes behind
  `CustomizationAccessGuard`.
- Web: every server component under `/settings/customization/*` that calls
  `/customization/*`.
- Settings navigation catalog role lists for Customization entries.

## Proposed Resolution

Apply the owner's decision (ADR-0013) at the API. Change
`CustomizationAccessGuard` to authorize on the `customization.*` permission keys
and drop the role requirement. Keep the existing publish-permission check.
Make the web helper, the API guard and the settings navigation catalog share
one definition of the rule, so they cannot drift apart again.

Separately, a refused `/customization/*` call from a Customization server
component should render the section's existing `AccessDeniedState`, not throw.
A future disagreement would then fail closed and readably, not as a crash. No
ExecPlan needed.

## Acceptance Criteria

- A tenant user with `customization.read` plus the screen's read permission,
  and neither `global-admin` nor `system-customizer`, gets 200 from
  `GET /api/customization/tables`, `/customization/packages` and the Publish
  Center endpoints.
- The same user can open `/settings/customization/modules`, `tables`,
  `packages`, `publish` and `publish-center` without a server error.
- A user with no `customization.*` permission gets 403 from the API and an
  access-denied state on the requested URL, with the URL unchanged and no
  server error digest.
- Publishing still requires `customization.publish`.
- After the fix ships, removing the System Customizer role from the demo
  workspace owner leaves every Customization screen working.

## Regression Coverage

REG-481, QA scenario QA-SETTINGS-021:

- `services/api/src/modules/customization/customization-web-gate.seam.spec.ts`
  crosses the seam: it reads the web page map, asserts each page's keys cover the
  keys its API routes declare, runs the real guard for a `system-admin` holding
  exactly those keys on every route, and asserts every route declares a key.
- `services/api/src/modules/customization/customization-access.guard.spec.ts`,
  rewritten on purpose: the "does not give an ordinary System Administrator
  customization access" case is inverted.
- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.spec.ts`:
  permission-only, all-of; roles alone no longer admit.

Mutation-checked: the guard admitting by role again fails 11 tests.

REG-420 (BUG-3374) did not catch this regression because its only test was on
the web side of the seam. The DB-backed e2e test required below was not
written; the seam spec covers the guard with real controller metadata but not
the full Nest pipeline, and the browser scenario covers the journey.

As filed, the record required:

- A DB-backed API e2e test that calls `/customization/tables` as a tenant user
  holding the customization permissions and only the `system-admin` role, and
  asserts 200. This test must fail against the current guard.
- An updated `customization-access.guard.spec.ts` that asserts permission-based
  admission. The existing "does not give an ordinary System Administrator"
  case is inverted or replaced.

A REG entry follows once written. REG-420's scenario should be widened to cover
the leaf pages, not only the layout.

## Dependencies

ADR-0013 records the access rule. No infrastructure dependency.

## Related Items

- [[BUG-3374]]: the fix this record is a regression of.
- [[BUG-3493]], [[BUG-3494]] and [[BUG-3492]]: the Customization defects that
  were only reachable once this was worked around.

## Resolution

Fixed in TASK-0031 WP-01 (commit 811a915c on `agent/walkthrough2-customization`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0045), applying
ADR-0013: customization access is granted by permission, not by role.

- **API guard.** `customization-access.guard.ts` has no role check. It requires
  every `@Permissions` key the handler declares, for elevated roles too, and
  refuses a handler that declares none (fail closed). A missing
  `customization.publish` keeps `CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED`;
  anything else is `CUSTOMIZATION_PERMISSION_REQUIRED`.
- **No administrator locked out.** `auth-access.service.ts` already gives
  elevated roles and the tenant owner every foundation permission key, all
  `customization.*` keys included. No grant, matrix or single-writer file changed.
- **Controller decorators** (`customization.controller.ts`), both permission
  systems kept on every route: package create, edit, delete and membership
  routes moved from `customization.publish` to `customization.packages.manage`;
  import preview to `customization.import.preview`; `layers/ensure` to
  `customization.read`/write, with the service asserting the component type's
  own key before writing.
- **Web gate.** `requireCustomizationAccess` admits on all of the page's keys,
  with no role bypass and no redirect. One map,
  `customization-page-permissions.json`, lists each page's keys and the API
  routes it loads; the layout and every page gate through it and render the
  access-denied state in place, including when their own API load returns 403.
- Tenant scoping unchanged; `hasElevatedTenantRole` not extended.
- **Accepted consequence (Architect).** A custom role holding
  `customization.publish` but not `customization.packages.manage` loses package
  create, edit and delete. System roles are unaffected.
- **Left as found.** `settings-navigation.ts` still lists `requiredAnyRoles` for
  Customization entries; nothing in `apps/web` reads it. No DB-backed e2e of
  `GET /api/customization/tables` for a `system-admin` user was written; the seam
  spec runs the real guard against real controller metadata.

Stream validation: api customization, dual-permission, wiring-invariants and
rbac-matrix specs 16 suites / 143 tests passed; web 97 suites / 1869 tests
passed; web typecheck passed; 14 of 14 mutations caught.

## QA Retest

Pending — browser verification on a throwaway database and on production in
TASK-0031 WP-07/WP-08. Scenario QA-SETTINGS-021:

1. As a `system-admin` holding every `customization.*` key and no System
   Customizer role, open every Customization page and both designers: data, no
   server error.
2. As a custom-role user with `customization.read` and
   `customization.tables.read` only: the modules list loads; a module detail
   shows Access denied in place with the URL unchanged.
3. As a user with no `customization.*` key: Access denied in place; `GET
   /api/customization/tables` returns 403 `CUSTOMIZATION_PERMISSION_REQUIRED`.
4. Publish still needs `customization.publish`; package create needs
   `customization.packages.manage`.
5. After release, remove the temporary System Customizer role from the demo
   workspace owner and repeat step 1.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-01; unit-tested; browser verification pending.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Implementation — [[EXECPLAN-0045-customization-end-to-end-for-permission-holders]]
- Regression — REG-481 (see the regression register)

<!-- GRAPH:END -->
