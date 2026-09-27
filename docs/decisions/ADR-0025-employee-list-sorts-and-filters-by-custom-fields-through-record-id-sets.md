---
ID: ADR-0025
aliases: [ADR-0025]
Title: The employee list sorts and filters by custom fields through record-id sets
Status: ACCEPTED
CreatedAt: 2026-09-27
UpdatedAt: 2026-09-27
---
# ADR-0025 — Employee list sort and filter by custom fields through record-id sets

## Status

Accepted on 2026-09-27. The product owner chose "Sort/filter by custom fields"
for TASK-0036. It narrows one consequence of ADR-0024, which left custom fields
out of server-side sorting and filtering. Related:
[[TASK-0036-custom-fields-screens-for-api-only-modules-sort-and-filter-b]].

## Context

Custom field values live in `CustomRecordExtension.values`: one JSON object per
`(tenantId, tableKey, recordId)`, keyed by column key. They are not columns of
the module's own table, so Prisma cannot put them in the list's `where` or
`orderBy`.

Only Employees pages, sorts and filters its list on the server. Every other
system module sorts and filters the loaded page in the browser, where custom
columns already behave like any other column.

## Decision

1. **A filter becomes a set of record ids.** Each custom-field filter is turned
   into a parameterised SQL condition over the extension JSON
   (`custom-field-query.ts`), and it returns the ids of matching extension
   rows. The repository adds `id IN (…)`. The negated operators (`notContains`,
   `notEquals`, `isEmpty`) run their positive form and add `id NOT IN (…)`,
   because their matches include employees with no extension row at all.
2. **A sort orders the ids that have a value.** The repository takes every id
   the rest of the query matches, in the fallback order. It asks for the
   subset with a non-empty value, ordered by the jsonb value: numbers compare
   as numbers and strings as strings. Those ids go first, the rest follow, the
   page is sliced, and one query loads it.
3. **Only fields the user could see.** A field is filterable and sortable only
   if the user can read it (`readPermission`), and it is visible, active and
   not masked. Ordering or matching on a masked field would disclose what the
   mask hides. Lookups and multiselects filter but do not sort: an id and a
   list have no meaningful order.
4. **Refuse rather than ignore.** An unknown or unqueryable field, or a value
   its operator cannot use, answers 400 `CUSTOM_FIELD_FILTER_INVALID`. An
   ignored filter would show an unfiltered list that looks filtered.
5. **Transport.** `GET /employees` takes `customFilters`, a JSON list of
   `{ field, operator, value, valueTo }`, and a custom field name in
   `orderBy`. Custom field names are the tenant's, so they cannot be DTO
   properties. The web page maps the table's `<field>Filter` URL parameters
   onto `customFilters`.

## Reasons

- The id-set approach leaves the Prisma query, the row-level access scope and
  the employee includes exactly as they were. The custom part only narrows or
  reorders ids that the existing query already admits.
- Everything user-supplied is a bound parameter. Only the sort direction is
  spliced into the SQL, and only from a whitelist.

## Alternatives Considered

- **Raw SQL for the whole employee list.** Rejected: it duplicates the access
  scope, filters and includes the repository already builds with Prisma.
- **Generated columns or a view per custom field.** Rejected: a schema change
  per tenant field breaks the "configuration, not code" rule.
- **Client-side sort and filter for Employees.** Rejected: the list is paged,
  so it would sort one page, not the list.

## Consequences

- A custom sort reads every matching employee id to order them. That is cheap
  at tenant sizes in the thousands; very large tenants would want an index on
  the extension JSON first.
- Each filter is one extension query, and a very selective negated filter
  becomes a long `NOT IN` list. There are at most 10 filters per request.
- Only Employees gains this. Other modules page in the browser, so they need
  nothing.

## Migration / Compatibility Impact

No schema change. `customFilters` is optional, and an `orderBy` naming a system
column behaves as before. Field definitions gain an additive `isMasked` flag.

## Security / Tenant Impact

Every extension query is scoped by the session's `tenantId` and the fixed
`tableKey`. The id sets only narrow the existing tenant- and access-scoped
`where`. The e2e in `services/api/test/custom-field-list-query.e2e-spec.ts`
proves that another tenant's values never match, and that a masked or
unreadable field can be neither filtered nor sorted by (mutation-checked).

## Agent Rules

- Extend `custom-field-query.ts` for new operators, and keep every value a
  bound parameter.
- Never make a field queryable that `isQueryableCustomField` refuses.

## Related Modules

[[customization]], [[employees]]

## Related Features

The employee list, custom fields on system modules.
