---
ID: BUG-3374
aliases: [BUG-3374]
Title: Settings Customization and its twelve child routes silently redirect to Roles
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [apps/web, customization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-420
RelatedBacklogItem: ITEM-0104
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3374 — Settings Customization and its twelve child routes silently redirect to Roles

## Summary

Clicking **Customization** in tenant settings does not open Customization. The
page loads, and is then thrown to the Roles screen under Security and Access
with a `viewId` query parameter attached. No message is shown, nothing is
logged, and nothing indicates that an authorization decision was made. The user
is simply somewhere else.

The Customization screens are fully built and present on disk. A role gate in
the section's layout redirects past them before they can render, and its
fallback destination is a legacy path that a `next.config.ts` rewrite then
forwards to Roles, where Roles resolves its own default view and appends the
`viewId`. Three unrelated mechanisms compose into one baffling destination.

## Expected Behavior

A user permitted to see Customization sees Customization. A user who is not
permitted sees an access-denied state that says so, on the route they asked for.
Neither outcome is a silent teleport to an unrelated screen.

## Actual Behavior

`/settings/customization` resolves, sets the document title to
`Customization | DijiPeople`, and then navigates to
`/settings/security-access/authorization/roles?viewId=1aa05caa-2cb8-5905-8e4e-d9f8148e02bb`.

The same happens for all twelve routes beneath it.

## Reproduction

1. Sign in to the tenant product as the workspace owner.
2. Open `/settings/customization`, or click Customization in the settings
   navigation.
3. Observe the document title briefly read `Customization | DijiPeople`.
4. Observe the address bar settle on
   `/settings/security-access/authorization/roles?viewId=1aa05caa-2cb8-5905-8e4e-d9f8148e02bb`.

Reproduced on the live demo workspace at `cbd9b812`. The console is silent:
zero errors and zero warnings across the whole sequence.

Every route tested resolves to the same destination. Requested as the workspace
owner, landing URL sampled after nine seconds:

| Requested | Landed on |
|---|---|
| `/settings/customization` | `/settings/security-access/authorization/roles?viewId=1aa05caa-…` |
| `/settings/customization/modules` | same |
| `/settings/customization/packages` | same |
| `/settings/customization/publish` | same |
| `/settings/customization/publish-center` | same |
| `/settings/customization/sidebar` | same |

Three of them redirect quickly. `modules`, `packages` and `sidebar` sit on
their own URL for several seconds first, in a loading state whose document
title is the raw string
`Loading https://dijipeople-demo.ws.dijipeople.com/settings/security-access/authorization/roles`
— a destination URL leaking into the browser tab while the user waits to be
sent somewhere they did not ask to go.

**The Customization screens cannot be exercised at all.** A request to review
and run scenarios against this section could not be carried out, because no
route in it is reachable. That testing is blocked on this fix.

## Evidence

Network trail captured during the redirect shows the Customization request
resolving, then an RSC fetch for the Roles URL carrying the final `viewId`, with
no error response anywhere in between. A later prefetch of
`/settings/customization` returns 200, confirming the route exists and is
served.

- `apps/web/app/(authenticated)/settings/customization/layout.tsx:9` wraps every
  route under `/settings/customization/*`, the index included, with
  `requireCustomizationAccess(["customization.read"])`.
- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts:84-107`
  defines that function. Its default `fallbackHref` is `/settings/access/roles`
  (line 86) and it gates on `hasCustomizationAdministratorRole`, which at lines
  20-30 accepts only the roles `GLOBAL_ADMIN` or `SYSTEM_CUSTOMIZER`. The
  `customization.read` permission it is handed is never consulted.
- `apps/web/app/(authenticated)/settings/customization/page.tsx:7` separately
  calls `requireSettingsPermissions(["customization.read"])`. For any user the
  layout rejects, that check is unreachable — the two gates disagree about what
  authorizes this section.
- `next.config.ts:92-95` carries a legacy redirect from `/settings/access/roles`
  to `/settings/security-access/authorization/roles`, left over from an
  information-architecture migration.
- `apps/web/app/(authenticated)/settings/_lib/settings-runtime-pages.tsx:141-164`
  is Roles resolving its own default view and syncing `?viewId=` into the URL.
  `stableRuntimeMetadataId("settings-view:roles:all")`
  (`apps/web/lib/runtime/metadata-id.ts`) evaluates to exactly
  `1aa05caa-2cb8-5905-8e4e-d9f8148e02bb`, confirming the observed parameter is
  Roles' genuine default view, arrived at by accident.

The settings navigation is code-defined (`settings-navigation.ts`,
`settings-runtime.ts`, `settings-adapter-registry.ts`), not database-driven, so
this is a code defect and not bad tenant data.

**The workspace owner is affected.** The redirect was reproduced while signed in
as the tenant owner, so the role gate is narrower than "tenant administrator" in
practice, not merely narrower than the permission.

## Root Cause

`requireCustomizationAccess` authorizes on role membership while the navigation
catalog, and the pages themselves, authorize on the `customization.read`
permission. When those disagree the layout wins, and its response to a denial is
a redirect to a hard-coded legacy path rather than an access-denied state.

## Impact

The whole Customization subtree is unreachable for anyone who is not
`GLOBAL_ADMIN` or `SYSTEM_CUSTOMIZER`, including the workspace owner as
observed. Delegating customization access by permission does not work. Because
the failure is a redirect rather than a refusal, it reads as a broken link
rather than a permission problem, which is why it was reported as one.

Thirteen routes are affected:

`/settings/customization`, and beneath `/settings/customization/`:
`modules`, `modules/[tableKey]/columns`, `modules/[tableKey]/forms`,
`modules/[tableKey]/forms/[formId]/designer`, `modules/[tableKey]/views`,
`modules/[tableKey]/views/[viewId]/designer`, `packages`,
`packages/[packageId]`, `publish`, `publish-center`, `sidebar`, `tables`.

## Affected Areas

`apps/web` settings section; the `customization` API module is not itself at
fault. This is the only nested settings layout using this pattern — the root
`settings/layout.tsx` falls back to `/my-profile`, which is at least coherent.

## Proposed Resolution

Pick one authorization model for `/settings/customization/*`. Either widen
`requireCustomizationAccess` to accept `customization.read`, matching what the
navigation and every page already assume, or narrow the navigation and the page
checks to match the role gate and hide the entry from users who cannot use it.

Separately, and regardless of which is chosen, replace the silent redirect with
the `AccessDeniedState` already used elsewhere in that file. A denial should
render on the route the user asked for. The dependence on a legacy
`next.config.ts` rewrite should go with it.

Re-check [[ITEM-0104]] once fixed; it is very likely the same defect observed
from a crawler account and never diagnosed.

## Acceptance Criteria

- A user holding `customization.read` reaches `/settings/customization` and each
  of its twelve child routes without redirection.
- A user holding neither the permission nor the roles sees an access-denied
  state at the requested URL, with the URL unchanged.
- No route under `/settings/customization/` resolves to a Roles URL.

## Regression Coverage

Needs a test that requests the Customization index as a user with
`customization.read` and no administrator role, and asserts a 200 on that path
rather than a redirect. A register entry follows once written.

## Dependencies

None.

## Related Items

[[ITEM-0104]] records the symptom as a deferred, low-severity observation that
the Customization category renders no leaf pages; this record supplies the
mechanism. [[BUG-2958]] concerns entitlement-based settings visibility and is a
different thing.

## Resolution

Fixed by folding the layout's gate into the model every page already used,
and replacing the redirect with an in-place refusal.

- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts`
  — removed `hasCustomizationAdministratorRole` (the narrower, role-only
  model) and rewrote `requireCustomizationAccess` to use
  `hasAnySettingsPermission` — the exact function `requireSettingsPermissions`
  already calls — and to return `{ user, allowed }` instead of calling
  `redirect()`. There is now one authorization decision for this section,
  shared by the layout and every page beneath it, rather than two.
- `apps/web/app/(authenticated)/settings/customization/layout.tsx` — renders
  `AccessDeniedState` in place when `allowed` is false, instead of
  redirecting to the hardcoded legacy `/settings/access/roles` path. The
  `next.config.ts` rewrite that forwarded that path to Roles still exists
  (other callers use it) but this section no longer depends on it.
- Verified all thirteen routes (`/settings/customization` and its twelve
  children — `modules`, `modules/[tableKey]/columns`,
  `modules/[tableKey]/forms`, `modules/[tableKey]/forms/[formId]/designer`,
  `modules/[tableKey]/views`, `modules/[tableKey]/views/[viewId]/designer`,
  `packages`, `packages/[packageId]`, `publish`, `publish-center`, `sidebar`,
  `tables`) sit under the one layout that now uses the shared model, and that
  every page's own `requireSettingsPermissions(["customization.read", ...])`
  call already agrees with it (each includes `customization.read` as one of
  its accepted permissions, so a `customization.read`-only user passes both
  the layout and the page).
- **ITEM-0104 re-checked and confirmed the same defect**, filed independently
  from a crawler account that hit the identical role/permission mismatch.
  Reclassified `Status: DUPLICATE` of this record; see its file for detail.

## QA Retest

Pending — no QA agent run in this session; `apps/web`'s automated suite
(`npm --workspace web run test`, `check-types`) is green, including a new
unit-level regression test of `requireCustomizationAccess` covering the exact
workspace-owner fixture this bug was reproduced with. See REG-420 in
`docs/qa/regressions/index.md` for the scenario a future QA pass should
re-run end to end against a live workspace.

## History

- 2026-09-11 — created from user report at `cbd9b812`, reproduced live as the
  workspace owner and traced to the layout role gate.
- 2026-09-12 — fixed for SESSION-0103. See Resolution. Regression coverage:
  REG-420. ITEM-0104 re-checked and reclassified as a duplicate of this
  record.
- 2026-09-13 — the redirect is gone on production (`df0f84f1`), but every leaf
  page now renders a server error for the workspace owner, because the API
  guard still requires a customizer role while the layout admits by
  permission. Filed as [[BUG-3491]]; access rule decided by the owner in
  ADR-0013. This record stays `FIXED` for the redirect it describes.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0104]]
- Modules — [[tenant-application]]
- Regression — REG-420 (see the regression register)

<!-- GRAPH:END -->
