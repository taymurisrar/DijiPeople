CONTEXT_FILES_REQUIRED:
  - .agent/context/agent-handoffs.md
  - docs/decisions/ADR-0012-hand-rolled-reporting-hierarchy-tree-no-new-dependency.md
  - docs/decisions/ADR-0014-employee-work-sites-are-a-related-records-tab.md (on the walkthrough branch)
  - docs/decisions/ADR-0017-the-hierarchy-viewer-stays-a-chain-scoped-dialog.md (on the walkthrough branch)
  - docs/architecture/record-page-layout-contract.md

SPECIALIST_AGENTS_REQUIRED:
  - frontend                            — hierarchy dialog, Work Sites tab, subgrid row actions,
                                           record command failure path, record export, menus
  - backend-api                         — one-line correction in the attendance work-site assign
                                           path so a validity edit cannot clear the primary flag
DELIBERATELY_NOT_USED:
  - database                            — no schema change; EmployeeWorkSite and Employee.locationId
                                           already exist and are written by existing transactions
  - security                            — no new endpoint, no permission key, no guard change; the
                                           existing attendanceDevices.* pair and tenant scoping stand

SINGLE_WRITER_FILES:
  - none (no schema, migration, permissions.ts, rbac-matrix.ts, app.module.ts, guards,
    platform-runtime-schema.generated.json or apps/web/lib/security-keys.ts change)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - doc-code-drift (ITEM-0164 and ITEM-0165 were marked DONE without a browser check)
  - guard-the-seam (client payload shape vs server DTO; the work-site assign payload)

REGRESSION_ENTRIES_IN_SCOPE (reserved range REG-495 … REG-504; full text in the stream report):
  - REG-495 — employee account-action refusal keeps its HTTP status and is a business failure
  - REG-496 — Reset Password needs confirmation and a linked user
  - REG-497 — record export writes lookup display names, never ids
  - REG-498 — hierarchy detail-card state: no card on open, tap shows before it navigates
  - REG-499 — hierarchy card is positioned inside the viewport
  - REG-500 — work-site rows, assign payload and update payload without locationId
  - REG-501 — a validity edit does not touch the primary flag; Make primary is one transaction
  - REG-502 — create-only employee fields are absent on an existing record
  - REG-503 — record sections reflow to fewer columns at tablet width
  - REG-504 — removed explanatory copy stays removed

TARGET_BRANCH:            develop (via the orchestrator; this stream only commits to its branch)
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no (the orchestrator releases TASK-0031 as a whole)
DEPLOYMENT_COMPONENTS:    web, api
DEPLOYMENT_ORDER:         api -> web (the web tab works against the current API; the API change only
                           stops an unintended demotion, so either order is safe)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff (orchestrator)
KNOWN_CONCURRENT_WORK:    TASK-0031 WP-01 owns apps/web/app/components/errors/error-provider.tsx and
                          apps/web/app/components/ui/form-control.tsx — neither is edited here.
                          Customization and notification streams do not touch these files.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — Employee record remediation from the second demo walkthrough (WP-03)

## Objective

The employee record's hierarchy dialog draws a real branching tree whose
detail cards open only on hover, focus or tap and are never clipped; work sites
are a Work Sites related-records tab with a transactional Make primary row
action and a read-only Location field; Reset Password asks first, is offered
only with a linked user, and an expected refusal reaches the user as a business
answer instead of a false 500; the record export writes names instead of ids;
and the listed usability and explanatory-copy defects on the employee record,
login page, record Assign dialog and Assign Roles panel are gone.

## Business requirement

Records BUG-3497, BUG-3498, BUG-3499, ITEM-0179 and the employee/login/users
parts of ITEM-0183 and ITEM-0184, filed from the second demo walkthrough on
2026-09-13. Owner decisions D1 (hierarchy), D2 (work sites) and D5 (remove
agent-added explanatory text) are binding, recorded as ADR-0017, ADR-0014 and
the ITEM-0183 disposition.

`TODO: Confirm product/business rule.` — ITEM-0179 asks that "no action in the
tab is available while the record is in read mode". A related-records tab on
this record is always shown in read mode (every other employee tab acts on rows
there), so this plan interprets the rule as the permission gate
(`attendanceDevices.manage`) and not as form edit mode. Flagged in the report.

## Existing behavior

