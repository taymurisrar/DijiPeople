---
ID: BUG-3697
aliases: [BUG-3697]
Title: A custom field added to a system module has nowhere to store its values
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-26
DetectedInSha: cb202b99
AffectedModules: [customization, employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-638
RelatedBacklogItem: ITEM-0221
RelatedDecision:
RelatedImplementation: [docs/plans/EXECPLAN-0052-package-alm.md, docs/plans/EXECPLAN-0053-custom-field-values-and-package-import-at-scale.md]
CreatedAt: 2026-09-26
UpdatedAt: 2026-09-26
ResolvedAt: 2026-09-26
---

# BUG-3697 — A custom field added to a system module has nowhere to store its values

## Summary

**Fixed for Employees in TASK-0034.** A published custom field on Employees now stores a value for each employee. The value is validated against the field's definition and shown and edited on the employee form. The storage is generic across system modules; the Employees-only parts are split out as [[ITEM-0221]].

Original report: Customization lets an administrator add a field to a system module (for example "Employee Grade" on Employees), and a package can carry that field between environments. But no model stored the value anyone typed into it. Custom modules keep values in `CustomDataRecord.values`; system modules had no extension-value storage, and nothing outside the customization module read `CustomizationColumn`.

## Expected Behavior

A custom field added to a system module can hold a value per record, shown and edited on that module's forms and views, and exported with the record.

## Actual Behavior

Before the fix, the field definition existed and published, but there was nowhere to write a value, so no screen could offer one.

## Reproduction

1. Settings → Customization → Modules → Employees → Fields → add a text field.
2. Publish it.
3. Open any employee: the field is not on the record, and no API accepts a value for it.

## Evidence

- No `customFields` / `customValues` column on any model in `services/api/prisma/schema.prisma` (searched at cb202b99).
- Only `services/api/src/modules/customization/customization.service.ts` reads `customizationColumn`; the employees module never does.
- `services/api/src/modules/data/custom-module-runtime.service.ts` resolves published columns for custom modules only (`isCustom: true`).

## Root Cause

Custom-field storage was built for custom modules (CustomDataRecord) and never extended to system modules.

## Impact

Every tenant that adds a field to a system module gets a field that cannot hold data. Scenarios D and F of TASK-0033 work for definitions only. Reachable in production, though production had no custom columns on system tables when this was fixed (read-only check, 2026-09-26), so no data was at risk.

## Affected Areas

customization, employees (and every other system module exposed to Customization), the tenant record pages.

## Proposed Resolution

Owner decision D-1 (2026-09-26) first deferred this to a separate task. The owner's "DP: Fix them and continue" of the same day reversed that. See EXECPLAN-0053.

## Acceptance Criteria

- A custom field on Employees stores and returns a value per employee, tenant-scoped. **Met.**
- The value survives package import of the field definition into another environment; the definition travels, the values do not. **Met.** Values are keyed by field key, which the package preserves.
- Shown and edited on forms. **Met.** Views and export are **not** met; they are tracked in [[ITEM-0221]].

## Regression Coverage

REG-638:
- `services/api/test/custom-field-values.e2e-spec.ts`
- `services/api/src/modules/customization/custom-field-values.spec.ts`
- `apps/web/lib/runtime/modules/employee-custom-fields.spec.ts`

QA scenario [[QA-EMPLOYEES-001-a-published-custom-field-on-employees-stores-validates-and-s]].

## Dependencies

EXECPLAN-0053.

## Related Items

[[BUG-3698]] (draft field edits), [[ITEM-0218]] (portable scope), [[ITEM-0221]] (lookups, views, export, other modules).

## Resolution

Fixed in commits 6acf88ba (API) and ed67976d (form) on `agent/custom-field-values`, part of TASK-0034.

- **Storage.** A new model, `CustomRecordExtension (tenantId, tableKey, recordId, values Json)`, added by an additive migration. It is unique per record, cascades with its tenant, and is listed in the tenant-erasure order.
- **Service.** `CustomFieldValuesService` stores, reads and validates values, counting only published fields. It has no controller. `EmployeesService` checks access to the employee first, then:
  - validates before any write;
  - writes inside the create transaction or right after the update;
  - records the values in the audit before and after snapshots.
- **Shared rules.** Custom modules and system modules now use the same value rules (`custom-field-values.ts`). Those rules add option membership, min/max, email and URL checks.
- **Read permissions and masking** apply on read. A value posted back unchanged, including a masked one, is not a write.
- **Web.** The employee create, edit and detail forms show published fields in an "Additional information" section when no form places them. They send the fields as `customFields`, and a field-level error highlights its field.

## QA Retest

Retested 2026-09-26:
- The e2e suite passed, 6/6.
- The web and API unit tests pass.
- Steps 1–6 and step 8 of QA-EMPLOYEES-001 were driven over HTTP against a booted API on a seeded throwaway database.
- There was no browser pass: the Playwright MCP server did not connect.

## History

- 2026-09-26 — created from reviewer at `cb202b99`.
- 2026-09-26 — triaged by the Architect in TASK-0033.
- 2026-09-26 — D-1 reversed by the owner; fixed for Employees in TASK-0034. Views, export, lookups and other modules deferred to [[ITEM-0221]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0221]]
- Modules — [[customization]], [[employees]]
- Implementation — [[EXECPLAN-0052-package-alm]], [[EXECPLAN-0053-custom-field-values-and-package-import-at-scale]]
- Regression — REG-638 (see the regression register)

<!-- GRAPH:END -->
