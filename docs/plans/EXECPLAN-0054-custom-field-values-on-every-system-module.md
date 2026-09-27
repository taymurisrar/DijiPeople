CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, apps/web/AGENTS.md
  - docs/decisions/ADR-0024-custom-field-values-on-every-system-module-via-one-interceptor.md
  - docs/plans/EXECPLAN-0053-custom-field-values-and-package-import-at-scale.md (the Employees precedent)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api   — interceptor, decorator wiring on every bound controller, registry flags
  - frontend      — standard-runtime integration, settings adapters, bespoke forms, Employees list/export/lookups
  - security      — access stays with the handler; definitions endpoint on the reviewed list
  - qa            — interceptor spec, DB-backed e2e through the real app, browser pass on standard and bespoke forms
  - reviewer, integrator, knowledge & graph, release/devops (release to main at the end)

SINGLE_WRITER_FILES:
  - services/api/src/modules/customization/customization.registry.ts
  - apps/web/lib/runtime/modules/standard-module-route-helpers.ts, standard-module-data.adapter.ts

QA_REQUIRED: yes  (TENANT, SECURITY, UI, CONTRACT)

TARGET_BRANCH:            develop, then released to main
ROLLBACK_CLASS:           CODE_ONLY (no schema change; values table exists since TASK-0034)
INTEGRATOR_REQUIRED:      yes

# EXECPLAN-0054 — Custom field values on every system module

Task: [[TASK-0035-custom-fields-follow-up-lookups-list-columns-export-other-sy]]. Decision record: ADR-0024.

## Owner decision

On 2026-09-27 the owner chose "Generic hook, all modules" over three alternatives: a three-module pilot, Employees only, or blocking field creation.

## Objective

Every system table that a tenant can add a custom field to also stores, validates, shows and saves that field's values. Tables where that is impossible stop offering custom fields. On Employees, the ITEM-0221 gaps close as well: lookup-type fields, list-view columns and export.

## Table classes (from the route maps, 2026-09-27)

**A — no edit surface: made non-customizable.** These tables have no route through which anyone edits a record:
- emergencyContacts, employeeDocumentReferences and salaryComponents: no code uses them.
- leaveBalances, timesheets, timesheetEntries, payrollRunEmployees, payrollRecords and payslips: generated or state-only.
- userRoles and rolePermissions: join rows.
- workSessions: agent telemetry.
- tenantSettings: a key/value bag.

**B — generic record page.** Decorators on the API routes, plus one standard-runtime integration on the web:
- Standard specs: leaveRequests, attendanceEntries, payrollCycles, payrollPeriods, payrollRuns, candidates, jobOpenings (the create page), applications and projects.
- Settings adapters: employeeLevels, businessUnits, organizations, departments, designations, locations, teams, users, roles, leaveTypes, leavePolicies, holidayCalendars and workSchedules.

**C — bespoke web form.** Decorators on the API routes, plus the drop-in `CustomFieldsSection` in each form:
- claimRequests, claimTypes, claimSubTypes and payComponents;
- policies and policyAssignments;
- holidays, onboardingTemplates and onboardingTasks;
- employeeEducation, employeePreviousEmployment and employeeCompensations;
- documentCategories and documentTypes;
- the jobOpenings edit form.

**Employees:** already hand-wired (TASK-0034). This plan adds list rows, the export and lookup fields.

## Work packages

| WP | Title | Owner |
|---|---|---|
| WP-01 | Obsidian verify: duplicate plan ids, graph orphans | knowledge |
| WP-02 | Interceptor, decorator, definitions endpoint, audit action; A-class tables non-customizable; `createColumn` enforces the flag (BUG-3786) | backend-api |
| WP-03 | Decorators on every B and C route (create, update, read, list) | backend-api |
| WP-04 | Web: the standard runtime adds fields, section, values and payload; settings adapters map to table keys; field errors | frontend |
| WP-05 | Web: `CustomFieldsSection` in each C form | frontend |
| WP-06 | Employees: list rows, export columns, lookup options. Generic lookup options also fix custom modules (BUG-3787) | backend-api + frontend |
| WP-07 | QA: interceptor spec, DB-backed e2e through the booted app, browser pass on one B and one C form; records | qa |
| WP-08 | Integrate into develop, release to main, verify the deploy | integrator, release/devops |

## Risks

- **A response shape the interceptor does not recognise.** Values would then not be attached or stored. Mitigations: every bound route's shape is taken from the route map, and the e2e covers each shape class (plain record, wrapped record, array list and paged list).
- **A route bound with the wrong id param** would write values to the wrong record. Mitigation: the interceptor refuses to attach values to a response whose id differs from the record's. Update writes use the route's own id param, which the handler has just authorised.
- **Load on list endpoints.** Mitigation: the common case costs one indexed query, and loading values for a list is one query, not one per row.

## Divergences (recorded 2026-09-27)

- **Two more tables closed.** The bindings spec found `attendancePolicies` (a singleton with no record id in its route) and `onboardingTasks` (never returned on their own), so fifteen tables are closed, not thirteen.
- **Class C was smaller than mapped.** Claim types, pay components and document categories are settings-runtime pages; they joined the table-key map instead of taking the drop-in. Only the policy and assignment forms, the holiday manager and the job-opening edit form are bespoke.
- **API only.** Claims, education, previous employment, employee compensation, document types and onboarding templates have no create or edit UI on the web. Their values are stored and read through the API.
- **Found in the browser pass (pre-existing, not changed here):** three entity lookups refuse the paging the form sends, BUG-3800 (PLAN_REQUIRED).

## Rollback

Code only. Reverting removes the decorators and the interceptor. Stored values stay in `CustomRecordExtension` and become readable again if the change is restored.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this plan addresses or depends on, cited in its own body:

[[ADR-0024]] · [[BUG-3786]] · [[BUG-3787]] · [[ITEM-0221]] · [[TASK-0034]] · [[TASK-0035]]

<!-- GRAPH:END -->