- **Hierarchy (FACT)** — `ReportingHierarchyTreeDialog` /
  `ReportingHierarchyTreeNodeItem`,
  `apps/web/app/components/runtime/module-widget-renderer.tsx:2756-2895`.
  `description=` intro at `:2775`; no footer or close control (`:2774-2797`);
  both lists are `flex flex-col` (`:2788`, `:2881`); the card is `absolute`
  (`:2858`) inside `overflow-auto` (`:2787`), itself inside the dialog body's
  `overflow-y-auto` and the panel's `overflow-hidden`
  (`apps/web/app/components/ui/dialog.tsx:307`, `:343`); nodes are buttons with
  `onFocus` open + `onClick` toggle (`:2832-2836`), and `useDialogBehavior`
  focuses the first focusable element on open (`dialog.tsx:167-174`), which is
  the root node.
- **Hover shows nothing on other nodes (INFERENCE, to be browser-confirmed)** —
  each node owns its own card state, so a hovered node's card does render, but
  as an absolutely positioned box inside the tree's scroll container: it
  extends that container's scroll height instead of overlaying, lands below the
  visible area for any node near the bottom, and for the first child the
  pinned root card sits on top of the node so the pointer never enters it.
- **Work sites (FACT)** — `employee.workSites` widget component in the
  Organization section (`apps/web/lib/runtime/modules/employee-metadata.adapter.ts:852-859`),
  renderer `ModuleEmployeeWorkSitesWidget` / `EmployeeWorkSitesPanel`
  (`module-widget-renderer.tsx:2101-2613`) with its three texts, data and
  actions in `apps/web/lib/runtime/modules/employee-data.adapter.ts:432-598`.
  Endpoints: `GET/POST employees/:employeeId/work-sites`,
  `POST …/work-sites/primary`, `DELETE …/work-sites/:locationId`
  (`services/api/src/modules/attendance-integrations/operations/attendance-operations.controller.ts:97-138`),
  all `attendanceDevices.read|manage` + `ENTITY_KEYS.ATTENDANCE`, reached from
  the browser through `apps/web/app/api/integrations/[...path]/route.ts`.
- **Latent demotion (FACT)** — `assignWorkSite` passes
  `isPrimary: dto.isPrimary ?? false` to the resolver
  (`attendance-operations.service.ts:95`); the resolver only leaves the flag
  alone when it receives `undefined`
  (`work-sites/employee-work-site-resolver.service.ts:269-271`). The widget's
  "Edit validity" called assign without `isPrimary`, so editing the primary
  row's dates cleared its primary flag while `Employee.locationId` stayed.
- **Location (FACT)** — an ordinary editable lookup; PATCH `/employees/:id`
  still writes it (`services/api/src/modules/employees/employees.service.ts:3541`)
  and nothing there touches `EmployeeWorkSite`.
- **Reset Password (FACT)** — `employee-runtime-form-wrapper.tsx:170-180`: no
  confirmation, no visibility rule; `postEmployeeAction` (`:285-303`) throws a
  bare `Error`; `readErrorData` (`apps/web/lib/runtime/command-execution.service.ts:138-141`)
  finds no `data`; `readCommandFailureContract` defaults to 500
  (`apps/web/lib/runtime/command-failure-message.ts:38-44`);
  `classifyCommandFailure` treats 500 as unexpected
  (`command-failure-classification.ts:70`) and
  `module-runtime-command-handler.tsx:348` dispatches it to the error log.
- **Send Invitation never shows (FACT)** — its rule reads `hasNeverLoggedIn`,
  which the API returns (`employees.service.ts:3731`) but
  `mapEmployeeRecordToRuntimeValues` never copies into the runtime record
  (`employee-metadata.adapter.ts:1337-1407`), and `field-equals` compares with
  `===` (`command-runtime.resolver.ts:261-264`).
- **Export (FACT)** — `displayExportValue`
  (`apps/web/lib/runtime/module-adapter-command-handlers.ts:700-719`) never
  sees the `lookupDisplayValues` the record page already holds
  (`module-record-page.tsx:67`, built by `mapEmployeeLookupDisplayValues`).
- **Owner shows name + email (FACT)** —
  `readNestedName(employee.ownerUser, ["fullName", "email"])` joins both
  (`employee-metadata.adapter.ts:1478`, `:1538`).
- **Status popover (FACT)** — employee entity `statusField: "status"`,
  `subStatusField: "subStatus"` (`employee-metadata.adapter.ts:511-512`);
  popover labels the row "Status" (`module-record-status-popover.tsx:96`) and
  always renders Sub Status (`:112-124`).
- **More menu (FACT)** — Escape is only handled by the menu's own `onKeyDown`
  (`responsive-runtime-tabs.tsx:185-189`), and focus never enters the menu when
  it opens, so Escape from the trigger does nothing; no outside or focus-loss
  close.
- **Create-time fields (FACT)** — `provisionSystemAccess` and
  `sendInvitationNow` sit in System Information for every mode
  (`employee-metadata.adapter.ts:937-938`).
- **Reflow (FACT)** — section columns use `md:grid-cols-3`
  (`apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:544`),
  so any viewport ≥768px gets three section columns.
- **Assign Roles panel (FACT)** — `AssignmentPanel`
  (`apps/web/app/components/runtime/module-related-subgrid.tsx:958-1179`) is
  `fixed z-50` inside the tab tree (so it shares its ancestors' stacking
  context), carries the copied allocation subtitle (`:1035-1038`), no
  success feedback after `saveAssignments` (`:693-745`), and a column without
  field metadata prints the raw value (`:273-284`).
- **Copy (FACT)** — login hint `apps/web/app/(public)/login/login-form.tsx:311`;
  assign dialog note `apps/web/app/components/runtime/module-assign-dialog.tsx:94-97`.

Must keep working: tenant scoping of every read/write, the `canReadWorkEmail` /
`canReadWorkSite` checks in the hierarchy, project allocation and user-role
assignment subgrids, Send Invitation, record export of option sets, booleans
and dates, and the reporting hierarchy cards.

## Existing architecture

Module runtime record page (`module-record-page.tsx`) → command handler
(`module-runtime-command-handler.tsx`) → `executeRuntimeCommand` →
adapter command handlers. Related tabs are `type: "related_module"` form tabs
rendered by `ModuleRelatedSubgrid` with a `parentBinding` resolved from the
entity's `relationships` (`runtime-metadata-form-renderer.tsx:368-382`,
`:611-627`). The employee module is the one bespoke domain adapter
(`apps/web/AGENTS.md`). The hierarchy stays hand-rolled per ADR-0012.

## Requirements

1. The hierarchy dialog draws children side by side under their manager with connector lines, scrolls horizontally inside the dialog when wide, shows no card on open, shows a card on hover, keyboard focus or first tap of any node, renders the card in a portal positioned inside the viewport, opens the employee record on activation (second tap on touch), has a visible Close control and an accessible name, and no intro text.
2. The employee record has a Work Sites tab rendered by `ModuleRelatedSubgrid` with Site, Primary, Valid From, Valid To columns; Assign, Edit (validity), Remove (confirmed) and a Make primary row action go through the existing attendance endpoints; actions are hidden without `attendanceDevices.manage`; the tab is hidden without `attendanceDevices.read`.
3. A validity edit never changes the primary flag; Make primary stays one `$transaction` writing `EmployeeWorkSite` and `Employee.locationId` together (spec-proven).
4. Location is read-only on an existing employee record and the update payload never carries `locationId`; it stays editable at create so `requireWorkLocation` is still satisfied.
5. The `employee.workSites` widget, its renderer, its three texts and its adapter code are gone, and any stored layout still naming it is stripped.
6. Reset Password has a confirmation, is visible only when the employee has a linked user, and an API 4xx reaches `classifyCommandFailure` with its real status and code; a 5xx stays unexpected.
7. The record export writes lookup display names for Owner, Reporting Manager, relation type and every lookup; a lookup with no display name exports empty, never an id.
8. Removed copy: login Remember me hint (and the row does not wrap), hierarchy intro, Assign dialog adapter note, Assign Roles panel subtitle.
9. Record Status popover: one status (Employment Status), no Sub Status for employees, Owner as a name.
10. More tabs menu closes on Escape, outside pointer, and focus leaving it (which is what opening a dialog does).
11. Provision System Access and Send Invitation Now are not on an existing record.
12. Record section columns: 3 only from `xl`, 2 from `md`.
13. Assign Roles panel renders above the record action bar, checkboxes are named, Assigned On is formatted, a success toast follows assignment.

## Dependencies

ADR-0014 and ADR-0017 (walkthrough branch, orchestrator merges). No blocking
dependency on other WP streams.

## Files / modules affected

apps/web:
- `app/components/runtime/module-widget-renderer.tsx` — hierarchy rewrite, work-site widget removal
- `lib/runtime/modules/employee-hierarchy-tree.ts` (new) + spec — card state and positioning
- `lib/runtime/modules/employee-metadata.adapter.ts` — Work Sites tab/relationship, remove widget, runtime values, owner display, status field, create-only filter
- `lib/runtime/modules/employee-data.adapter.ts` — work-site related-record mapping, remove widget code, drop locationId on update
- `lib/runtime/modules/employee-work-sites.ts` (new) + spec — row mapping and payloads
- `lib/runtime/modules/employee-account-actions.ts` (new) + spec — commands and request error
- `app/(authenticated)/employees/_components/employee-runtime-form-wrapper.tsx` — uses the above, Location read-only, create-only filter
- `lib/runtime/command-failure-message.ts` — request-error builder that keeps status
- `lib/runtime/module-adapter-command-handlers.ts` + spec — lookup display values in export
- `app/components/runtime/module-runtime-command-handler.tsx`, `module-record-page.tsx` — thread `lookupDisplayValues` (prop only)
- `lib/runtime/metadata-runtime.types.ts`, `lib/runtime/module-data-adapter.types.ts` — optional `rowActions`, `removeConfirmation`, `runRelatedRowAction`
- `app/components/runtime/module-related-subgrid.tsx` — row actions, remove confirmation, create permission, panel portal/z-index, subtitle, names, formatting, toast
- `app/components/runtime/module-record-status-popover.tsx` — field label, optional sub status
- `app/components/runtime/responsive-runtime-tabs.tsx` — menu close rules
- `app/components/metadata/runtime-metadata-form-renderer.tsx` — section column classes only
- `app/components/runtime/module-assign-dialog.tsx`, `app/(public)/login/login-form.tsx` — copy removal

services/api:
- `modules/attendance-integrations/operations/attendance-operations.service.ts` — pass `dto.isPrimary` through
- `modules/attendance-integrations/operations/attendance-operations.controller.ts` — export the two DTO classes for the seam spec
- `…/operations/attendance-operations.service.spec.ts`, `…/operations/attendance-operations.dto.spec.ts` (new)

Not touched: `error-provider.tsx`, `ui/form-control.tsx` (WP-01), customization,
notifications, `packages/config/system-widget-registry.js` (the registry entry
for `employee.workSites` is left for the Architect; see Risks).

## Database impact

None — no model, column, index or migration.

## Backend impact

`AttendanceOperationsService.assignWorkSite` forwards `dto.isPrimary` as given
(`undefined` when omitted) instead of coercing to `false`; the resolver already
defaults a created row to non-primary. Transaction boundaries unchanged. No
new endpoint: the subgrid list maps the existing `GET …/work-sites` response
client-side in the employee adapter.

## Frontend impact

Runtime, not bespoke: the Work Sites tab is a standard `related_module` tab.
Generic subgrid gains two optional, declarative capabilities (`rowActions`
routed to `dataAdapter.runRelatedRowAction`, `removeConfirmation` via the shared
`ConfirmDialog`) so the transactional call is owned by the employee adapter,
never hardcoded in the shared file. Loading/error/empty states are the
subgrid's own. The hierarchy dialog keeps the shared `Dialog`; the card uses a
portal. Accessibility: named Close control, links as nodes with
`aria-current` on the viewed employee, named checkboxes.

## Permission / RBAC impact

- No new or changed keys in `permissions.ts` / `rbac-matrix.ts` / `security-keys.ts`.
- Work Sites tab: visible with `attendanceDevices.read`; create/update/delete and Make primary gated on `attendanceDevices.manage` (UI only; the API enforces both decorators already).
- The generic subgrid's create action now also honours `api.permissions.create` (previously only update/delete did) — affects project assignments and role assignments cosmetically, matching the API.
- No elevated-role change. The old widget additionally required `canManageEmployeeRecord(accessMode)`; the API does not enforce that on these endpoints, so the tab follows the API (INFERENCE: honest affordance; flagged).

## Tenant-isolation impact

No new query. Every work-site call hits the existing controller, which takes
`tenantId` from `request.user` and re-resolves employee and location within
the tenant (`attendance-operations.service.ts:47`, `:86-87`, `:136`, `:194`).
The web proxy forwards the session cookie only. A reviewer confirms by
checking that no `tenantId` appears in any new client payload.

## Audit / event / logging impact

Unchanged audit actions (`employee_work_site_assigned`,
`employee_primary_work_site_changed`, `employee_work_site_removed`). A validity
edit now logs `employee_work_site_assigned` rather than a spurious primary
change only when `isPrimary` is omitted, which is the intended event. Expected
4xx employee account-action refusals stop writing `SYSTEM_UNEXPECTED_ERROR`
client error-log rows.

## Integration impact

None — no gateway, agent, Stripe, email or storage contract changes.

## Migration / data compatibility

Existing `EmployeeWorkSite` rows and `locationId` values display as stored. An
employee with no rows shows one derived primary row for its Location (same
fallback the resolver uses); editing that row's validity materialises it as a
primary assignment. Old web against new API: unchanged behaviour except no
demotion. New web against old API: validity edit on an explicit primary row
would still demote until the API ships — hence api → web order.

## Parallel-safe tasks

- PARALLEL_SAFE: T1 Reset Password path; T2 export; T3 hierarchy dialog; T6 copy removal — separate files.

## Dependency-blocked tasks

- DEPENDENCY_BLOCKED: T4 Work Sites tab depends on T5 subgrid capabilities (types + subgrid); T4's primary-row edit depends on the API forwarding change being deployed first.

## Integration tasks

- INTEGRATION: T7 run web + api unit specs, both typechecks, eslint --fix, write the stream report. Browser and DB-backed checks are the orchestrator's.

## Testing strategy

Commands (AGENTS.md):
- `npm --workspace web run test -- employee-account-actions employee-work-sites employee-hierarchy-tree module-adapter-command-handlers employee-metadata form-layout runtime-tabs related-subgrid`
- `npm --workspace web run check-types`
- `npm --workspace api run test -- attendance-operations` (with a dummy `DATABASE_URL`)
- `npm --workspace api run check-types`
- `npx eslint --fix <changed files>` in each workspace, then re-run tests.

New specs (each fails without its fix): account-action error keeps 400 and
classifies business, 500 stays unexpected, reset command carries confirmation
and a linked-user rule evaluated against real mapped runtime values; export CSV
contains display names and no UUID; hierarchy card reducer and viewport
positioning; work-site row mapping (derived row, only active rows, id =
locationId), assign/update payloads (no empty dates, no `tenantId`, no
`locationId` in employee update); API service spec (omitted `isPrimary` stays
`undefined`, Make primary runs all three writes inside one `$transaction`
callback and none when the assignment is missing); DTO spec validating the exact
client payload shapes with `whitelist` + `forbidNonWhitelisted`; create-only
field filter; section column resolver; removed-copy guard reading the four
source files.

Manual (orchestrator, browser, demo-like tenant): see the stream report's QA
retest steps per record.

## Risks

1. Tenant isolation — low likelihood, high impact: no new query; mitigated by reusing the controller unchanged.
2. Make primary integrity — low/high: server transaction unchanged and spec-proven; the client only calls it.
3. The `employee.workSites` definition stays in `packages/config/system-widget-registry.js`; a designer palette could still offer it and render "no registered renderer". Mitigated by stripping it from stored employee layouts; registry removal left to the Architect (outside this stream's ownership).
4. PATCH `/employees/:id` still accepts `locationId` server-side; only the form stops sending it. Medium/medium — follow-up for the employees module owner.
5. Status popover now edits `employmentStatus` instead of the generic `status`; employees had no working record-status change path (`changeStatus` throws, `employee-data.adapter.ts:230-234`), so no behaviour a user relied on is lost. Low/medium.
6. Business refusal may show two toasts (record page account-action notice and the handler's business toast). Low/low; browser check.
7. A required Location on an old record with no location cannot be filled from the form any more. Low/medium; Assign + Make primary sets it.

## Rollback considerations

Code-only. Revert the branch merge. Reverting the API change alone restores
the demotion bug but breaks nothing else; reverting web alone restores the
widget. No data written by this change needs undoing.

## Definition of Done

- [ ] All requirements implemented, each with a spec that fails without it
- [ ] web and api unit specs pass; both typechecks pass; eslint/prettier clean on changed files
- [ ] No tenantId from client input; both decorators unchanged on every endpoint used
- [ ] Audit unchanged and correct
- [ ] No explanatory text added; the four removed strings guarded
- [ ] Stream report with root causes, fixes, tests, REG-495…REG-504 text, QA steps, risks
- [ ] No files outside declared ownership except the prop threading and shared runtime files named above
