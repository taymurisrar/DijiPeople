# TASK-0031 — WP-03 stream report: employee record

Stream report of [[TASK-0031]].

Branch `agent/walkthrough2-employee-record` (base `origin/develop` 88f33c6e).
Plan: `docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md`.
Reserved regression ids: REG-495 … REG-504 (all used below). No record, index or
generated file was edited; this report is the hand-off.

## Validation run on this branch

| Command | Result |
|---|---|
| `npm --workspace web run test` (whole suite) | 102 suites, 1903 tests passed |
| `npm --workspace web run check-types` | passed |
| `DATABASE_URL=… npm --workspace api run test -- attendance-operations` | 2 suites, 12 tests passed |
| `npm --workspace api run check-types` | 2 errors, both pre-existing and environmental: `src/common/storage/providers/r2-object-storage.provider.ts` cannot resolve `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` (declared in `services/api/package.json:65-66`, absent from the junctioned `node_modules/@aws-sdk`); file not touched here. No error in any changed file. |
| `npx eslint --fix` on every changed web file | 0 errors; 2 warnings on untouched lines (`module-record-page.tsx:173` hook deps, `module-runtime-command-handler.tsx:713` unused helper) |
| `npx eslint --fix` on every changed api file | 0 errors; 1 warning (`expect.objectContaining` in a spec) |

Mutation checks (fix reverted temporarily, spec run, fix restored):
`employee-account-actions.spec.ts` 2 fail with the bare `Error` throw;
`module-adapter-command-handlers.export.spec.ts` 1 fails with the display-name
substitution bypassed; `attendance-operations.service.spec.ts` 1 fails with
`?? false` restored; `employee-record-removed-copy.spec.ts` 1 fails with the
Assign dialog note restored.

---

## BUG-3497 — Reset Password without confirmation, offered without a user, fails silently

**Root cause**
- `apps/web/app/(authenticated)/employees/_components/employee-runtime-form-wrapper.tsx:170-180` (base) — `employees.resetPassword` had no `confirmation` and no `visibilityRules`.
- `employee-runtime-form-wrapper.tsx:285-303` (base) — `postEmployeeAction` threw `new Error(message)`; `command-execution.service.ts:138-141` reads `error.data`, which a bare `Error` lacks; `command-failure-message.ts:38-44` then defaulted the status to 500 → `SYSTEM_UNEXPECTED_ERROR` → `module-runtime-command-handler.tsx:348` dispatched it to the client error log.
- Found in passing: Send Invitation's rule reads `hasNeverLoggedIn`, which the API returns (`employees.service.ts:3731`) but `mapEmployeeRecordToRuntimeValues` never mapped, and `field-equals` compares with `===` — so Send Invitation was never offered to anyone.

**Fix**
- Commands and the request moved to `apps/web/lib/runtime/modules/employee-account-actions.ts`. Reset Password carries `confirmation` (title "Send password reset link?", button "Send link") handled by the runtime's existing confirmation dialog, and `visibilityRules: field-equals hasLinkedUser === true`.
- `mapEmployeeRecordToRuntimeValues` now maps `hasLinkedUser` (from `userId`) and `hasNeverLoggedIn`.
- `postEmployeeAction` throws `buildCommandRequestError(status, payload)` (new in `apps/web/lib/runtime/command-failure-message.ts`), whose `data.response` carries the real status and envelope. A 4xx with the API envelope classifies as business (toast in place, no error-log row); a 5xx, or a 4xx with no server message (proxy/HTML), stays unexpected.

**Tests** — `apps/web/lib/runtime/modules/employee-account-actions.spec.ts` (400 → business with statusCode 400 / VALIDATION_FAILED; 500 → unexpected; 4xx without envelope → unexpected; confirmation present; hidden with no linked user; shown with one; Send Invitation reachable; owner display).

**Not established** — why the original failure showed no technical dialog either. Browser check below.

**QA retest (browser)**
1. Employee with no linked user (demo EMP-0001): Reset Password is not in the command bar.
2. Employee with a linked user: Reset Password opens a confirmation; Cancel sends no request (network tab); Send link sends it and a success notice appears.
3. Force a refusal (e.g. deactivate the user between page load and click, or intercept the response to 400 with the API envelope): the API message appears in place; no `POST /api/error-logs/client` is sent.
4. Intercept to 500: the technical error path still appears and logs.
5. Employee whose login was never used: Send Invitation is offered.

**Residual risk** — on a refusal the record page's account-action notice (`module-record-page.tsx`, `isEmployeeAccountAction`) and the handler's business toast may both show; check for a double toast.

**REG-495 — An employee account-action refusal lost its HTTP status and was logged as a 500**

| | |
|---|---|
| **Bug class** | `error-contract-dropped-at-adapter-seam` |
| **Module** | `apps/web` (employee record, runtime command failure path) |
| **Bug record** | BUG-3497 |
| **Root cause** | `postEmployeeAction` threw a bare `Error` on a non-OK response, so `executeInjectedHandler` found no `error.data`, `readCommandFailureContract` defaulted the status to 500, and an expected 400 refusal was dispatched to the client error log as `SYSTEM_UNEXPECTED_ERROR` with nothing shown to the user. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-account-actions.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | A 400 envelope from `POST /api/employees/{id}/send-reset-password-link` reaches `classifyCommandFailure` as status 400 / `VALIDATION_FAILED` and classifies as business; a 500 and an envelope-less 4xx stay unexpected. |
| **Proven to fail without the fix** | Restoring `throw new Error("Employee account action failed.")` fails two cases (400 classified as 500; envelope-less path). |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

**REG-496 — Reset Password acted on the first click and was offered to employees without a login**

| | |
|---|---|
| **Bug class** | `unguarded-destructive-command` |
| **Module** | `apps/web` (employee record commands) |
| **Bug record** | BUG-3497 |
| **Root cause** | The command had no confirmation and no visibility rule; the sibling Send Invitation's rule read a flag (`hasNeverLoggedIn`) the runtime record never carried, so it could not pass either. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-account-actions.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | Reset Password declares a confirmation; evaluated against the real `mapEmployeeRecordToRuntimeValues` output it is hidden when `userId` is null and shown when set; Send Invitation is shown when the API reports `hasNeverLoggedIn: true`. |
| **Proven to fail without the fix** | Without the `hasLinkedUser` mapping the "offered with a linked user" case fails; without the confirmation the confirmation case fails. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## BUG-3498 — The record export writes lookup fields as raw ids

**Root cause** — `apps/web/lib/runtime/module-adapter-command-handlers.ts:700-719` (base): `displayExportValue` had no lookup handling, and `exportRecordFormCsv` never received the `lookupDisplayValues` the record page already holds (`module-record-page.tsx:67`).

**Fix**
- `lookupDisplayValues` threaded as a prop: `module-record-page.tsx` → `ModuleRuntimeCommandHandler` → `buildAdapterCommandHandlers` → `exportRecordFormCsv`.
- Every lookup field's value is replaced by its display name before rows are built (`withLookupDisplayNames`).
- A lookup still holding an id exports as an empty cell (`displayExportLookupValue`). Embedded objects export their name.
- Applies to every module using the client-side record export.

**Tests** — `apps/web/lib/runtime/module-adapter-command-handlers.export.spec.ts` (Owner / Reporting Manager / relation type names; no UUID anywhere in the CSV; option set, boolean, date unchanged).

**QA retest** — export an employee with owner, reporting manager and emergency contact relation type set; open the CSV: names, no UUIDs; Employment Status reads "Active"; dates and Yes/No unchanged.

**Residual risk** — a lookup whose name the page does not know exports blank rather than the id (by design).

**REG-497 — Record export wrote lookup ids instead of names**

| | |
|---|---|
| **Bug class** | `display-value-not-carried-to-export` |
| **Module** | `apps/web` (runtime record export) |
| **Bug record** | BUG-3498 |
| **Root cause** | `displayExportValue` read the stored lookup value (the referenced id) and the export path never saw the record page's `lookupDisplayValues`. |
| **Regression test** | `apps/web/lib/runtime/module-adapter-command-handlers.export.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | `record.export` on an employee record whose Owner, Reporting Manager and relation type hold ids writes their display names; a lookup with no known name is blank; the CSV contains no UUID. |
| **Proven to fail without the fix** | Bypassing the display-name substitution fails the names case. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## BUG-3499 — Hierarchy dialog: pinned clipped card, no close control, no record navigation (ADR-0017)

**Root cause (file:line at base 88f33c6e)**
- Card on open: `apps/web/app/components/ui/dialog.tsx:167-174` focuses the first focusable element, which was the root node; its `onFocus` opened the card (`module-widget-renderer.tsx:2834`).
- Tap shows nothing: the same button's `onClick` toggled the card (`:2833`) right after focus opened it.
- Clipping: the card was `absolute` (`:2858`) inside `overflow-auto` (`:2787`), inside the body's `overflow-y-auto` and the panel's `overflow-hidden` (`dialog.tsx:307`, `:343`).
- Single column: both lists were `flex flex-col` (`:2788`, `:2881`).
- No navigation: nodes were `<button>` (`:2825`). No close control: no footer or close button passed. Intro: `description=` (`:2775`).
- Hover on other nodes (inference, confirm in browser): each node's card rendered inside the scroll container, extending its scroll area below the visible region instead of overlaying. The first child was covered by the pinned root card, so the pointer never entered it.
- Accessible name (inference): `aria-labelledby` was set (`dialog.tsx:246-247`), so the reported missing name is unconfirmed. The rewrite keeps the shared `Dialog` title and names the tree list.

**Fix** — `apps/web/app/components/runtime/module-widget-renderer.tsx` (`ReportingHierarchyTreeDialog`, `ReportingHierarchyBranch`, `ReportingHierarchyNodeLink`, `ReportingHierarchyDetailCard`); rules in `apps/web/lib/runtime/modules/employee-hierarchy-tree.ts`.
- Branching layout: children in a row under their manager, joined by CSS pseudo-element connectors, inside an `overflow-x-auto` region. Still hand-rolled, no dependency (ADR-0012).
- A visible Close control (`DialogCloseButton`) is the first focusable element, so opening shows no card.
- Nodes are links to `/employees/{id}`, with `aria-current` on the viewed employee.
- Mouse: hover shows the card; click opens the record. Keyboard: focus shows it; Enter opens.
- Touch: the first tap shows the card and the second opens the record.
- The card renders in a portal (`z-[120]`, `pointer-events-none`), placed inside the viewport, and repositions on scroll or resize.
- Intro text removed; chain scope and the `canReadWorkEmail` / `canReadWorkSite` checks unchanged.

**Tests** — `apps/web/lib/runtime/modules/employee-hierarchy-tree.spec.ts`: no card initially; hover moves the card; stale blur doesn't close another node's card; tap after focus keeps the card; tap intent (mouse/keyboard navigate, touch show-then-navigate); placement below/above/clamped left/right.

**QA retest (browser, required — a DOM-less test cannot see clipping)**
1. Record whose chain has a manager with 2+ reports → View hierarchy: no card visible; Close visible top-right; focus is on Close.
2. Siblings sit side by side under their manager with connector lines. On a wide tree, the dialog scrolls horizontally and the page does not.
3. Hover each node: its card shows, fully visible, no text cut on the left, and it moves to the next node hovered.
4. Tab to a node: the card shows; Enter opens that employee's record.
5. Touch (device emulation): the first tap shows the card and the second opens the record.
6. Card near the bottom or right edge flips/clamps inside the viewport; scrolling the tree keeps it attached.
7. Accessibility tree: the dialog is named "Reporting hierarchy"; no intro paragraph.
8. At 400px the dialog is usable (horizontal scroll inside the dialog).

**Residual risk** — connector alignment and Tailwind v4 `first:/last:/only:` pseudo-element variants are unverified visually.

**REG-498 — Hierarchy card opened on its own and a tap could never show it**

| | |
|---|---|
| **Bug class** | `focus-and-click-toggle-conflict` |
| **Module** | `apps/web` (employee record hierarchy dialog) |
| **Bug record** | BUG-3499 |
| **Root cause** | The dialog auto-focused the root node, whose focus handler opened its card, and the same control's click toggled the card shut after focus had opened it. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-hierarchy-tree.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | Initial card state is empty; focus then tap on the same node leaves its card open; hovering another node moves the card; a stale blur does not close it; touch activation shows the card first and navigates second. |
| **Proven to fail without the fix** | The old toggle (focus opens, click toggles) is exactly the "tap after focus" case, which requires the card to stay open. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

**REG-499 — Hierarchy card was clipped by the dialog's scroll containers**

| | |
|---|---|
| **Bug class** | `popover-clipped-by-overflow-ancestor` |
| **Module** | `apps/web` (employee record hierarchy dialog) |
| **Bug record** | BUG-3499 |
| **Root cause** | The card was absolutely positioned inside `overflow-auto` / `overflow-y-auto` / `overflow-hidden` ancestors. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-hierarchy-tree.spec.ts` (placement); browser check required for clipping |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | The card position is computed in viewport coordinates, below the node when it fits, above when not, clamped inside both horizontal margins; rendered in a portal at the body. |
| **Proven to fail without the fix** | The base component had no viewport placement at all; the clamping cases describe the observed left-edge cut. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## ITEM-0179 — Work Sites related-records tab with transactional Make primary (ADR-0014)

**Root cause / starting point**
- Widget `employee.workSites` in the Organization section (`employee-metadata.adapter.ts:852-859` base), renderer `module-widget-renderer.tsx:2101-2613` base, data and actions `employee-data.adapter.ts:432-598` base.
- Latent defect found: `attendance-operations.service.ts:95` passed `isPrimary: dto.isPrimary ?? false`, and the resolver only preserves the flag for `undefined` (`employee-work-site-resolver.service.ts:269-271`). The widget's Edit validity therefore demoted the primary row while `Employee.locationId` still pointed at it.
- Location was an ordinary editable field; PATCH `/employees/:id` writes it (`employees.service.ts:3541`) without touching `EmployeeWorkSite`.

**Fix**
- **Tab.** `employee-metadata.adapter.ts` adds relationship `employee_work_sites` (target field `employeeId`) and a Work Sites `related_module` form tab (order 25). Stored main forms get the tab too. It is visible with `attendanceDevices.read`.
- **Subgrid.** Columns Site / Primary / Valid From / Valid To. Assign panel over active locations with Valid From / Valid To. Edit (validity) through the quick panel. Confirmed Remove. Row action Make primary, hidden on the primary row. All actions require `attendanceDevices.manage`.
- **Adapter** (`employee-data.adapter.ts`, shapes in `employee-work-sites.ts`):
  - List maps `GET …/work-sites` to rows keyed by location. With no rows, it shows the derived primary row (the resolver's own fallback).
  - Assign and validity edit go to `POST …/work-sites` with `null` for empty dates. `isPrimary` is omitted, or `true` only to materialise a derived row.
  - Remove goes to `DELETE …/work-sites/{locationId}`. Make primary goes to `POST …/work-sites/primary`.
- **Shared subgrid** (`module-related-subgrid.tsx` + `related-subgrid-rows.ts`):
  - Generic optional `rowActions` run by `dataAdapter.runRelatedRowAction`, then the parent page refreshes (Location changes).
  - Optional `removeConfirmation` via the shared `ConfirmDialog`.
  - Create now honours `api.permissions.create`, as update and delete already did.
- **API.** `assignWorkSite` forwards `dto.isPrimary` unchanged. `AssignWorkSiteDto` and `SetPrimaryWorkSiteDto` are exported for the seam spec; the date type is `string | null`.
- **Location.** Read-only on an existing record (`employee-runtime-form-wrapper.tsx` `resolveFieldEditable`), editable at create so `requireWorkLocation` is still satisfiable. The update payload drops `locationId`.
- **Removals.** Widget renderer, panel, three texts, adapter widget code, `runWidgetAction` / `WidgetActionInput` types. Stored layouts naming `employee.workSites` are stripped when mapped.
- No new endpoint; permissions and tenant scoping unchanged.

**Tests**
- `apps/web/lib/runtime/modules/employee-work-sites.spec.ts` — rows, derived row, payload nulls, no primary flag on a validity edit, derived row kept primary, no tenant/employee id, update drops `locationId`.
- `apps/web/lib/runtime/modules/employee-metadata.work-sites.spec.ts` — tab, relationship binding, columns, endpoints and permissions, row action, visibility, widget gone, stored layout stripped and tab added.
- `apps/web/lib/runtime/related-subgrid-rows.spec.ts` — Make primary hidden on the primary row and without permission.
- `services/api/src/modules/attendance-integrations/operations/attendance-operations.service.spec.ts` — omitted `isPrimary` stays undefined; assign-as-primary writes in the tx; Make primary writes all three inside one `$transaction` callback; tx failure → nothing audited; missing assignment → no transaction; tenant-scoped lookup.
- `…/attendance-operations.dto.spec.ts` — the exact client payloads validate under `whitelist` + `forbidNonWhitelisted`; empty-string date and `tenantId` are rejected.

**QA retest (browser, DB-backed)**
1. Owner employee (Location Head Office, no rows): Work Sites tab shows one row Head Office, Primary Yes; no "no assignments" text; the Organization section has no work-site panel or info box.
2. Assign Warehouse with Valid From: row appears, Primary No; DB `EmployeeWorkSite` row ACTIVE, `isPrimary=false`.
3. Edit Head Office validity: dates saved and Head Office stays Primary (DB `isPrimary=true`, `Employee.locationId` unchanged).
4. Make primary on Warehouse: Warehouse becomes Primary; Head Office no longer; the form's Location reads Warehouse after refresh; DB shows both rows and `locationId` changed together.
5. Remove Warehouse (primary) with another active site: confirmation shows; after confirm, the other site is primary. Removing the only site shows the API refusal in the tab.
6. Edit the employee form: Location is read-only; saving sends no `locationId` (network tab).
7. A user with `attendanceDevices.read` but not `manage` sees rows but no Assign, Edit, Remove or Make primary. A user without `read` does not see the tab.
8. 400px: tab usable; Assign panel controls not truncated.
9. A layout saved in the form designer with the old widget renders no "no registered renderer" box.

**Residual risks**
- `packages/config/system-widget-registry.js:57` still registers `employee.workSites` (outside this stream). The form designer could still offer it; mapping strips it on employee forms. Recommend removing the registry entry and its two test expectations.
- PATCH `/employees/:id` server-side still accepts `locationId`; only this client stops sending it. A follow-up for the employees module is needed to enforce ADR-0014 at the API.
- Interpretation: "no action while the record is in read mode" is implemented as the `attendanceDevices.manage` gate. Related tabs on this record are always used in read mode. The old widget's extra `canManageEmployeeRecord(accessMode)` check is not applied, because the API does not enforce it on these endpoints.
- An old record with a required but empty Location can no longer fill it from the form; Assign + Make primary does.
- The generic subgrid's create action now also honours `api.permissions.create`. Project assignments (`projects.assign`) and user roles (`users.assign-roles`) hide Assign from users who lack those permissions, matching the API.

**REG-500 — Work sites were an in-form widget that contradicted the record**

| | |
|---|---|
| **Bug class** | `second-write-path-for-one-fact` |
| **Module** | `apps/web` (employee record, runtime subgrid) |
| **Bug record** | ITEM-0179 |
| **Root cause** | Work sites lived in a bespoke widget whose empty state ignored the derived primary site, while Location remained a separately editable path to the same fact. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-work-sites.spec.ts`, `apps/web/lib/runtime/modules/employee-metadata.work-sites.spec.ts`, `apps/web/lib/runtime/related-subgrid-rows.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | The employee main form (system and stored) has a Work Sites related tab bound by `employeeId`, writing only to the attendance work-site endpoints under `attendanceDevices.manage`; a record with no rows shows its Location as the primary row; the assign payload carries no empty-string date and no tenant id; the employee update drops `locationId`; no layout renders `employee.workSites`. |
| **Proven to fail without the fix** | Every case asserts structure that did not exist at base (no tab, widget present, `locationId` in update). |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

**REG-501 — Editing a work site's dates cleared its primary flag**

| | |
|---|---|
| **Bug class** | `omitted-flag-coerced-to-false` |
| **Module** | `services/api/src/modules/attendance-integrations` |
| **Bug record** | ITEM-0179 |
| **Root cause** | `assignWorkSite` passed `dto.isPrimary ?? false` to a resolver that only leaves the flag alone for `undefined`. |
| **Regression test** | `services/api/src/modules/attendance-integrations/operations/attendance-operations.service.spec.ts`, `…/attendance-operations.dto.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | Assign without `isPrimary` reaches the resolver with `isPrimary` undefined and does not touch `Employee.locationId`; Make primary writes the old primary, new primary and `Employee.locationId` through the same transaction client and nothing when the site is not an active assignment; the web payload shapes validate against the DTOs. |
| **Proven to fail without the fix** | Restoring `?? false` fails the "leaves the primary flag untouched" case. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## ITEM-0183 — explanatory copy removed (this stream's occurrences)

| # | Removed | File |
|---|---|---|
| 1 | Login "Keeps you signed in on this browser across restarts…" hint; row set to `shrink-0` / `whitespace-nowrap` so "Activate account" does not wrap | `apps/web/app/(public)/login/login-form.tsx` |
| 2 | Work-site widget description, blue info box, empty-state paragraph (with the widget) | `apps/web/app/components/runtime/module-widget-renderer.tsx` |
| 3 | Hierarchy intro "An avatar and a name at rest…" | same |
| 5 | Assign dialog "This action updates ownership through the Module data adapter…" | `apps/web/app/components/runtime/module-assign-dialog.tsx` |
| 6 | Assign panel subtitle "Select one or more employees and apply the same allocation, billing, and approval details…" | `apps/web/app/components/runtime/module-related-subgrid.tsx` |

Guard: `apps/web/lib/runtime/modules/employee-record-removed-copy.spec.ts`, mutation-tested.
QA: login at 1440px and 400px, where Remember me and Activate account each sit on one line; open Assign on a record and open Assign Roles on a user, and neither carries the sentence.

**REG-504 — Removed explanatory copy on the employee record, login and Assign surfaces stays removed**

| | |
|---|---|
| **Bug class** | `agent-added-explanatory-copy` |
| **Module** | `apps/web` |
| **Bug record** | ITEM-0183 |
| **Root cause** | Agents explained controls with sentences instead of making the controls clear; the owner ruled such copy out. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-record-removed-copy.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | The six removed fragments are absent from their source files (whitespace-normalised). |
| **Proven to fail without the fix** | Re-adding the Assign dialog note fails the guard. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## ITEM-0184 — employee record, login and users parts

| Ref | Fix | File |
|---|---|---|
| H4 | Employee entity `statusField` → `employmentStatus`, no `subStatusField`; popover labels the row with the field's display name; Owner is a name (email only when there is no name) | `employee-metadata.adapter.ts`, `module-record-status-popover.tsx` |
| H7 | More menu closes on Escape (focus returns to More), outside pointer, and focus moving outside (what opening a dialog does) | `responsive-runtime-tabs.tsx` |
| H9 | Provision System Access / Send Invitation Now removed from the form on detail and edit (kept on create) | `employee-metadata.adapter.ts` `withoutCreateOnlyEmployeeFields`, wrapper |
| H10 | Section columns: 3 only from `xl`, 2 from `md` | `lib/runtime/form-layout-grid.ts` `resolveSectionColumnClass`, form renderer |
| C4 | Assign panel portalled to `document.body` at `z-[110]`; checkboxes named (`aria-label`); ISO timestamps in columns without field metadata formatted as date-time; "Assigned." success toast | `module-related-subgrid.tsx`, `related-subgrid-rows.ts` |

Not in this stream (per brief): CNIC field, form selector visibility, Global Administrator description (`rbac-matrix.ts`, single-writer), customization rows.

**Tests** — `employee-metadata.work-sites.spec.ts` (status field, create-only filter), `employee-account-actions.spec.ts` (owner name), `form-layout-section-columns.spec.ts`, `related-subgrid-rows.spec.ts` (timestamp cells). The More menu listener has no unit test (DOM behaviour); browser check below.

**QA retest**
1. Record Status: shows Owner as a name only and Employment Status; no Sub Status.
2. More menu: open → Escape closes; open → click elsewhere closes; open → trigger a dialog (e.g. Assign) → menu is closed.
3. Existing employee: System Information has no Provision System Access / Send Invitation Now; New employee still has both.
4. 820px: the Summary tab shows two section columns; 1440px shows three.
5. Settings → Users → a user → Roles → Assign: panel above the record action bar; screen reader names each checkbox by role; after Save & Close an "Assigned." toast; Assigned On formatted per tenant settings.

**Residual risk** — H4 changes what the popover edits for employees (`employmentStatus` instead of the generic `status`); employees had no working record-status change path (`changeStatus` throws), so no working behaviour is lost, but check that editing Employment Status from the popover in edit mode saves correctly.

**REG-502 — Create-time employee fields showed on existing records**

| | |
|---|---|
| **Bug class** | `create-only-field-on-saved-record` |
| **Module** | `apps/web` (employee record form) |
| **Bug record** | ITEM-0184 |
| **Root cause** | Provision System Access and Send Invitation Now were ordinary System Information fields in every mode. |
| **Regression test** | `apps/web/lib/runtime/modules/employee-metadata.work-sites.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | `withoutCreateOnlyEmployeeFields` removes both fields and keeps `userId`; the unfiltered form (used on create) still has both; the employee entity's status field is Employment Status with no sub status. |
| **Proven to fail without the fix** | The filter did not exist; the status-field case fails at base (`status` / `subStatus`). |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

**REG-503 — Record sections stayed three columns at tablet width**

| | |
|---|---|
| **Bug class** | `breakpoint-too-early` |
| **Module** | `apps/web` (runtime form renderer) |
| **Bug record** | ITEM-0184 |
| **Root cause** | `runtimeSectionColumnClass` used `md:grid-cols-3`, so any viewport from 768px laid sections three across. |
| **Regression test** | `apps/web/lib/runtime/form-layout-section-columns.spec.ts` |
| **QA scenario** | to be assigned by the orchestrator |
| **Scenario** | A three-column layout resolves to `md:grid-cols-2 xl:grid-cols-3`; two- and one-column layouts unchanged. |
| **Proven to fail without the fix** | The base class string contains `md:grid-cols-3`, which the first case forbids. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-employee-record` |
| **Active** | yes |

---

## Files outside the declared ownership

The ExecPlan names each of these under "Files / modules affected"; each change is minimal:

- `apps/web/app/components/runtime/module-record-page.tsx`, `module-runtime-command-handler.tsx` — pass `lookupDisplayValues` (BUG-3498).
- `apps/web/lib/runtime/metadata-runtime.types.ts`, `module-data-adapter.types.ts` — optional `rowActions`, `removeConfirmation`, `runRelatedRowAction`; removed the dead `runWidgetAction` types.
- `apps/web/app/components/runtime/responsive-runtime-tabs.tsx`, `module-record-status-popover.tsx`, `app/components/metadata/runtime-metadata-form-renderer.tsx`, `lib/runtime/form-layout-grid.ts` — ITEM-0184 H7 / H4 / H10.

Not touched: `error-provider.tsx`, `ui/form-control.tsx`, customization, notifications, `packages/config`.
