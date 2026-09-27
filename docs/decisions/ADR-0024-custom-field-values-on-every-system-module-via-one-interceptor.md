---
ID: ADR-0024
aliases: [ADR-0024]
Title: Custom field values reach every system module through one decorator and one global interceptor
Status: ACCEPTED
CreatedAt: 2026-09-27
UpdatedAt: 2026-09-27
---
# ADR-0024 — Custom field values on every system module via one interceptor

## Status

Accepted on 2026-09-27. On that date the product owner chose "generic hook, all modules" over the alternatives: a three-module pilot, Employees only, or blocking field creation. Plan: EXECPLAN-0054. Related: [[TASK-0035-custom-fields-follow-up-lookups-list-columns-export-other-sy]], [[BUG-3697]], [[ITEM-0221]].

## Context

Tenants can add custom fields to about 55 system tables, but only Employees can store the values. TASK-0034 wired `EmployeesService` to `CustomFieldValuesService` by hand.

There is no shared write path to hook into:
- About 40 modules have their own controller and service, with their own business logic.
- The generic `data` module only serves Employees and fully custom tables.
- About 20 of those modules share one web record page (the standard runtime and the settings adapters). The rest have bespoke forms.

## Decision

1. **One decorator, one global interceptor.** `@CustomFields(tableKey, role, idParam?)` marks a route as `create`, `update`, `read` or `list`. `CustomFieldValuesInterceptor` is registered once as an `APP_INTERCEPTOR` and ignores every route without the decorator.
2. **Validate before the handler, write after it.** Interceptors run before the global `ValidationPipe`. On a write route, the interceptor removes `customFields` from the body, so the module's DTO never sees it and `forbidNonWhitelisted` never refuses it. It then validates the values against the published fields, before the handler runs. Once the handler succeeds, the interceptor writes the values against the record id, audits the change (`CUSTOM_FIELD_VALUES_UPDATED`), and attaches the values the user may read to the response.
3. **The handler stays the access authority.** The interceptor writes or reads a record's values only after the module's own handler succeeded for that id: the route param for `update` and `read`, and the returned record's id for `create`. For `list`, it adds values only to the rows the handler returned. It never attaches values to a response object whose id differs from the record's.
4. **The common case costs one indexed query.** The interceptor first asks whether the tenant has any active custom column on the table. The published snapshot is loaded only when the answer is yes.
5. **Tables no route can carry values for stop being customizable.** Fifteen tables qualify:
   - thirteen have no route through which anyone edits a record: generated rows, join rows, a key/value bag, and three models no code uses;
   - `attendancePolicies` is a singleton patched without a record id;
   - `onboardingTasks` are only ever returned nested in their onboarding.

   The last two were found by the bindings spec. They become `isCustomizable: false`, and `createColumn` now enforces the flag, which it never did (see [[BUG-3786]]). A field that can never hold a value is not offered.
6. **One web integration for the shared record page, one drop-in component for bespoke forms.** The standard runtime adds published custom fields to the entity metadata and the forms, reads record values, and sends `customFields` on save. Bespoke forms embed `CustomFieldsSection`.

## Reasons

- Wiring each module means one decorator per route, with no module imports and no DTO changes. That is the smallest change that reaches every module without touching its business logic.
- Keeping the decision to write at the handler boundary means no new access rule exists anywhere. A caller who cannot update the record never reaches the write.
- Employees keeps its hand-wired path from TASK-0034. There, the write happens inside the create transaction, which is stronger than what an interceptor can offer.

## Alternatives Considered

- **Route every module through the generic `data` API.** Rejected: it means rewriting about 40 modules' create and update flows, each of which has business logic (approvals, payroll state, accruals).
- **A shared base service.** Rejected: services do not share a base class, and a base class changes nothing at the HTTP boundary where the body is validated.
- **Per-module wiring, as in Employees.** Rejected for most modules: it touches every service and every DTO, for no gain in safety.

## Consequences

- **Not atomic with the module's own write.** The module commits first, then the values are written. Validation happens up front, so only a database failure can still separate the two. In that case the request fails, and the record exists without its custom values; saving again fixes it. This is recorded, not hidden.
- **A create route that answers without the created record** (education and previous employment return the whole list) cannot be bound as `create`. The interceptor logs an error and stores nothing. Those routes are bound for `update` and `list` only, and their create is tracked separately.
- **Custom fields are not sortable or filterable server-side.** They appear in list rows and in exports, but not in `orderBy` or filters. Superseded for the employee list by ADR-0025 (2026-09-27), which adds both there; other modules sort and filter in the browser.

## Migration / Compatibility Impact

- No schema change: values use the `CustomRecordExtension` table from TASK-0034.
- The fifteen tables made non-customizable had no custom columns in production when this was decided. That was checked read-only on 2026-09-26 for all system tables. `syncCore` updates the flag on each tenant's `CustomizationTable` rows.
- The API responses of bound routes gain a `customFields` property, but only when the tenant has custom fields on that table. Clients that ignore unknown properties are unaffected.

## Security / Tenant Impact

- Values are stored and read by `(tenantId from the session, tableKey, recordId)`. The tenant id is never taken from client input.
- Read permission (`validationJson.readPermission`), write permission and masking apply exactly as for Employees and custom modules. They share one set of rules.
- `GET /custom-fields/:tableKey` is `@AuthenticationOnly`. It returns the tenant's own field definitions, already published to signed-in users through `/runtime-metadata/published`, with per-field read permissions applied. It takes no record or user id, and it is on the reviewed list in `wiring-invariants.spec.ts`.

## Agent Rules

- To give a system module custom field values, decorate its routes; do not call `CustomFieldValuesService` from the module's service. Employees is the only exception, and it is documented above.
- Bind `create` only to a route that answers with the created record. The interceptor spec pins this.
- `custom-fields.bindings.spec.ts` fails when a customizable table has no storing binding, or when a binding names a param its route lacks. Close the table (`UNSTORABLE_TABLE_KEYS`, with the reason) rather than leave it without storage.
- Add a table to the registry as customizable only if some route edits its records.

## Related Modules

[[customization]], [[employees]]

## Related Features

Custom fields on system modules, Settings → Customization.
