---
ID: ADR-0032
aliases: [ADR-0032]
Title: Work management entitlement tiers
Status: ACCEPTED
CreatedAt: 2026-11-28
UpdatedAt: 2026-11-28
---
# ADR-0032 - Work management entitlement tiers

## Status

Accepted - 2026-11-28. Approved by the owner through an interactive question in the
DP-MASTER session on 2026-11-28. Closes ITEM-0250 (no plan gate on work routes) and
ITEM-0248 (no seeded role could package work components).

## Context

The work routes (`/work-items`, `/work-duties`, `/work-decisions`, `/work-meetings`,
`/work-blockers`, `/work-queues`, `/daily-updates`, `/contributions`, `/work-profiles`)
carried no `@RequireEntitlement`, and no feature key sold them, so every plan had all of
them. The work module had not reached production, so no customer holds a right to it.

## Decision

1. Two tenant feature keys, registered in the catalog (`TENANT_FEATURE_DEFINITIONS`):
   - `work-management` - work items, queues, blockers, contributions and evidence, duties,
     meetings and decisions, daily updates, work profiles, stakeholder digests and basic
     utilization. Sold on **Growth and Enterprise**.
   - `work-intelligence` - advanced intelligence and automation, and ALM packaging of work
     components (adding them to a package, analysing or applying an import of them).
     Sold on **Enterprise only**.
2. **Starter gets neither**: basic HR tasks only.
3. Custom plans and `TenantFeature` overrides behave as for every other key (MANUAL is
   capped by the plan, CUSTOM can grant).
4. `work-management` is a module gate (`ENTITLEMENT_GATED_MODULES` for `work-items`,
   `daily-updates`, `work-profiles`, `contributions`), enforced by `EntitlementGuard`.
   `work-intelligence` is enforced in the service layer
   (`WorkComponentsService.assertPackagingEntitled`, through
   `TenantEntitlementService.assertEntitled`) because the controllers that reach it are
   shared with `work-management`. Non-work components never pass through it.
5. The web sidebar, the `/work` route group and the work settings pages are gated by the
   same feature key.
6. ITEM-0248: the System Customizer role holds the ALM package permissions and
   `work-profiles.read/manage` and `work-queues.read/manage`, so one seeded role can add
   work components to a package. No other role changes.

## Configuration routes and the System Customizer (owner decision, 2026-11-28)

Work profile and queue configuration is separated from operational employee access. The
configuration routes of `work-profiles` and `work-queues` (and the profile reads the
Customizer needs) accept either their original employees privilege or a customization
privilege (`configure` for writes, `read` for reads). The System Customizer holds only
customization privileges plus `customization:IMPORT`, and no employees privilege.
HR, CEO, manager and the admin roles reach exactly the same routes as before.

## Existing rights

Nothing that is granted today is removed. The gate applies to features not yet on
production. Catalogue plans are reconciled from the catalogue on every `seed:config`
(`reconcilePlanFeatures`), which adds the new rows without touching prices. Custom plans are
never reconciled and receive the keys only by an explicit operator grant.

## Consequences

- A Starter tenant is refused with `TENANT_FEATURE_NOT_ENTITLED` (in ENFORCE mode) on every
  work route; REPORT_ONLY logs `ENTITLEMENT_WOULD_REFUSE`.
- A Growth tenant can use work management but cannot package work components for ALM.
- Role grants reach existing tenants on the next `seed:config` run through
  `PermissionBootstrapService`, which only adds missing grants.

## Reversibility

Moving a capability between tiers is a one-line edit to `plans.catalog.ts` plus the next
deploy. Withdrawing the gate is deleting the decorator and the `ENTITLEMENT_GATED_MODULES`
entries. Removing the Customizer grants is a matrix edit, but existing tenants keep the
rows already written until they are removed by hand.

## References

- ITEM-0250, ITEM-0248
- `docs/decisions/ADR-0031-work-components-in-the-package-engine-and-accountability-rules.md`
