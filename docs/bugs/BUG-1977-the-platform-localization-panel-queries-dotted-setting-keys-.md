---
ID: BUG-1977
aliases: [BUG-1977]
Title: The platform Localization panel queries dotted setting keys that no row can ever hold
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-control-plane, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-327
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1977 — The platform Localization panel queries dotted setting keys that no row can ever hold

## Summary

The tenant configuration query in the platform control plane looks for
`TenantSetting` rows whose `key` is `organization.country`,
`organization.timezone` and so on. `category` and `key` are separate columns and
no writer ever puts a dotted composite in `key`, so the `IN` list can never
match. The query returns an empty array for every tenant, always, and the admin
Localization panel renders an empty state that asserts the tenant has not
configured localization — for tenants that have.

## Expected Behavior

The Localization panel shows the tenant's country, timezone, locale, currency and
date format as configured, and shows its empty state only when they genuinely are
unset.

## Actual Behavior

The panel always renders:

> **This tenant has not configured localization yet.**
> Country, timezone, locale and currency are set by the tenant's own
> administrators during organization setup.

regardless of what the tenant has configured.

## Reproduction

**Reproduced live on production, 2026-08-29.** This record was originally filed
from code alone; the panel has since been observed doing exactly what the code
predicted, on a tenant whose values are demonstrably set.

1. Open Platform Admin (`https://admin.dijipeople.com`) > Tenants >
   **DijiPeople Demo** > **Configuration** tab > **Localization**. It renders,
   verbatim:

```
Localization
Read-only. Source: Tenant organization settings. These are tenant organization
settings and are changed inside the tenant application.

This tenant has not configured localization yet.
Country, timezone, locale and currency are set by the tenant's own administrators
during organization setup.
```

2. From the tenant side, `GET /api/tenant-settings/resolved` > `organization`
   returns, for that same tenant:

```
timezone     : "UTC"
currency     : "USD"
dateFormat   : "MM/dd/yyyy"
timeFormat   : "12h"
weekStartsOn : "MONDAY"
```

   Every value the panel claims is unset is set.

3. Repeat on any other tenant: the empty state is unconditional.

## Evidence

**Live**, 2026-08-29 on production: the rendered panel text and the contradicting
`GET /api/tenant-settings/resolved` response, both quoted under Reproduction. The
panel makes a false statement about the customer's own data to the platform
operator, and the tenant-side response is the proof that it is false. This
upgrades the record from code-inferred to reproduced.

Code, at `eb457d9d`:

- `services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts:222-235`:

```ts
this.prisma.tenantSetting.findMany({
  where: {
    tenantId: tenant.id,
    key: { in: [
      'organization.country', 'organization.timezone', 'organization.locale',
      'organization.currency', 'organization.dateFormat',
    ] },
  },
  select: { key: true, value: true },
}),
```

- `services/api/prisma/schema.prisma:7461-7476` — `TenantSetting` has separate
  `category` and `key` columns, `@@unique([tenantId, category, key])`. `key` never
  holds a dotted composite.

- **No writer produces a dotted key.** Exactly two writers exist and both write the
  columns separately: `tenant-settings.repository.ts:191-217` (`upsertSettings`,
  keyed on `tenantId_category_key`) and `seed-config.ts:2208-2223`
  (`category: 'notifications', key: 'emailEnabled'`). The only migration touching
  `TenantSetting` rows
  (`20260728234000_attendance_mandatory_location_capture/migration.sql`) also
  treats them as separate columns.

- The consumer confirms the author's intent —
  `tenant-control-plane.service.ts:284-293`:

```ts
localization: {
  readOnly: true,
  source: 'Tenant organization settings',
  values: Object.fromEntries(
    settings.map((item) => [item.key.replace('organization.', ''), item.value]),
  ),
},
```

  The `.replace('organization.', '')` shows dotted keys were expected: the defect
  is a consistent misunderstanding of the schema, not a typo.

- The rendered empty branch:
  `apps/admin/app/_components/tenants/tenant-configuration-panel.tsx:105-123`.

**A compounding error survives the obvious fix.** `organization.locale` does not
exist: per-category, `locale` belongs to `system`
(`tenant-settings.catalog.ts:685`), while `timezone`, `country` and `currency` are
`organization`, and `dateFormat` exists in **both** categories. So rewriting the
query as `{ category: 'organization', key: { in: [...] } }` would still return
nothing for `locale` and would silently pick the `organization` copy of
`dateFormat`.

## Root Cause

Established: the query filters a composite `category.key` string against a column
that holds only the key.

## Impact

A support engineer opening Tenants > Configuration to check a customer's timezone
before debugging, say, a payroll cut-off complaint is told the tenant has not
configured localization, and passes that on to the customer. The panel is
incapable of ever showing a value, and its empty state actively asserts a false
fact about the customer's data.

