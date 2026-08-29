# Incoming regression entries — settings

Staged for `docs/qa/regressions/index.md`. Written by the settings stream of
SESSION-0076 (`agent/bugfix-settings`) so parallel streams do not contend on the
index itself. Ids REG-325 to REG-328 were reserved centrally for this stream.

---

### REG-325 - A settings catalog that could declare keys nothing read

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `tenant-settings`, `apps/web` |
| **Bug record** | BUG-1974 |
| **Root cause** | Nothing required a declared setting key to have a reader. The catalog declared 591 keys; 246 had no reader anywhere in the monorepo and 230 of those were rendered as live, editable controls. `updateTenantSettings` allowlisted each one *because it was in the catalog*, then coerced it, upserted it, invalidated the cache and wrote a `TENANT_SETTINGS_UPDATED` audit row with before/after snapshots. The administrator got a successful save, a persisted value and an audit trail for a setting nothing honoured, with no error and nothing on screen to give it away. Adding the key was the visible work; wiring it was invisible by omission. |
| **Regression test** | `services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts` |
| **Scenario** | Every catalog key is either read by production code or listed in `INERT_TENANT_SETTING_KEYS` with a reason code. The check fails in four directions: a declared key that nothing reads and nothing exempts; a key listed as inert that something now reads; an editable control for an inert key; and an inert entry naming a key the catalog no longer declares. The reader index is built by walking the repository and tokenising every code file, excluding the catalog, the dispositions list, the two settings UI config files, specs, `e2e/` and `docs/`. The UI side is a `(category, key)` **pair** test and reads the `timesheetField(...)` and `payrollValidationField(...)` factories explicitly. |
| **Proven to fail without the fix** | Mutation-tested in two directions. Adding `employees.zzzMutationProbeKeyNothingReads` to the catalog fails "every declared key is either read in production code or declared inert" and names the key. Re-adding a control for the inert `timesheets.approvalSlaHours` fails "no inert key is rendered as an editable control" and names that. Both were reverted and the suite returns to six green. |
| **Note** | **The check is the durable half of this record; the cleanup is the perishable half.** Two of its six assertions exist only to stop the guard rotting into decoration. The first is a corpus floor — an empty index would make every other assertion pass vacuously, which is how a scan-based check usually dies. The second is the reverse direction: a key listed as inert that something now reads fails, so the allow-list cannot become a place to hide new instances of the very defect it records. That reverse assertion is also the mechanism by which a key comes back to life — write the reader, delete the line, and the control returns. The identifier index is deliberately category-blind and so counts a key alive if *any* category's namesake is read; that makes the measurement a lower bound and the guard conservative, which is the right direction for a check that gates merges. **Nineteen attendance keys are exempt** under `DEFERRED_ATTENDANCE_WORK`, owned by the concurrent attendance work on BUG-1978, BUG-1979, BUG-1980, BUG-1981 and BUG-2091; a dedicated assertion pins that exemption to `attendance.` so it cannot quietly widen, and it is meant to reach zero. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-settings` |
| **Active** | yes |

