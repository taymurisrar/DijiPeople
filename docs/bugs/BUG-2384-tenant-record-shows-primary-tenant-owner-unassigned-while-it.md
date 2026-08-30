---
ID: BUG-2384
aliases: [BUG-2384]
Title: Tenant record shows Primary Tenant Owner Unassigned while its readiness check reports one active Tenant Owner
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: d3c43e08
AffectedModules: [services/api/src/modules/tenant-control-plane, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-366
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2384 — Tenant record shows Primary Tenant Owner Unassigned while its readiness check reports one active Tenant Owner

## Summary

The platform admin tenant record renders two different facts under the same
name, a few hundred pixels apart, and they read as a contradiction. The header
field **PRIMARY TENANT OWNER** shows `Unassigned`; the **Tenant readiness** panel
directly below shows **Ok — Tenant Owner — "1 active Tenant Owner."**

Neither is wrong. They measure different things: the header reads
`Tenant.ownerUserId`, and the readiness check counts users holding the
`GLOBAL_ADMIN` role. But an operator has no way to know that from the screen, and
the natural reading is that the page disagrees with itself.

## Expected Behavior

A tenant record should not present two contradictory answers to what appears to
be the same question. Either the two labels should be distinct enough to read as
different facts — "Primary owner" versus "Accounts with owner access" — or the
readiness check should reflect the designated primary owner.

## Actual Behavior

On `https://admin.dijipeople.com/tenants/<tenant-id>` for the `dijipeople-demo`
tenant, observed 2026-08-30:

- Header: `PRIMARY TENANT OWNER` → **Unassigned**
- Readiness panel: `Tenant Owner` → **Ok**, "1 active Tenant Owner."

The tenant is `Active`, `Starter`, `Monthly`, and passes eight of nine readiness
checks. The ninth, "Agreement executed", is a genuine warning and unrelated.

## Reproduction

1. Sign in to `https://admin.dijipeople.com` as a platform administrator.
2. Open **Tenants** and select a tenant whose `ownerUserId` is null but which has
   at least one active, non-service-account user holding `GLOBAL_ADMIN` —
   `dijipeople-demo` is one at the time of writing.
3. Read the header field `PRIMARY TENANT OWNER` and the `Tenant Owner` row of the
   **Tenant readiness** panel on the same screen.

Both are visible without scrolling at 1440x900.

## Evidence

The two values are computed from different sources:

- **Readiness panel** —
  `services/api/src/modules/tenant-control-plane/tenant-access.service.ts:697`,
  `countActiveOwners()`. Counts `User` rows where `tenantId` matches,
  `isServiceAccount: false`, `status: ACTIVE`, and a `userRoles` entry whose role
  `key` is `ROLE_KEYS.GLOBAL_ADMIN`. Returns 1 for this tenant.
- **Header field** — `Tenant.ownerUserId`, null for this tenant. The same service
  treats it as the primary-owner designation and transfers it explicitly
  (`tenant-access.service.ts:570`, "Move the primary-owner designation to another
  active Tenant Owner").

So `ownerUserId` is a *designation* and `countActiveOwners()` is a *capability
count*. Provisioning can leave the first unset while the second is satisfied.

## Root Cause

Not established beyond the above. What is established: the two figures come from
different sources by design, and the screen labels both "Tenant Owner" without
distinguishing designation from capability. Whether `ownerUserId` *should* have
been set during provisioning for this tenant is a separate question and is not
answered here.

## Impact

Platform operators only. No tenant-facing surface, no data exposure. The
practical cost is wasted effort and misplaced confidence: an operator reading
"Unassigned" may try to assign an owner the tenant already effectively has, or
may start treating the readiness panel as unreliable — which matters more,
because the panel's whole value is that it is trusted.

Reachable in production, and observed there.

## Affected Areas

- `apps/admin` — the tenant record screen, Overview tab.
- `services/api/src/modules/tenant-control-plane` — `tenant-access.service.ts`,
  `countActiveOwners()` and the primary-owner designation.
- Entity: [[entity-tenant]] (`ownerUserId`).

## Proposed Resolution

A direction, not a patch, and a product decision rather than a mechanical fix:

1. **Relabel.** Cheapest and probably sufficient — the readiness row becomes
   "Owner access" or "Accounts with owner access", leaving "Primary tenant owner"
   as the only thing called owner.
2. **Or make the readiness check reflect the designation** — report a warning
   when `ownerUserId` is null even though capable users exist, on the argument
   that an undesignated primary owner is a real readiness gap.

Option 2 changes what the panel asserts and needs a decision on whether an
undesignated owner should block readiness. No ExecPlan needed either way.

## Acceptance Criteria

- A tenant with `ownerUserId = null` and at least one active `GLOBAL_ADMIN` user
  does not present two contradictory owner statements on one screen.
- Whichever direction is taken, the labels distinguish designation from
  capability without the reader needing to know the schema.

## Regression Coverage

None yet. A test asserting that two labels differ is brittle; the durable check
is on the copy, so this may belong in the admin labelling/accessibility suite
rather than in a new unit test. To be decided at fix time.

## Dependencies

None.

## Related Items

[[entity-tenant]] · [[tenant-control-plane]] · [[tenant-provisioning]] ·
[[BUG-1550]] — the same shape in the leads module, where a record showed two
different owners on one screen.

## Resolution

Fixed by relabelling the readiness check — option 1 in Proposed Resolution.

`tenant-control-plane.service.ts:1182` now emits `label: 'Owner access'` with the
message *"N account(s) can administer this workspace."*, replacing
`label: 'Tenant Owner'` and *"N active Tenant Owner(s)."*.

The record header keeps **Primary Tenant Owner**, which reads
`Tenant.ownerUserId`. The two are now distinguishable on the screen: one names a
designation, the other counts a capability, and a tenant can legitimately have
the second without the first.

Option 2 — making the readiness check reflect the designation and warn when
`ownerUserId` is null — was **not** taken. It changes what the panel asserts and
needs a decision on whether an undesignated owner should block readiness. That
question is unchanged by this fix.

No behaviour changed: `countActiveOwners()` is untouched, and the three error
messages elsewhere that say "active Tenant Owner" are about the owner *role*
(refusing to disable the last one, refusing to activate a tenant without one) and
were deliberately left alone.

## QA Retest

Not retested.

## History

- 2026-08-30 — created from Phase 5 UI discovery against production
  (`admin.dijipeople.com`, tenant `dijipeople-demo`), read-only navigation.
- 2026-08-30 — triaged **DEFER**. Real and reproducible, but LOW/P3 on a
  platform-operator screen with no data or authorization consequence, and the
  cheap fix is a copy change in `apps/admin` that a documentation task has no
  business making. Picked up whenever the tenant record screen is next worked
  on; option 1 in Proposed Resolution needs no decision, so it does not need to
  wait for one.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]], [[platform-admin]]
- Regression — REG-366 (see the regression register)

<!-- GRAPH:END -->