Rated MEDIUM: internal-facing, no data is changed or exposed, but it reliably
misleads the people diagnosing customer problems.

## Affected Areas

`services/api/src/modules/tenant-control-plane` (`tenant-control-plane.service.ts`
tenant configuration query and its `localization` projection); `apps/admin`
tenant configuration panel.

## Proposed Resolution

Query by `category` and `key` as separate columns, and resolve each of the five
values from the category that actually owns it — `locale` from `system`, and a
deliberate choice for `dateFormat`, which exists in both. Then make the empty
state conditional on the result rather than the default branch, so an empty panel
means "unset" instead of "unqueryable".

## Acceptance Criteria

- The Localization panel shows the demo tenant's configured timezone (`UTC`),
  currency (`USD`) and date format (`MM/dd/yyyy`) — the values it currently
  denies exist.
- `locale` resolves from the `system` category.
- The `dateFormat` source category is chosen explicitly and documented in the
  code.
- The empty state appears only when the tenant genuinely has no values.

## Regression Coverage

None yet. A service test asserting the query returns the seeded organization
settings for a tenant would fail today.

## Dependencies

None identified.

## Related Items

BUG-1974 (dead catalog keys) and BUG-1976 (mismatched key names) come from the
same settings audit; this one is a reader in the platform control plane rather
than a tenant-facing control.

## Resolution

Fixed on `agent/bugfix-settings`. The panel now resolves its values through the
settings resolver instead of filtering a column on a composite it can never
hold, and all three compounding errors the record identified are handled
explicitly rather than by accident.

**The query.**
`services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts:204-257`
— the `tenantSetting.findMany` that filtered `key IN ('organization.country', …)`
is gone. `configuration()` now calls
`TenantSettingsResolverService.getOrganizationSettings(tenant.id)` and
`getSystemSettings(tenant.id)`, so the panel shows the tenant's *effective*
values rather than only those that happen to have a persisted row. The comment
at `:224-235` records why the old shape could never match, so the next reader
does not reintroduce it.

**`locale` comes from the category that owns it.**
`tenant-control-plane.service.ts:275-278` reads `system.locale`. There is no
`organization.locale`, which is why the naive fix — rewriting the query as
`{ category: 'organization', key: { in: [...] } }` — would still have returned
nothing for it.

**`dateFormat`'s source category is chosen and documented.**
`tenant-control-plane.service.ts:279-287` takes the `organization` copy, because
`ConfigurationResolverService.resolveAppContext`
(`services/api/src/modules/tenant-settings/configuration-resolver.service.ts:55`)
computes `organization.dateFormat || system.dateFormat` — so the organization
copy is the one the tenant application actually renders with, and therefore the
one a support engineer needs to see.

**`country` was not resolvable at all.** `OrganizationSettingsResolved` did not
carry it, so it was added:
`services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts:52`
(type) and `:509` (`country: stringValue(category.country, '')`).

**The empty state now means "unset".** The payload carries a new
`localization.configured` flag —
`tenant-control-plane.service.ts:265-272`, typed at
`apps/admin/app/_components/tenants/tenant-control-plane.client.ts:419-430` —
set from a narrow existence query over the five `(category, key)` pairs. The
panel (`apps/admin/app/_components/tenants/tenant-configuration-panel.tsx:45-52`
and `:107-118`) drops blank values before deciding, and when nothing has been
configured it says so in the card description rather than denying the values
exist. Values are still shown, because an operator needs to see the effective
setting either way.

**Coverage.**
`services/api/src/modules/tenant-control-plane/tenant-localization-panel.spec.ts`
— five tests. Two of them fail against the old code for the reasons the record
gives: `returns the tenant configured localization instead of an empty object`,
and `never filters TenantSetting on a dotted composite key`, which asserts on the
serialised Prisma arguments so the defect cannot return in a different shape. The
`dateFormat` test pins the organization copy by making the system copy differ.

Three existing specs construct `TenantControlPlaneService` positionally and were
updated for the new dependency: `tenant-control-plane.service.spec.ts`,
`tenant-subscription-cancel.spec.ts`, `activation-advisories.spec.ts`.

## QA Retest

Awaiting a QA run. The acceptance criteria are directly checkable on the
DijiPeople Demo tenant: Platform Admin > Tenants > DijiPeople Demo >
Configuration > Localization should now show the timezone, currency and date
format that `GET /api/tenant-settings/resolved` reports for the same tenant.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — query bug, now reproduced live.
- 2026-08-29 — fixed in SESSION-0076 on `agent/bugfix-settings`. The premise held exactly as recorded, including the compounding `locale` and `dateFormat` errors. Resolved by resolving through the settings resolver rather than repairing the query, which also fixes the case the record did not raise: a tenant whose values are defaults rather than rows.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]], [[platform-admin]]
- Regression — REG-327 (see the regression register)

<!-- GRAPH:END -->
