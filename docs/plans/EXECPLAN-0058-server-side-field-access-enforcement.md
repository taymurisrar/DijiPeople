# ExecPlan — Server-side field-access enforcement (BUG-3155)

> Required by `PLANS.md` (authorization change across many modules). Drafted 2026-11-23 from an independent read-only design review of SESSION-0137; every file reference was read at HEAD `7dbf895d`.

CONTEXT_FILES_REQUIRED: |
  - AGENTS.md, services/api/AGENTS.md
  - docs/decisions/ADR-0024 (custom fields through one interceptor — the pattern reused here)
  - services/api/src/modules/tenant-settings/field-security.controller.ts
SPECIALIST_AGENTS_REQUIRED: |
  - backend-api — service, interceptor, bindings, write guards
  - security reviewer — policy algebra, filter/sort oracles, write-back stripping
  - frontend — WP-4 only (restricted-field rendering, stop the fail-open)
  - qa — real HTTP + Postgres suite, sentinel sweep, mutation proof
DELIBERATELY_NOT_USED: |
  - database (no migration: FieldSecurityPolicy/Rule already exist, schema.prisma ~7769-7813)
  - a Prisma middleware/extension (`$use` is inert on Prisma 7.8)
  - a new per-field privilege dimension in rbac-matrix (a third permission system)
SINGLE_WRITER_FILES: common/constants/permissions.ts, rbac-matrix.ts (WP-2 only)
QA_REQUIRED: yes
KNOWN_BUG_PATTERNS_IN_SCOPE: sensitive-field-overexposure, read-filter-without-a-write-check, gate-scoped-to-one-structure, fail-open-scope
TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: no
ROLLBACK_CLASS: CODE_ONLY (WP-1, 3, 4, 5); CONFIG_AND_CODE (WP-2 role grants)
INTEGRATOR_REQUIRED: yes
MERGE_STRATEGY: ref-push fast-forward to develop after exact-SHA CI

## Objective

The API is the only place that decides whether a field is visible, masked or hidden, and the decision holds for JSON reads, writes, filters, sorts, search, counts, exports and reports. The browser renders; it is not the control.

## Established facts

- The tenant rules exist but only the settings controller reads them (`field-security.controller.ts` runtime-rules and `runtimeRulesFromFieldSecurityRule`). Nothing on the server applies them.
- Browser masking is fail-open: the employee page fetches rules with `.catch(() => [])`, and the endpoint needs `field-security.read`, which managers do not hold, so for them nothing is masked. The `FULL` mask also reveals the value length.
- Server-side sensitivity already exists in five unrelated places: `canViewCompensation`, `benefits.read-sensitive`, custom-column `readPermission` + `mask`, reporting `sensitivity: RESTRICTED`, and always-on last-4 masks (loans, employer bank accounts, tax profiles).
- Custom-module view filter and sort check `readPermission` but not `mask`, so filtering on a masked column is an oracle.

## Response paths that serialise sensitive fields (ranked)

| # | Route | Fields |
|---|---|---|
| R1 | `GET /employees` (`mapEmployee`) | `cnic`, `taxIdentifier` for every row; reporting managers see all reports |
| R2 | `GET /employees/:id` (`getProfile`) | `cnic`, `taxIdentifier` in `personalInfo`/`employmentInfo` |
| R3 | `GET /employees/:id/hierarchy` | `cnic`, `taxIdentifier` of any employee in the tenant (tenant-only scope) |
| R4 | `GET /payroll/compensations(/:id)` | `basicSalary`, full bank account/IBAN/routing, `taxIdentifier` |
| R5 | `GET /payroll/payslips(/:id)` | `employee.taxIdentifier`, whole `document` row incl. `storageKey` |
| R6 | `GET /employees/:id/compensation` | code-gated, but tenant rules ignored |
| R7 | compensation history / active compensation | `baseAmount`, components; tenant-only check |
| R8 | custom-module views | masked custom columns via filter/sort |
| R9 | `PATCH /employees/:id` and similar | same as R1 in the response |

