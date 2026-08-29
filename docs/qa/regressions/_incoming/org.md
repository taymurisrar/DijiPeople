# Incoming regression entries — `agent/bugfix-org` (SESSION-0076)

Three entries, REG-310 to REG-312, for merging into
`docs/qa/regressions/index.md` centrally. One per distinct root cause: the three
bug records sit in the same module and two of them surface through the same 409,
but the mechanisms are three different things — an in-memory visibility filter,
a database constraint, and a query DTO — and each has its own guard.

---

### REG-310 - A department that had no scope to be outside of

| | |
|---|---|
| **Bug class** | `wrong-question-in-a-guard` |
| **Module** | `organization` |
| **Bug record** | BUG-1957 |
| **Root cause** | `OrganizationService.findDepartmentsForUser` filtered on `department.businessUnitId !== null && visibleBusinessUnitIds.has(department.businessUnitId)`, which answers false for two different situations: a department whose business unit the caller cannot see, and a department that has no business unit at all. Only the first is a scope decision; the second is a row with no scope to be outside of. Because `findDepartmentForUser` reads through that function, and `updateDepartment` and `deleteDepartment` resolve their target through *that*, such a row could not be listed, fetched by id, edited or deleted — while it went on occupying the tenant's unique department name, so no replacement could be created either. Unreachable and immortal at once. |
| **Regression test** | `services/api/src/modules/organization/organization-read-scope.spec.ts` |
| **Scenario** | A department with a null business unit is visible to a tenant-scoped reader and fetchable by id; invisible to a parent-child reader and unfetchable by an organization-scoped one; and reachable by a tenant-scoped **manager**, which is the privilege that makes it repairable rather than merely visible. The pre-existing assertion that departments outside the caller's business units stay hidden is kept untouched as the control. |
| **Proven to fail without the fix** | Mutation-tested: replacing the null-business-unit branch with `false` — exactly the original behaviour — fails two of the nine assertions in the suite, and leaves the narrower-scope control passing, which is what it is there for. |
| **Note** | The fix does **not** widen visibility to every caller, and that restraint is the load-bearing part: a business-unit-scoped caller still cannot see the row, because there is no business unit through which it could be in scope. Only a tenant-scoped caller, who sees the whole tenant by definition, can reach it. A guard written as "show unscoped rows to everyone" would have closed the bug and opened a scope leak. **The writer was found and is not fixed here.** `seedTenantWorkforceReferenceData` in `prisma/seed-config.ts` upserts Human Resources, Operations, Finance and Information Technology with a code, a name and no `businessUnitId` — exactly the four names the QA run found blocked, and `seed:config` runs on every release for every tenant, so these rows exist product-wide and not merely on the demo tenant. Assigning a business unit at provisioning time means choosing one, and a tenant may have none at that point; that is a product decision, filed as ITEM-0115. This regression guards the reachability half only. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |

### REG-311 - A soft delete under a constraint that did not know about it

