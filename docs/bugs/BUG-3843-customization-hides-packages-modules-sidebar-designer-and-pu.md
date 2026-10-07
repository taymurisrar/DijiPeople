---
ID: BUG-3843
aliases: [BUG-3843]
Title: Customization hides Packages, Modules, Sidebar Designer and Publish Center behind a role gate ADR-0013 removed
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: USER_REPORT
DetectedDate: 2026-10-07
DetectedInSha: 9714f85b
AffectedModules: [apps/web, customization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-644
RelatedBacklogItem:
RelatedDecision: ADR-0013
RelatedImplementation: [apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts, apps/web/app/(authenticated)/settings/_lib/customization-navigation-access.spec.ts]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-07
---

# BUG-3843 — Customization hides Packages, Modules, Sidebar Designer and Publish Center behind a role gate ADR-0013 removed

## Summary

Settings → Customization showed only Fields, Forms, Views, Action Bars and
Widgets. Modules, Sidebar Designer, Packages and Publish Center were missing.
Packages is the only way into package ALM: import, export, release, versions,
dependencies, uninstall and environment variables (TASK-0033). The product owner
reported that ALM did not exist. In fact it shipped, but no link led to it.

## Expected Behavior

Each Customization tile is shown exactly when its page would open for the
signed-in user. Per ADR-0013 that is decided by `customization.*` permission
keys, never by role membership.

## Actual Behavior

A user without the `global-admin` or `system-customizer` role did not see the
four tiles, in either the category landing or the settings side navigation.
That includes the demo workspace owner, a System Admin who holds every
customization key. Typing `/settings/customization/packages` still opened the
page, because the page gate checks permissions only.

## Reproduction

1. Sign in to a tenant as a user whose role is System Admin and who holds
   `customization.read`, `customization.tables.read` and
   `customization.modules.manage`. The demo tenant owner is one.
2. Open Settings → Customization.
3. Observe three groups (Runtime Metadata, Designers, Runtime Components). No
   Packages or Publishing group appears, and Runtime Metadata lists only Fields.
4. Navigate to `/settings/customization/packages` by URL. The page loads.

## Evidence

- `apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts` at
  `9714f85b`, lines 852-938: each of the four items carried
  `requiredAnyRoles: [ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER]`.
- `canViewItem` in the same file (lines 96-112) returns false on a role
  mismatch before permissions are looked at. It is called by
  `canViewSettingsItem`, which feeds both `SettingsCategoryLanding` and
  `resolveVisibleSettingsRuntime`.
- The page gates in `customization/_lib/customization-page-permissions.json`
  require permissions only. So does the API's `CustomizationAccessGuard`.
- The new spec fails 9 of its 10 cases against the `9714f85b` version of
  `settings-navigation.ts`.

## Root Cause

BUG-3374 and BUG-3491 moved the Customization layout, the pages and the API to
permission-only authorization, and ADR-0013 recorded that decision. The settings
navigation catalog was a fourth authorization layer, and nobody changed it. Its
role gate survived and silently filtered the tiles.

## Impact

Every tenant whose customizers are not Global Administrators or System
Customizers. This includes the default owner role. Package ALM, module
configuration, the sidebar designer and publishing were undiscoverable in
production. There was no security impact: the gate was stricter than the
authority it mirrored.

## Affected Areas

Settings → Customization landing and settings side navigation in `apps/web`.

## Proposed Resolution

Remove the role gate. Gate each tile on the permission key its page adds on top
of the section's `customization.read`.

## Acceptance Criteria

- A System Admin who holds exactly a page's required keys sees that page's tile.
- Without the page's distinguishing key, the tile is hidden, even for a Global
  Administrator.
- No Customization navigation item declares `requiredAnyRoles`.

## Regression Coverage

REG-644:
`apps/web/app/(authenticated)/settings/_lib/customization-navigation-access.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-3374]] and [[BUG-3491]] removed the same role gate from the layout and the
API. ADR-0013 is the decision.

## Resolution

The four items now declare a single page-aligned key and no roles:

| Item | Key |
|---|---|
| Modules | `customization.tables.read` |
| Sidebar Designer | `customization.modules.manage` |
| Packages | `customization.read` |
| Publish Center | `customization.read` |

Branch `agent/crm-plugin-alm-mfa-claims`.

## QA Retest

QA-SETTINGS-038. Spec PASS, 10 cases. It is mutation-checked: 9 of the 10 cases
fail against the original file.

## History

- 2026-10-07 — created from the owner's report that there was no way to import,
  export or manage packages. Triaged FIX_NOW and fixed in the same session.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[customization]]
- Regression — REG-644 (see the regression register)

<!-- GRAPH:END -->
