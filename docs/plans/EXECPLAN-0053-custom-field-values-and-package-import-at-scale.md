CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, services/api/prisma/AGENTS.md, apps/web/AGENTS.md
  - docs/plans/EXECPLAN-0052-package-alm.md (D-1, the deferral this plan reverses)
  - docs/architecture/customization-packages.md

SPECIALIST_AGENTS_REQUIRED:
  - database        — CustomRecordExtension model + additive migration (WP-02)
  - backend-api     — batched import (WP-01), value storage and validation (WP-02)
  - frontend        — employee form integration (WP-03)
  - security        — tenant scoping, masking, read/write permission on values
  - qa              — DB-backed e2e for values and for import scale; HTTP pass on a booted API
  - reviewer, integrator, knowledge & graph
DELIBERATELY_NOT_USED:
  - integration     — no external system
  - release/devops  — develop first; a release is a separate step

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma, services/api/prisma/migrations/**   (WP-02 only)

QA_REQUIRED: yes  (TENANT, DATABASE, SECURITY, PERFORMANCE)

TARGET_BRANCH:            develop   (MAIN_CHANGE_STATUS must stay UNTOUCHED)
TARGET_ENVIRONMENT:       LOCAL (throwaway Postgres DB dijipeople_fv_test)
ROLLBACK_CLASS:           DATABASE_ADDITIVE
INTEGRATOR_REQUIRED:      yes
MERGE_STRATEGY:           ref-push of the CI-verified SHA

# EXECPLAN-0053 — Custom field values on system modules; package import at scale

Task: [[TASK-0034-custom-field-values-on-system-modules-package-import-at-scal]].

## Owner decisions

- 2026-09-26 — "DP: Fix them and continue", given against the three caveats
  TASK-0033 reported. It **reverses D-1 of EXECPLAN-0052**: value storage for
  custom fields on system modules is now in scope, not a separate later task.
- No product question arose that the repository could not answer.

## Objective

1. A package of about 1,700 components imports well inside the 120 s
   transaction timeout against a remote database (TASK-0033 caveat 2).
2. A published custom field on Employees stores a value per employee, is
   validated by its definition, and is shown and edited on the employee form
   (BUG-3697).

## Architecture decisions

**Import in batches, Core sync outside the transaction.** `applyImport` walks
`PORTABLE_COMPONENT_TYPES` in order and applies one batch per type: new rows via
`createMany` plus one read-back, changed rows one by one, membership rows in one
`createMany`. `syncCore` runs before the transaction instead of inside every
metadata read. Measured: 7,444 database operations → 43 for an install, 246 for
a 121-component upgrade (`customization-package-alm-scale.e2e-spec.ts`).

**One generic extension table, not a column per system model.**
`CustomRecordExtension (tenantId, tableKey, recordId, values Json)`, unique on
the triple. One additive migration serves every system module; a JSON column on
each of ~50 models would be 50 migrations and 50 read paths. The table has no
foreign key to the record because `recordId` points at a different model per
`tableKey`; it cascades with its tenant and is listed in the tenant-erasure
order.

**The owning module decides access; the value service only stores.**
`CustomFieldValuesService` has no controller. `EmployeesService` resolves the
employee and the caller's access to it first, then reads or writes values by
id. That keeps object-level authorization where it already lives.

**One set of value rules.** `custom-field-values.ts` is shared by custom
modules (`CustomDataRecord`) and system-module extensions, so a field cannot
accept a value in one place and refuse it in the other.

**Only published fields count**, the rule custom modules already follow.

**A form posts every field back.** A submitted value equal to what that user
reads today (including a masked value) is not a write; an empty read-only field
is not a write.

**Required custom fields are enforced only when `customFields` is submitted.**
Imports, onboarding and hires create employees without knowing a tenant's
custom fields and must not start failing because one was made required.

## Scope boundaries (follow-up, not in this plan)

- Lookup-type custom fields on the employee form (the page has no route to
  load a custom lookup's options).
- Custom fields as employee list-view columns and in the employee export.
- Custom fields on system modules other than Employees: the storage is
  generic, but each module's service must opt in as `EmployeesService` does.

## Work packages

| WP | Title | Owner |
|---|---|---|
| WP-01 | Batched import, Core sync outside the transaction, scale e2e | backend-api |
| WP-02 | CustomRecordExtension, shared value rules, EmployeesService wiring, e2e | database + backend-api |
| WP-03 | Employee form: fields, section, values, payload, field errors | frontend |
| WP-04 | QA: e2e suites, HTTP pass on a booted API, records | qa |

## Testing strategy

- `custom-field-values.spec.ts` — every rule, pure.
- `custom-field-values.e2e-spec.ts` — publish gating, merge and clear, masking,
  unchanged read-only and masked values, field errors, tenant isolation.
- `customization-package-alm-scale.e2e-spec.ts` — operation counts for install,
  reinstall and upgrade.
- `employee-custom-fields.spec.ts` (web) — metadata, section, values, payload,
  error mapping.
- A booted API against a seeded throwaway database, driven over HTTP.

## Rollback

Additive. Reverting the code leaves an unused table; dropping it loses only
values entered after the release.

## Divergences

None from this plan. The deferral it reverses is recorded above.
