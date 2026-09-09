---
ID: BUG-2958
aliases: [BUG-2958]
Title: Settings shows every category, group and page regardless of the tenant's plan
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: USER_REPORT
DetectedDate: 2026-09-09
DetectedInSha: 1b020d29
AffectedModules: [apps/web, services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-396
RelatedBacklogItem:
RelatedDecision: ADR-0005
RelatedImplementation: PLAN-031
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
ResolvedAt: 2026-09-09
---

# BUG-2958 — Settings shows every category, group and page regardless of the tenant's plan

## Summary

The tenant Settings area — the Configuration workspace, its category tiles, the
group cards inside each category and the configuration pages inside each group —
is resolved from the signed-in user's permissions and roles alone. The tenant's
subscription is not an input. A tenant on Starter, which does not sell Payroll,
is offered the complete Payroll & Finance tree: six groups and seventeen
configuration pages for a module it has not bought.

This is the settings surface of [[BUG-1952]], which recorded the same defect
across the product and named "the entire Payroll & Finance tree" in passing.
That record's fix built the API enforcement layer — `EntitlementGuard`,
`TenantEntitlementService` and the `ENTITLEMENT_GATED_MODULES` register — and
closed as FIXED. It did not reach the settings information architecture, which
is a separate structure with its own resolver, and which that register
explicitly defers to: `branding` is listed there as ungated because it is "a
settings surface rather than a route module; enforced where settings resolve,
not by a route gate". Nothing was enforcing where settings resolve.

## Expected Behavior

A settings page configures a capability. If the tenant's plan does not include
that capability the page is not offered — not as a category tile, not as a group
card, not as a row inside a group that survives, and not by typing its URL. The
filter is driven by the tenant's resolved entitlements, so a plan an operator
creates tomorrow with any combination of capabilities is honoured with no code
change.

Pages that configure nothing a plan sells stay visible on every plan, and that
must be a written decision rather than an omission.

## Actual Behavior

On the Starter demo tenant (`dijipeople-demo.ws.dijipeople.com`), signed in as a
tenant administrator, the Configuration workspace renders eleven category tiles
including **Payroll & Finance (6 groups)**. Inside the tree:

| Where | What leaks | Visible at tile level? |
|---|---|---|
| Payroll & Finance | the whole category — 17 payroll pages | yes |
| Regional Operations > Payroll Geography | `payroll-regions`, the group's only member | no — the category survives |
| People > Attendance & Time | `timesheets`, beside an entitled `attendance` | no — group and category both survive |
| General Setup > Apps & Modules | `recruitment` and `desktop-agent` | no — General Setup survives |

Three of the four are invisible from the workspace grid. A fix that gated
categories would have left all three in place.

## Reproduction

1. Confirm the plan: in Platform Admin open the Starter plan
   (`11111111-1111-4111-8111-111111111111`) then Entitlements. `payroll`,
   `timesheets`, `projects`, `recruitment` and `onboarding` are unticked.
2. Sign in to the Starter tenant workspace as `global-admin`.
3. Open `/settings`. A **Payroll & Finance** tile is offered, reading "6 groups".
4. Open `/settings/regional`. A **Payroll Geography** group is offered.
5. Open `/settings/people/attendance`. **Timesheet Settings** is offered beside
   Attendance Settings.
6. Open `/settings/payroll/cycles/payroll-periods` directly. The configuration
   page renders.

## Evidence

At `4d0635a0` (origin/develop), before the fix:

- `apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts:727-744` —
  `resolveVisibleSettingsRuntime(permissionKeys, roleKeys)` takes two arguments.
  Entitlements are not one of them.
- `apps/web/app/(authenticated)/settings/_components/settings-runtime-landing.tsx:47`
  and `settings-runtime-nav.tsx:22` — the only two callers, both passing
  permissions and roles.
- `apps/web/app/(authenticated)/settings/layout.tsx` — no entitlement check on
  any settings route.
- `services/api/src/common/constants/tenant-features.ts` —
  `ENTITLEMENT_UNGATED_FEATURE_KEYS` exempts `branding` on the stated grounds
  that it is "enforced where settings resolve". That enforcement did not exist.
- The entitlements were already on the client:
  `apps/web/app/(authenticated)/layout.tsx:129-131` fetches
  `/tenant-settings/features/availability` on every authenticated page and
  passed the result only to the sidebar.

Two further faults found while auditing every settings item, both of which a
category-level fix would have caused rather than found:

- **`subscription` fell into the payroll category.** It has no `itemPlacement`
  entry, so `defaultPlacement` put the tenant's own plan, price and invoice page
  under Payroll & Finance > Payroll Configuration. Gating that category would
  have hidden a Starter tenant's billing page behind the capability they would
  go there to buy.
- **The Subscription landing card linked to a derived route.** `route` resolved
  to `/settings/payroll/configuration/subscription`, the generic runtime list,
  rather than to the purpose-built screen at `/settings/subscription`.

## Root Cause

The settings information architecture is a second structure with its own
resolver, built before entitlements existed and never connected to them. The
API-side fix for [[BUG-1952]] gated route modules by directory, and the settings
tree is not a route module — its pages read from domain endpoints that were
gated, so the data behind a leaked page would eventually be refused, but the
page, the group and the tile were still offered.

## Impact

Commercial and product-quality, on every tenant on every plan below Enterprise.
A Starter customer is shown seventeen payroll configuration screens for a module
they cannot use, which reads either as a broken product or as an entitlement
they have. Reachable in production today with no special role and no crafted
request — a tenant administrator sees it on their first visit to Settings.

Not CRITICAL: no cross-tenant exposure, no data loss, and the API gate refuses
the underlying data once enforcement leaves REPORT_ONLY.

## Affected Areas

`apps/web` — the settings runtime resolver, the workspace, category and group
landings, the settings side navigation and the settings layout.
`services/api/src/modules/tenant-settings` and
`services/api/src/common/constants/tenant-features.ts` — the capability catalog,
which gained `desktop-agent`.

## Proposed Resolution

Fixed under [[PLAN-031]]. An explicit attribution from every settings item to
one capability key or to an explicit `CORE` marker, consumed by the settings
resolver and by a boundary in the settings layout that answers direct URLs. The
attribution is compared against the built item set by a spec, so a new settings
page cannot ship unattributed.

Fails closed: an unresolved entitlement set renders a stated error rather than
the full tree. No role bypasses it.

## Acceptance Criteria

- A Starter tenant sees no Payroll & Finance tile, no Payroll Geography group,
  no Timesheet Settings row and no Apps & Modules group.
- A tenant administrator (`global-admin`, `system-admin`, `system-customizer`)
  sees exactly the same set as an ordinary settings user on the same plan.
- `/settings/payroll/cycles/payroll-periods` typed directly renders "not
  included in your plan", not the page and not a 404.
- "Not included in your plan" and "you do not have access" are distinguishable,
  and the former links to the subscription screen.
- The subscription page is visible on every plan, including one entitling
  nothing.
- An entitlement set that cannot be resolved produces an error state, never a
  filtered tree and never the full tree.
- A settings item with no attribution fails the build.
- No code branches on a plan key, name or id.

## Regression Coverage

REG-396.
`apps/web/app/(authenticated)/settings/_lib/settings-entitlements.spec.ts` — 21
assertions covering the four leaks, the administrator case, the fail-closed
throw, the empty-plan case and the attribution completeness of the built item
set. Mutation-tested: forcing `isSettingsItemEntitled` to return true fails 8 of
them; replacing the fail-closed throw with an empty set fails 1.

## Dependencies

None outstanding. [[BUG-1952]] built the API enforcement this mirrors and is
closed. [[BUG-0994]], which made plan entitlements unsavable in Platform Admin,
is verified — without it custom plans could not be configured at all.

## Related Items

- [[BUG-1952]] — the API half of the same defect; this is the settings surface
  it did not reach.
- [[BUG-0994]] — plan entitlement editing, a prerequisite for custom plans.
- [[PLAN-031]] — the ExecPlan.
- [[ADR-0005]] — the five capability-attribution decisions.
- Modules — [[settings]], [[tenant-application]]

## Resolution

Fixed on `agent/settings-plan-entitlements`.

- `apps/web/app/(authenticated)/settings/_lib/settings-entitlements.ts` — the
  attribution for all 87 settings items, plus `isSettingsItemEntitled` and
  `missingCapabilityLabels`.
- `settings-runtime.ts` — `resolveVisibleSettingsRuntime` takes the entitlement
  set and throws `SettingsEntitlementsUnavailableError` rather than guessing;
  `subscription` placed under General Setup > Plan & Billing with its
  implementation route corrected to `/settings/subscription`;
  `document-templates` moved to People > Document Rules.
- `settings-entitlement-boundary.tsx` — one guard in the settings layout,
  covering the generic runtime routes and the purpose-built pages alike.
- `settings-plan-state.tsx` — the two states, kept distinct from access-denied.
- `tenant-entitlements-provider.tsx` — the entitlement set as its own context,
  separate from the shell user.
- `tenant-settings.catalog.ts`, `tenant-features.ts`, `plans.catalog.ts` — the
  `desktop-agent` capability, sold from Growth upward.

## QA Retest

Awaiting a QA run against a provisioned Starter tenant. Automated coverage is in
place and passing; the manual pass in [[PLAN-031]] (upgrade to Enterprise and
back with no deploy) has not been run against a live stack.

## Second round — the residual, and the IA

The first fix gated every page a capability key existed for. It could not gate a
page no key covered, and the per-plan audit that followed measured the gap: 41 of
87 pages rendered on every plan, including a tenant entitled to nothing. Several
were free only because the catalog was coarser than the settings tree.

Three capabilities were carved out ([[ADR-0005]] Decisions 6 and 7):

| Key | Pages | Sold from | Was |
|---|---|---|---|
| `attendance-integrations` | 8 | Growth | riding on `attendance`, which every plan holds |
| `compliance` | 4 | Enterprise | CORE |
| `data-management` | 1 | Growth | CORE |

The attendance block is the one that mattered: terminals, the on-premise .NET
gateway, device provisioning and employee mapping were attributed to
`attendance`, so a Starter tenant could configure all of it. No attribution could
fix that — the key itself was wrong.

A Starter tenant now resolves to 54 pages, from 67 after the first round and 87
before any of this work. A tenant entitled to nothing resolves to 35.

Two IA changes shipped alongside, both presentation and neither structural. A
category whose every group holds a single page renders its pages directly —
Notifications & Communication was four groups for four pages, Appearance &
Experience two for two — and the workspace tile counts pages rather than groups,
which had been counting containers and shifting with the plan. Nothing moved and
no URL changed.

One first-round decision was reversed. `subscription` had been placed in a new
"Plan & Billing" group; it now sits in the existing Apps & Modules group.
Inventing a group so a page can fall on one side of a paywall makes the IA a copy
of the price list, and restriction belongs on the item. That placement also
avoided a collision: the `tenant` group key equals the `tenant` item key, so item
resolution wins at `/settings/general-setup/tenant` and that group's landing is
unreachable — harmless while it held one page, and it would have hidden
Subscription the moment it held two.

Carving keys out of what was free needs grandfathering for plans the catalog does
not own. `npm run repair:plan-capabilities` grants the missing rows on
operator-created plans only; the four catalog plans are converged by
`reconcilePlanFeatures`, which is how Starter is meant to lose what it was never
sold.

## History

- 2026-09-09 — reported by the user with a screenshot of the Configuration
  workspace on the Starter demo tenant showing a Payroll & Finance tile.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0094. Not
  PLAN_REQUIRED despite the size: [[BUG-1952]] had already made the hard
  decisions — where the boundary lives, how it fails, who bypasses it — and this
  is the same decision applied to a surface it missed.
- 2026-09-09 — audit of all 87 settings items found three leaks below the tile
  level and two reverse faults around `subscription`.
- 2026-09-09 — fixed under [[PLAN-031]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0126]], [[ITEM-0127]]
- Modules — [[tenant-application]], [[settings]]
- Regression — REG-396 (see the regression register)

<!-- GRAPH:END -->
- 2026-09-09 — second round. Per-plan audit measured 41 always-visible pages;
  three capabilities carved out, two IA presentation changes shipped, and the
  first round's "Plan & Billing" group reversed into an existing group. Starter
  resolves to 54 pages. [[ITEM-0126]] closed DONE, [[ITEM-0127]] reduced and left
  deferred.