## Design

1. `FieldAccessService` (tenant-settings, exported) is the only compiler of `FieldSecurityRule`; the controller's runtime-rules endpoint calls it. `forRequest(user, tableKey)` is memoised per request and returns a decision with `effect(field)` = VISIBLE | MASKED | HIDDEN, `project`, `assertQueryable`, `searchable`, `writable`. Most restrictive wins.
2. `common/security/sensitive-field-catalog.ts` is the single home for which system columns are sensitive and which privilege reveals them (COMPENSATION, BANK, IDENTITY, INTERNAL).
3. One masker (`common/security/field-mask.ts`): FULL with fixed width, PARTIAL, LAST_4, CUSTOM; a masked number becomes `null`.
4. `@FieldAccess(table, role, paths?)` plus a global `FieldAccessInterceptor` registered as `APP_INTERCEPTOR` inside a module (as the custom-fields runtime does), wrapping outside `CustomFieldValuesInterceptor`; a fail-closed sweep nulls any undeclared alias of a restricted column. Exports and reports call the service directly.
5. Hidden = key kept with value `null`; masked = server-computed string; detail responses gain an additive `restrictedFields: string[]`.
6. A field the caller cannot see in clear may not appear in a filter, sort, group-by, aggregate or search predicate: explicit filter/sort is refused with `FIELD_ACCESS_FORBIDDEN` (403); free-text search drops the column. A refused predicate never reaches Prisma, so counts cannot be an oracle.
7. Writes strip fields the caller cannot read in clear or that are read-only to them, keeping the stored value (the web adapter always posts `cnic`/`taxIdentifier`, so a 400 would break every save).

## Work packages

- WP-1 (FIX_NOW): enforce tenant rules on R1–R5, write-strip on the four write paths, list filter/sort/search refusal, `FIELD_ACCESS_FORBIDDEN`. Needs no owner decision.
- WP-2 (blocked on D1, D2): baseline catalog, `employees.read-sensitive` key and grants, bank last-4 in JSON.
- WP-3: R6, R7, R9, bank accounts and tax profiles on the shared masker, entity data API and custom-view query checks, duplicate-check must not echo identity values.
- WP-4 (web): render `restrictedFields`, stop posting restricted keys, remove the fail-open catch, fix the length leak.
- WP-5: reporting consumes the decision; consolidate the three maskers; route-census sentinel sweep.

## Owner decisions

- D1 which roles get `employees.read-sensitive` by default (recommended: hr, payroll-manager, global/system admins, and self; not managers or recruiters — removes the CNIC/tax id managers see today).
- D2 bank numbers as LAST_4 in every JSON response including for payroll staff, full values only in the payroll bank file (recommended: yes).
- D3 unscoped tenant policies apply to elevated roles too (today's UI semantics).
- D4 `defaultBehavior` stays out of scope (recommended).
- D5 employee-document confidentiality is a record/category rule, filed as a separate product decision.

## Test plan

- Unit: masker patterns, rule merge, self exception, projector paths and the sweep, write-strip.
- E2E (real HTTP + Postgres, `describeWithDatabase`): tenants A and B with random sentinels; the manager's response to every R1–R5 route contains no sentinel; owner controls (admin and self see the value, tenant B unaffected); filter/sort/search oracles refused; masked write-back leaves the row unchanged.
- Mutation proof (assert the mutation applied, restore with an edit): remove the decorator from `GET /employees`; invert the merge; remove `assertQueryable`; remove the write-strip; remove the fail-closed sweep. Each must fail a test.
- Gates: preflight, api test and whole e2e set, typecheck, lint budget, boot the API once to prove the interceptor wiring, framework validation, query budget recheck.

## Adjacent defects (separate records, not triaged here)

`getHierarchy`/`getDirectReports`/`getReportingStructure` scope by tenant only; `listPayslips` has no row scope; `listCompensations` covers the whole tenant; compensation history checks tenant only.

## Rollback

Code-only for WP-1/3/4/5: revert the commit. WP-2 grants revert with the migration-free seed change.