### REG-326 - Eight settings controls writing a key name the resolver never read

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `tenant-settings`, `employees`, `apps/web` |
| **Bug record** | BUG-1976 |
| **Root cause** | Eight controls wrote one key name while the resolver — and for six of them live enforcement in `employees.service.ts` — read another. No alias map existed anywhere in the write path or the resolver, so nothing reconciled the two. The administrator's value was stored under the dead name and the enforcing code kept using the catalog default of the live name. Worse than an inert control, because the behaviour was actively enforced from the other side: switching duplicate prevention off still enforced it, and switching a protection on gave none. |
| **Regression test** | `services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts` |
| **Scenario** | The same guard as REG-325 covers this class by construction: each of the eight dead names was a catalog key with an editable control and no reader, so all eight appear in the "every declared key is either read or declared inert" assertion. Seven were deleted from the catalog and their controls repointed at the live key; the eighth, `organization.weekStartDay`, was deleted with its control. |
| **Proven to fail without the fix** | Restoring any of the seven deleted alias keys to the catalog reproduces the failure: the key has a control, no reader, and no inert entry, so the guard names it. This is the same mutation shape as REG-325's first probe. |
| **Note** | **Six were renames; two were not, and treating them as renames would have been the wrong fix.** `allowSkipLevelReporting` looks like a typo of the live `allowSkipLevelApprovals`, but neither half has a consumer — skip-level approval behaviour is not implemented — so the control was removed rather than repointed, and the live half is now recorded as inert. `organization.weekStartDay` needed a precedence decision first: `system.defaultWeekStartDay` wins, resolves through a validated enum with a `MONDAY` default and is therefore never falsy, so the `|| organization.weekStartsOn` fallback beside it can never fire. One control now exists, on the System page. The near-miss worth carrying: `timesheets.weekStartDay` **is** live, so a token-based scan marks the name alive and only a `(category, key)` pair test distinguishes it from the dead `organization` copy. **Stored values under the dead names are deliberately not migrated** — those rows were never read, so every tenant's observed behaviour has always been the live key's value, and promoting a dead value on upgrade would be the change in behaviour, in the worst case silently switching duplicate prevention off for a tenant that had been protected all along. The rows are left in place, so migrating later remains available. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-settings` |
| **Active** | yes |

### REG-327 - A panel that denied the customer's own data existed

| | |
|---|---|
| **Bug class** | `unqueryable-filter` |
| **Module** | `tenant-control-plane`, `apps/admin` |
| **Bug record** | BUG-1977 |
| **Root cause** | The tenant configuration query filtered `TenantSetting.key` on `['organization.country', 'organization.timezone', ...]`. `category` and `key` are separate columns with `@@unique([tenantId, category, key])`, and no writer ever puts a dotted composite in `key` — both writers set the columns separately. The `IN` list could never match, so the query returned an empty array for every tenant, always, and the admin Localization panel rendered an empty state asserting the tenant had not configured localization. The `.replace('organization.', '')` in the projection shows dotted keys were expected throughout: a consistent misunderstanding of the schema rather than a typo. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/tenant-localization-panel.spec.ts` |
| **Scenario** | The panel returns the tenant's country, timezone, locale, currency and date format rather than an empty object; `locale` is read from the `system` category; `dateFormat` is read from the `organization` category and not the system copy; the `TenantSetting` query never filters on a dotted composite, asserted against the serialised Prisma arguments; and `configured` is false, with the values still returned, when the tenant has written no row. |
| **Proven to fail without the fix** | Two assertions fail against the old code for the reasons the record gives — the values assertion, which returned `{}` for every tenant, and the dotted-key assertion, which finds `organization.` in the query arguments. |
| **Note** | **Two compounding errors survive the obvious fix, which is why the spec asserts on both.** Rewriting the query as `{ category: 'organization', key: { in: [...] } }` would still return nothing for `locale`, because there is no `organization.locale` — it belongs to `system`; and it would silently pick the `organization` copy of `dateFormat`, which exists in **both** categories. The `dateFormat` test makes the system copy differ from the organization copy so a regression that reads the wrong one is visible rather than coincidentally right. Resolved through `TenantSettingsResolverService` rather than by repairing the query, which also fixes a case the record did not raise: a tenant whose values are catalog defaults rather than persisted rows would have shown empty even after a correct query. `OrganizationSettingsResolved` gained `country`, which it had never carried. The empty state now means "unset": a narrow existence query sets a `configured` flag, and an unconfigured tenant is told these are platform defaults instead of being told its data does not exist. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-settings` |
| **Active** | yes |

### REG-328 - Three more settings toggles wired to nothing

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `timesheets` |
| **Bug record** | BUG-2206 |
| **Root cause** | The `timesheets` category declares four audit toggles and all four rendered as live checkboxes. REG-308 wired `auditBackgroundJobs`; `auditEntryChanges`, `auditPolicyResolution` and `auditExports` appeared only in the catalog and in the settings page config, with no consumer anywhere in `services/api/src`. Turning one off saved, reloaded, and changed what was audited not at all. |
| **Regression test** | `services/api/src/modules/timesheets/timesheet-audit-settings.service.spec.ts` |
| **Scenario** | On, off and unset for each of the three, as the record's acceptance criteria require. Plus the fail-open path when settings cannot be read, a stored string `"false"` treated as off because `TenantSetting.value` is `Json`, and a tenant-isolation assertion that the category read is scoped to the calling tenant. |
| **Proven to fail without the fix** | The off case is the assertion that did not hold: nothing read the value, so the rows were written whatever the setting said. |
| **Note** | Fourth instance of this class in the register, after REG-308, REG-303 and REG-224 — and the scan that found it became REG-325, which closes the class rather than another instance of it. **The defaults are decided per toggle and deliberately invert REG-308's.** `auditBackgroundJobs` defaults off and fails closed because machine events crowd out actor decisions. These three record human actions — an entry change, a policy decision, an export of other people's hours — so each defaults **on** and the reader fails **open**: losing an actor's audit row to a settings blip is the worse of the two mistakes, and defaulting on also means no existing tenant's audit trail changes on upgrade. Each toggle gates a single choke point — `auditTimesheet`, the three `TIMESHEET_POLICY_*` lifecycle rows, and `auditExport` — so the suppression is total rather than partial. `auditPolicyResolution` gates the policy lifecycle rows rather than emitting a new row per resolution: the record asks for *fewer* rows of that kind, and auditing every policy preview would have added volume, which is the failure REG-308 was about. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-settings` |
| **Active** | yes |