| | |
|---|---|
| **Bug class** | `soft-delete-under-a-blind-constraint` |
| **Module** | `organization` |
| **Bug record** | BUG-1958 |
| **Root cause** | Deleting a department is a soft delete — `deleteDepartment` sets `isActive = false` and leaves the row in place — while uniqueness was `@@unique([tenantId, name])` across every row, active or not. The name was therefore never released: a tenant that deleted a department could not recreate one by that name through any route the product offers, and the 409 it got back blamed a record the product had just reported deleted. Root `AGENTS.md` already warns that a soft-delete flag obliges you to update every query that reads it; the uniqueness constraint is one of those readers and was never updated. |
| **Regression test** | `services/api/src/modules/organization/departments-list-contract.spec.ts` |
| **Scenario** | The schema must not declare a full unique on `(tenantId, name)`; a migration must both create the partial `Department_active_tenant_name_key` index carrying the `isActive = true` predicate and drop the old `Department_tenantId_name_key`; `@@unique([tenantId, code])` must survive whole-table; and a P2002 raised on the update path must surface as a 409 rather than a 500. Schema and migrations are read from disk rather than restated, and a control asserts the model body was actually located, because an assertion over an empty array is green. |
| **Proven to fail without the fix** | Mutation-tested twice. Restoring `@@unique([tenantId, name])` to the schema **and** removing the migration directory fails two of the nine assertions, while the code-uniqueness and model-located controls keep passing. Separately, routing the update back through the repository directly so it bypasses the `try`/`catch` fails one. **What this does not prove:** the database constraint itself was never exercised — there is no database in this environment — so the guard establishes that the schema and the migration still agree with each other, not that PostgreSQL accepts the index. |
| **Note** | `@@unique([tenantId, code])` deliberately stays unique across the whole table, and the asymmetry is the design decision most likely to be got wrong on a second pass. `code` is the key provisioning upserts through — `seedTenantWorkforceReferenceData` matches on `tenantId_code` — so scoping *code* to active rows would make that upsert miss an archived row and insert a duplicate department on every release. The name is the human label and is the half this defect is about. **A real standing risk:** Prisma cannot express a partial index, so the constraint lives only in SQL, and a future `prisma migrate dev` will see an index the schema does not declare and offer to drop it. Someone accepting that generated diff silently reverts the fix — which is precisely why the guard reads the migration directory from disk and why it was mutation-tested by removing it. Same arrangement as `PlanPrice`'s active-price uniqueness and `CustomizationColumn`'s primary-name index; this is the third instance in the schema, not a new pattern. Also closed here: `updateDepartment` had never wrapped its repository call the way the create path does, so a rename onto a taken name was already a 500 — pre-existing, but scoping uniqueness to active rows adds a second route to it (reactivating an archived department whose name has since been taken), so it was closed rather than left to be found again. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |

### REG-312 - Two list endpoints in one product, answering in two shapes

| | |
|---|---|
| **Bug class** | `divergent-list-contract` |
| **Module** | `organization` |
| **Bug record** | BUG-1959 |
| **Root cause** | `GET /api/departments` took `ListMasterDataDto`, which declares no pagination fields, so under the global `ValidationPipe`'s `forbidNonWhitelisted: true` a `pageSize` query parameter was a 400 — "property pageSize should not exist" — while `GET /api/employees` answered with the `{items, meta}` envelope. Every department row was shipped on every load, and any consumer written against the employees envelope broke when pointed at departments. |
| **Regression test** | `services/api/src/modules/organization/departments-list-contract.spec.ts` |
| **Scenario** | With neither `page` nor `pageSize`, the response is the bare array, unchanged. With either, it is the employees envelope with server-computed `total` and `totalPages`. A page beyond the end clamps to the last page rather than returning nothing, and the page size defaults to the employees default when only a page is asked for. |
| **Proven to fail without the fix** | Mutation-tested: making the method ignore both pagination fields and always return the bare array — the pre-fix behaviour — fails three of the nine assertions, and leaves the bare-array control passing. |
| **Note** | **Half of BUG-1959 did not survive being checked, and the record has been annotated rather than quietly narrowed.** Its user-visible symptom — a page-size control that promises to change the page size and does nothing — does not occur. The departments table paginates client-side: `settings-runtime-pages.tsx` passes `paginationMode="client"` and `standard-module-list-page.tsx` slices the set and recomputes the totals from it, so the control works and the footer is correct. The page size never reaches the API, because `settingsListApiPath` builds the request from the adapter's path and does not forward it. That also voids the record's third acceptance criterion: under client paging the array *is* the whole set, so its length is the true total rather than a stand-in for a number the screen failed to fetch. The record's title still describes the disproven half; renaming it implies a file rename, which the generators own. **The shape change is opt-in on purpose.** The bare array is not unique to departments — business units, designations and locations answer the same way, and the settings runtime lookups, `use-employee-lookups.ts` and the holiday calendar manager read it directly. Converting one of the four would have resolved a divergence with `employees` by creating one inside master data, on contracts three frontends, an Electron agent and a .NET gateway consume. So `page` and `pageSize` are optional **with no defaults**: absent, every existing caller gets byte-for-byte what it got before. One honest limitation, stated in the code as well: the slice happens after the visibility filter, not in the query, because department visibility is resolved in memory against the caller's business units — so this bounds the response, not the read. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |
