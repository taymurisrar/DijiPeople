# Incoming regression entries — attendance

Written by the attendance bug-burndown branch `agent/bugfix-attendance`
(SESSION-0076). These are formatted to be spliced into
[`../index.md`](../index.md) under **Entries**, in id order, by whoever runs the
register generators. Ids REG-318 to REG-324 were reserved centrally for this
branch.

**Scenario ids are deliberately blank.** QA records are allocated centrally, and
inventing one here would collide. Fill them at splice time.

---

### REG-318 - Every employee counted absent on a non-working day

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `dashboard`, `attendance` |
| **Bug record** | BUG-2008 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `getAttendanceOperations` derived absence as `Math.max(activeEmployeeCount - entries.length, 0)` — headcount minus whoever had an attendance row — and consulted no work schedule and no holiday calendar. The same number fed the "Absent employees" exception row and the manager view's "Absent today" metric. Two readers of the same calendar, one of which did not read it: the check-in gate resolves the employee's work configuration and correctly reported "2026-08-29 is a scheduled off day" on the very same day and tenant. It could not cheaply have read it either — `resolveEmployeeWorkConfiguration` answers for one employee in up to eight round trips, so calling it per head would have turned the landing screen of a large tenant into thousands of queries. |
| **Regression test** | `services/api/src/modules/attendance/attendance-work-day-resolution.spec.ts`, `services/api/src/modules/dashboard/dashboard.service.spec.ts` |
| **Scenario** | On a date the work schedule marks as an off day, the absent count is zero and no absence exception is raised; the same holds for a configured holiday on the employee's resolved calendar. A working day is unaffected — a genuine absence is still counted and still raised as a warning. An excused employee is not counted absent alongside working colleagues. The date handed to the attendance module is the UTC midnight of the day the tile is reporting on. The bulk resolver reproduces the single-employee precedence: assignment beats employee default beats team beats department; business-unit scope beats organization scope; tenant default is last; an employee with no schedule at all is **not** excused. |
| **Proven to fail without the fix** | Mutation-tested, four ways. (1) Counting excused employees as absent again (`expectedEmployeeIds.concat(nonWorkingEmployeeIds)`) fails three dashboard cases. (2) `isOffDay: false` in the bulk resolver fails four resolution cases. (3) Disabling the holiday scope check (`scopeType === 'TENANT' \|\| true`) fails exactly the department-scoping case. (4) Ignoring effective-dated schedule assignments fails exactly the assignment-precedence case. |
| **Note** | **The precedence is deliberately not restated in the bulk resolver.** It comes from `work-configuration-hierarchy.ts`, the same module the single-employee resolver uses, so the two cannot disagree about who wins; what is duplicated is only the *shape* of the queries — five bulk reads and an in-memory pick, instead of one round trip per candidate. The method comment says so and tells the next reader to change both together. That coupling is the risk this entry exists to flag: a predicate changed in `resolveEmployeeWorkConfiguration` and not here would drift silently, and the tests above would not catch it because they mock the database. **An employee with no work schedule is treated as expected to attend, not excused** — nothing has said they do not work, and guessing "off" would silently excuse them; this mirrors `resolveSelfServiceContext`, which computes `isOffDay` as `Boolean(workSchedule && !isWorkingDay)`. Worth carrying: the reports screen was already right, because it counts entries rather than deriving absence. A derived count and a counted count of the same fact will diverge, and the derived one is the one that goes wrong quietly. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

---

### REG-319 - Attendance recorded for a day that has not happened

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `attendance` |
| **Bug record** | BUG-2005 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `POST /api/attendance/manual` had no upper bound on `date`. `CreateManualAttendanceEntryDto` declared it as a bare `@IsDateString()`, and `createManualEntry` checked for a duplicate day and for reversed check-in/check-out times but never compared the date to today. An entry dated ten months ahead returned 201 and was persisted. |
| **Regression test** | `services/api/src/modules/attendance/attendance.service.spec.ts` |
| **Scenario** | Tomorrow in the tenant timezone is refused with `ATTENDANCE_DATE_IN_FUTURE` and no entry is created; a far-future date (2099) is refused; today in the tenant timezone is still accepted; yesterday is still accepted; moving an existing entry to a future date through `updateManualEntry` is refused and writes nothing. |
| **Proven to fail without the fix** | Mutation-tested: removing the `assertAttendanceDateIsNotInFuture` call from `createManualEntry` fails both refusal cases and leaves the four acceptance cases green — so the tests fail for the right reason rather than because the path broke. |
| **Note** | **The bound is measured in the tenant's timezone, not the server's**, which is why the check sits after context resolution rather than in the DTO where it looks like it belongs. A tenant in Doha is already on the 30th while a UTC server is still on the 29th, so a server-clock comparison would refuse a legitimate same-day entry for every tenant east of Greenwich. That also answers the "decide the tolerance deliberately" question the record left open: using the tenant's own date means no slack is needed on top. The tests derive "today" from the resolved tenant timezone rather than hardcoding a date, so they keep testing the rule instead of expiring the moment the calendar passes a literal — a hardcoded future date in a regression test becomes a hardcoded past date eventually, and then it passes for the wrong reason. Four write paths were checked, not one: create, update, the override endpoint (which delegates to update), and CSV import. Import had no timezone context at all and now resolves the tenant zone once per file, so the bound and the import's own timestamps are built from the same zone. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

---

### REG-320 - A mandated setting overruled without saying so

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `tenant-settings` |
| **Bug record** | BUG-1979 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `enforceCriticalAttendanceSetting` replaced the submitted value of seven attendance keys with the mandated constant on every write, inside `normalizeSettingUpdates` and therefore **before** the change-diff. Because the mandated value usually equalled what was already stored, the update was dropped as a no-op: the response echoed the mandated value, the audit row recorded no change, and nothing distinguished the refusal from "you saved the value you already had". All seven were rendered as live, enabled controls. The mandate itself was correct — see ADR-0003 — and the defect was everything around it. |
| **Regression test** | `services/api/src/modules/tenant-settings/attendance-settings-mandate.spec.ts`, `apps/web/app/(authenticated)/settings/_lib/attendance-settings-fields.spec.ts` |
| **Scenario** | A submitted value contradicting the mandate is refused with `ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM`, naming the key, and nothing is written — including the other keys in the same submission. A value that matches the mandate is accepted as an ordinary no-op. `locationRequiredForModes` compares by set, so a different array order is not read as an attempted change. A contradicting value already stored is rewritten to the mandate on the next accepted write. Unmandated attendance keys and identically-named keys in other categories are untouched. All seven controls render disabled and each says why. |
| **Proven to fail without the fix** | Mutation-tested, twice. Removing the `assertAttendanceSettingIsChangeable` call fails nine of the twenty-four API cases — every refusal case, and none of the acceptance cases. Re-enabling one mandated control in `settings-page-config.ts` fails exactly that control's two web cases. |
| **Note** | **This lock had zero test coverage of any kind before now** (tracked as ITEM-0112), which is precisely what made deleting it look safe — and two separate investigations had already proposed doing so. The `Agent Rules` section of ADR-0003 exists for the same reason. **Deleting `enforceCriticalAttendanceSetting` restores no configurability whatsoever**: enforcement is `validateAttendanceLocationPayload`, which throws unconditionally and reads none of these keys, so removing the lock would only make the settings start *looking* live while behaving identically — the same defect, harder to diagnose. The lock is therefore **kept underneath the refusal** as defence in depth, and the register should record that this makes it unreachable from the settings endpoint by construction: the tests pin the invariant ("no path through `updateTenantSettings` leaves a mandated key stored at another value") rather than the substitution itself, because the substitution can no longer be reached with a contradicting value. A refusal that fires before a lock is not the same as no lock, and a future reader deciding the lock is dead code would be wrong. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

---

### REG-321 - A control on a page whose save path could never write it

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `apps/web` settings, `tenant-settings` |
| **Bug record** | BUG-1978 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | "Allow off-day check-in" and "Allow holiday check-in" were defined in `settings-page-config.ts` against `AttendancePolicy` **column** names. Neither `attendance.allowOffDayCheckIn` nor `attendance.allowHolidayCheckIn` is a tenant-settings catalog key, and `normalizeSettingUpdates` rejects any key the catalog does not know. Because the form sends only changed fields, the controls sat inert until touched; the moment either was toggled the whole PATCH 400'd with "Unsupported setting key" and every other unsaved change in that submission went with it. The reader side confirms where they belong: `resolvePolicy` reads both **only** from the policy row. |
| **Regression test** | `apps/web/app/(authenticated)/settings/_lib/attendance-settings-fields.spec.ts`, `services/api/src/modules/attendance/attendance-policy-write.spec.ts` |
| **Scenario** | Neither key is offered by the attendance settings page. Both are writable through `PATCH /attendance/policy` and persist on create and on update; omitting either leaves the stored value alone rather than resetting it. |
| **Proven to fail without the fix** | Mutation-tested: restoring the `allowOffDayCheckIn` field to `settings-page-config.ts` fails exactly the case that asserts the page does not offer it. |
| **Note** | Two smaller things rode on this one and are worth keeping. **First: a rejected save left the refused value on screen.** The checkbox stayed ticked after the server declined it, so anyone who did not read the error believed the setting had saved — the page asserting a state the server had just refused. The settings form now reverts to the persisted values on a server rejection (not on a network failure, where nothing is known) and says so in the message. **Second: the `tenant.tenantSlug` lead** the record asked to trace or dismiss. It has the same shape one level up — `organization-settings-config.ts` declares category `tenant`, which is not in `TENANT_SETTING_CATEGORIES`, so `normalizeCategory` would reject it — but the Tenant Profile adapter's save path was not traced far enough to confirm it reaches that endpoint, so it is neither fixed nor filed here and remains open as written. **Not done:** the repository-wide check that every UI `(category, key)` pair exists in the catalog. That is the scan BUG-1974 argues for and it is owned by concurrent work on the catalog; adding a second one here would have been the duplicate-source-of-truth mistake this very entry is about. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

---

### REG-322 - Editable columns nothing reads, on a screen that could never save

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `attendance`, `apps/web` |
| **Bug record** | BUG-1981 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `resolvePolicy` returned seven location values as literals — the deliberate mandate of ADR-0003 — while `AttendancePolicy` still carried `requireRemoteLocationForRemoteMode` and `allowRemoteWithoutLocation` as columns, the DTO still accepted them, and the policy screen still rendered them as checkboxes. Those two columns have never been read in an enforcement branch, before or after the mandate; they populate one ESS card and nothing else. An unfinished cleanup, not a contradiction of intent. |
| **Regression test** | `services/api/src/modules/attendance/attendance-policy-write.spec.ts` |
| **Scenario** | The seven mandated location columns are written at the mandated values on create and on update, correcting a stale row that says the opposite in every column. The resolved policy reports the mandate even when the stored policy row contradicts it in every column. |
| **Proven to fail without the fix** | Mutation-tested: removing the `MANDATORY_LOCATION_CAPTURE` spread from `resolvePolicy` fails exactly the case asserting the resolved policy reports the mandate. |
| **Note** | **A third defect was found while fixing this one, and it is the more serious of the two: the attendance policy screen could not save at all.** `AttendancePolicyCard` posted its whole form back, and that form is the object `GET /attendance/policy` returned — the *resolved* policy, which also carries `allowedModes`, `locationRetryAttempts` and `standardWorkHoursPerDay`. The global `ValidationPipe` runs with `forbidNonWhitelisted`, so **every save on that screen was rejected with a 400 naming a field the administrator never touched.** The card now builds an explicit `AttendancePolicyUpdate` payload, and the type is declared separately from the read shape so the two cannot drift back together. This also falsifies BUG-1980's reproduction, which has "open the attendance policy screen and press Save once" as step 2 — that step could not have succeeded through the UI. **The seven mandated fields were removed from the DTO, not deprecated**: input that can never take effect is the defect, and `apps/web` is the only consumer of the endpoint (checked: neither `apps/admin` nor `apps/agent-desktop` references them). **Deliberately not done:** dropping the two dead columns, and aligning the six schema defaults that still say the opposite of what the engine enforces. Both are migrations and need an ExecPlan under `PLANS.md`; the interim measure is that the columns are written at the mandated values on every save, so the stored data agrees with the engine even while the defaults do not. Also fixed in passing: `attendance/team/page.tsx` held a hardcoded fallback policy carrying the **pre-mandate** values, contradicting the server for every tenant. |
| **Fixed** | 2026-08-30 |
| **Active** | yes |

---

### REG-323 - Saving one screen froze the settings behind another

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `attendance` |
| **Bug record** | BUG-1980 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `resolvePolicy` reads each value as `policy?.X ?? attendanceSettings.X`, and every `AttendancePolicy` column consulted that way is non-nullable with a Prisma default — so the fallback fires only when the whole **row** is absent, not per field. The row is not seeded; it appears the first time anyone saves the attendance policy screen. Compounding it, the create branch of the upsert filled fields the caller omitted with **hardcoded constants**, so creating the row did not merely freeze the tenant's settings-derived values, it replaced them. |
| **Regression test** | `services/api/src/modules/attendance/attendance-policy-write.spec.ts` |
| **Scenario** | Creating the policy row seeds every omitted optional field from the currently *effective* value rather than from a constant — asserted on six fields whose effective values all differ from the constants that used to be written, so a regression cannot pass by coincidence. An explicitly submitted value still wins over the effective one. Both halves of the upsert are scoped to the caller's tenant. |
| **Proven to fail without the fix** | Mutation-tested: restoring `dto.locationTimeoutSeconds ?? 15` in the create branch fails the seeding case. |
| **Note** | **This record is only partly closed and the remainder is not a small one — read the Resolution on BUG-1980 before assuming otherwise.** What is fixed is that the *act* of saving the policy screen no longer changes behaviour by itself. What is **not** fixed is the precedence: once the row exists, later edits to the attendance settings category still have no effect, and the settings UI still gives no sign of it. That is the repository owner's decision of 2026-08-29 — `AttendancePolicy` wins and the settings screen writes through to it — and it is sequenced in **EXECPLAN-0027**, which needs a defaults migration, a backfill of every existing row, and the owner's answer to that plan's Risk 3 before its final step may merge. None of that belongs in a bug-burndown branch. **The record's claim that a partial PATCH overwrites omitted fields with constants is false for updates** and was checked rather than assumed: the update branch already read `dto.X ?? existing?.X ?? default`. The lines the record cites, `attendance.service.ts:2780-2795`, are the **create** branch. Half of a two-part claim being right is the reason to measure a record before fixing it. |
| **Fixed** | 2026-08-30 — partial; precedence remains open under EXECPLAN-0027 |
| **Active** | yes |

---

### REG-324 - The canonical settings contract described a mechanism that did not exist

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `docs/architecture` |
| **Bug record** | BUG-2091 |
| **Scenario id** | *pending — allocate at splice time* |
| **Root cause** | `AGENTS.md` names `docs/architecture/settings-and-branding.md` the canonical contract for settings. It described attendance geolocation as a tenant-configurable requirement applying only to Remote and Hybrid, with Office needing nothing but an active Work Site — false since commit `a8c04f16` on 2026-07-29, after which location capture is mandatory for all self-service modes and enforced by an unconditional throw that consults no setting. `tenant-settings-attendance-runtime.md` carried the same claim in narrower words. The mandate landed across the catalog, a write lock, a retro-migration, the resolve site and a test, but into no documentation and no ADR. |
| **Regression test** | **None — not unit-testable.** Per [`../known-bug-patterns/doc-code-drift.md`](../known-bug-patterns/doc-code-drift.md), nothing validates a prose claim. |
| **Scenario** | Not automatable. The standing check is the staleness rule: both amended sections carry the date they were re-derived against the code, and an attendance change re-derives them rather than trusting them. |
| **Proven to fail without the fix** | Not applicable — no test. The defect was verified by reading, and the correction by re-deriving each claim against `validateAttendanceLocationPayload` and the migration that introduced it. |
| **Note** | **The 2026-08-22 resync is the part to carry forward.** `settings-and-branding.md` was deliberately re-synced with the code on 2026-08-22 under BUG-0045 — and that pass covered routes, categories and shared components and never touched the attendance section. A resync that reads as authoritative while leaving a false claim standing is **worse than no resync**, because the next reader trusts the date. The concrete cost was already visible: BUG-1979 and BUG-1981 were both opened as `PRODUCT_DECISION` and sat blocked for a month because nobody could tell whether the override was deliberate — a question this document should have answered and instead answered wrongly. The durable fix is not the prose but **ADR-0003**, which records the mandate, its evidence, the alternatives rejected, and an `Agent Rules` section saying plainly not to delete the lock or "fix" the resolve-site literals. `docs/decisions/README.md` was also missing ADR-0002 from its index; both are now listed. **Pending at splice time:** `RelatedDecision` on BUG-1979 and BUG-2091 should point at ADR-0003. It was left empty deliberately — it feeds a generated block, and setting it without rebuilding leaves an index disagreeing with the record. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |
