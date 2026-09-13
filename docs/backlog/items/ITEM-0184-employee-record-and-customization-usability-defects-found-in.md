---
ID: ITEM-0184
aliases: [ITEM-0184]
Title: Employee record and customization usability defects found in the second demo walkthrough
Type: UX
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [apps/web, employees, customization, users]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: 
RelatedQA: [QA-EMPLOYEE-007]
RelatedADR: 
RelatedImplementation: [docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md, docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md, apps/web/app/components/runtime/responsive-runtime-tabs.tsx, apps/web/app/components/runtime/module-record-status-popover.tsx, apps/web/lib/runtime/form-layout-grid.ts]
TargetMilestone: 
BlockedBy: 
---

# ITEM-0184 — Employee record and customization usability defects found in the second demo walkthrough

## Summary

A batch of individually small usability defects on the employee record and in
Settings → Customization, found while walking the demo tenant as its owner.
None blocks a task on its own. Together they make the record page feel
unfinished and customization feel like a developer console. They include:
- duplicated or meaningless status fields;
- create-time actions shown as record fields;
- a menu that will not close;
- controls with no accessible name;
- raw system names and UUIDs where display names belong;
- dialogs that say "Save changes" when creating;
- no success feedback.

For customization, the owner decided on 2026-09-13 to keep the package, prefix
and layer model and to fix usability within it. This item does not propose
changing that model.

## Why It Matters

These are the screens a prospective customer sees in a demo, and each defect
costs credibility. Several are accessibility failures: unnamed checkboxes and
comboboxes, and a menu that traps over dialogs. Others show internal
identifiers or a Pakistan-specific field to every tenant. The customization
defects matter more than their size suggests. Customization is sold as
something a business administrator can use, and at present every dialog
assumes a developer.

## Evidence

Observed on the demo tenant (`https://dijipeople-demo.ws.dijipeople.com`) as
the workspace owner, deployed build at `df0f84f1`.

### Employee record

| Ref | Defect | Source |
|---|---|---|
| H4 | Record Status popover: Status duplicates Employment Status; "Sub Status: Open" carries no meaning; Owner renders name and email concatenated | `apps/web/app/components/runtime/module-record-status-popover.tsx` (Sub Status at `:115`) |
| H7 | The "More" tabs menu does not close on Escape as observed, and stays open over dialogs opened from the record | `apps/web/app/components/runtime/responsive-runtime-tabs.tsx` (menu state `:74`, Escape handling `:186`) |
| H9 | System Information section renders create-time actions "Provision System Access" and "Send Invitation Now" as record fields | `apps/web/lib/runtime/modules/employee-metadata.adapter.ts:429`, `:434` |
| H9 | A "CNIC" field is hardcoded for every tenant regardless of country | `apps/web/lib/runtime/modules/employee-metadata.adapter.ts:230` |
| H9 | Form selector (Main / Quick form) exposed to end users on the record | `apps/web/lib/runtime/modules/employee-metadata.adapter.ts:1051` |
| H10 | At 820px the record keeps three columns squeezed to ~200px each instead of reflowing | employee record layout |

### Assign Roles side panel (user record)

| Ref | Defect | Source |
|---|---|---|
| C4 | The record action bar renders above the side panel (stacking order) | `apps/web/app/components/runtime/module-related-subgrid.tsx` panel at `:1020` |
| C4 | Role checkboxes have no accessible names | same panel |
| C4 | "Assigned On" shows a raw ISO timestamp | same panel |
| C4 | No success toast after assigning | same panel |
| C4 | Global Administrator is described as "Tenant owner role" while the tenant owner holds System Admin | `services/api/src/common/constants/rbac-matrix.ts:540` |

The copied allocation subtitle in the same panel is removed by [[ITEM-0183]].

### Customization

| Ref | Defect | Source |
|---|---|---|
| C7 | Create module dialog asks a business user for a raw camelCase "Module logical name" | `apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx:380-391` |
| C7 | The create dialog's submit button reads "Save changes" | `tables-list.tsx:453-455` |
| C7 | No success toast; the new module is not visible on page 1 of 55 and there is no jump to it | `tables-list.tsx` |
| C8 | Add field dialog: field-type options show raw lowercase values ("text", "datetime", "multiline text") | `apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx:32`, `:814` |
| C8 | "Reference target" control shown for non-reference field types | `columns-management.tsx:567` |
| C8 | Select comboboxes in the dialog have no accessible name | `columns-management.tsx` |
| C8 | Validation errors (e.g. maximum length) appear at the bottom of the dialog, not on the field | `columns-management.tsx` |
| C11 | Lifecycle and package labels contradict: module "published" while its fields, forms and views read "Draft"; one module appears under "Default Package", "Custom Package" and "Unassigned Draft Customizations" | customization list and detail screens |
| C12 | Module detail and designer headers show system names ("QaAsset", "Main") instead of display names | customization detail and designer pages |
| C12 | Customization tables overflow at 1440px (Tabs count, Lifecycle columns cut) | customization list screens |
| C13 | Form designer palette is click-to-add only: dragging does nothing; saving gives no success feedback | `apps/web/app/(authenticated)/settings/customization/_components/form-designer-workspace.tsx` |
| C14 | Create view: camelCase "View logical name"; filter and sort as raw JSON textareas | `apps/web/app/(authenticated)/settings/customization/_components/views-management.tsx:578`, `:649-657` |
| C17 | Publish Center rows show raw component UUIDs under the name, and a "Layer action" column (Create / Reference) | `apps/web/app/(authenticated)/settings/customization/_components/publish-center.tsx:103`, `:137` |

Only the **display** parts of C17 are in scope. The publish dead end (C18), the
access-guard mismatch, the custom-field `maxLength` seam and the missing runtime
for published modules are separate work and are not tracked here.

## Proposed Approach

Contained; no ExecPlan needed. Each row is a local fix in an existing shared
component or adapter. Where a fix lands in a shared component (`FieldShell`,
the related subgrid panel, `responsive-runtime-tabs.tsx`), it fixes every
screen that uses it.

1. **Status popover:** drop the duplicated Status where the module already
   shows Employment Status. Hide Sub Status when it has no configured values.
   Render Owner as a name, with email only as secondary text.
2. **More menu:** close on Escape and outside click, and close whenever a
   dialog opens.
3. **System Information:** move Provision System Access and Send Invitation Now
   to create-time only, or to record commands. Make CNIC a configurable
   national-id field driven by tenant settings, not a hardcoded label. Hide the
   form selector from users without customization permissions.
4. **Responsive record:** reflow to one or two columns below tablet width,
   using the existing runtime shell breakpoints.
5. **Assign Roles panel:** raise the panel above the action bar. Name every
   checkbox by its role. Format Assigned On with the tenant formatting context.
   Show a success toast. Correct the Global Administrator description to match
   what the role is actually used for.
6. **Customization dialogs:** derive logical names from the display name (keep
   the prefix model) and show them read-only. Label the create button "Create".
   Show a toast and navigate to the new record. Use display labels for field
   types. Show Reference target only for reference types. Name every combobox.
   Render errors on their fields.
7. **Headers, tables, Publish Center:** display names in headers. No horizontal
   overflow at 1440px. Hide component UUIDs. Replace "Layer action" with a
   plain column, or drop it.
8. **Form designer:** make drag work, or drop the drag affordance; show a
   success toast on save.

No remedy adds explanatory text; see [[ITEM-0183]].

## Acceptance Criteria

- The Record Status popover shows no field twice, no empty Sub Status, and
  Owner as a name.
- Pressing Escape closes the More tabs menu, and opening any dialog closes it.
- Provision System Access and Send Invitation Now do not appear as fields on
  an existing employee record.
- No field labelled "CNIC" appears for a tenant whose country configuration does
  not call for it.
- An end user without customization permissions cannot see the form selector.
- At 820px the employee record renders no column narrower than its content
  minimum, and does not render three columns.
- In the Assign Roles panel every checkbox has an accessible name, Assigned On
  is formatted, a success toast appears, and the panel is above the action bar.
- The Create module dialog asks for no camelCase input, its primary button reads
  "Create", and after creation the user lands on the new module.
- Add field shows human-readable type labels, shows Reference target only for
  reference types, names every combobox, and places validation errors on the
  offending field.
- Module detail and designer headers show display names. Customization tables
  do not overflow at 1440px.
- Publish Center shows no raw UUID and no "Layer action" jargon.
- Form designer save shows success feedback, and either drag-to-add works or
  no drag affordance is shown.
- No new explanatory text was added.

## Dependencies

None blocking. Customization leaf pages must be reachable for the owner (the
BUG-3374 retest and the access-rule fix) before the customization rows can be
browser-verified.

## Related Items

[[BUG-3374]] customization routing. [[ITEM-0183]] helper-text removal.
[[ITEM-0167]] record shell conformance. [[ITEM-0164]] hierarchy viewer on the
same record page. [[ITEM-0179]] Work Sites tab on the same record.

Follow-ups filed for rows this item closed without: [[ITEM-0186]] Form Designer
drag-to-add; [[ITEM-0196]] the CNIC field, the end-user form selector and the
Global Administrator description.

## Resolution

Done in TASK-0031 WP-01 (customization rows; commit 811a915c on
`agent/walkthrough2-customization`) and WP-03 (employee record, login and users
rows; commit 270757ba on `agent/walkthrough2-employee-record`), both merged into
`agent/walkthrough2-integration`. Browser verification pending in WP-07/WP-08
(QA-EMPLOYEE-007 for the record rows, QA-SETTINGS-021 to QA-SETTINGS-026 for the
customization rows).

**Employee record and users (WP-03).**

| Ref | Change |
|---|---|
| H4 | Employee entity status field is Employment Status with no sub status; the popover labels the row with the field's display name; Owner renders as a name (email only when there is no name). |
| H7 | The More menu closes on Escape (focus returns to More), on an outside pointer, and when focus moves outside, which is what opening a dialog does. |
| H9 | Provision System Access and Send Invitation Now are removed from detail and edit (kept on create). |
| H10 | Section columns: three only from `xl`, two from `md` (`form-layout-grid.ts`). |
| C4 | The Assign panel is portalled above the record action bar; checkboxes are named; ISO timestamps are formatted as date-time; an "Assigned." success toast appears. |

**Customization (WP-01).**

| Ref | Change |
|---|---|
| C7 | Logical name derived from the display name and shown read-only; create dialogs say Create / Creating…; success toast; the user lands on the new module. |
| C8 | Human-readable field-type labels (also in the Fields list); Reference target only for Reference fields; Maximum length only for length types; both comboboxes named; errors on their field. |
| C11 | Lifecycle and package come from the module's and fields' own components (BUG-3495). |
| C12 | Module detail and tab headers use the display name; redundant table columns removed and minimum widths reduced (modules 980→860px, fields 1060→760px, components 1040→820px, Publish Center 1180→900px). |
| C13 | Form and view designer saves show a success toast. |
| C14 | View logical name derived; the Employee-column JSON examples removed. |
| C17 | Publish Center shows names without UUIDs and a plain "Change" column; package detail "Layer action" became "Change". |

**Not done here.** C13 drag-to-add is [[ITEM-0186]]. H9's CNIC field and form
selector, and C4's Global Administrator description (`rbac-matrix.ts`, a
single-writer file), were outside both work packages and are [[ITEM-0196]]. The
exact place the walkthrough saw "QaAsset" in a header was not reproducible from
code; the browser pass confirms it.

Regression coverage: REG-502, REG-503 (record rows); the customization rows are
covered by REG-482, REG-484, REG-485 and REG-487.

## QA Retest

**PARTIAL.** This item's individual rows were not each re-checked in a browser
beyond the coverage the related scenarios above already give it (S1–S17 in the
local QA run
`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
and the corresponding production checks recorded on BUG-3491 through BUG-3501
and ITEM-0179 through ITEM-0182). No dedicated QA-EMPLOYEE-007 pass was run
against the full row list in this item. CI runs 34732185363, 34732682935 and
34732697734 passed on f865ac5e (the merged tree).

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — done in TASK-0031 WP-01 and WP-03; unit-tested; browser verification pending. Remaining rows filed as ITEM-0186 and ITEM-0196.
- 2026-09-13 — QA retest: PARTIAL — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]]
- Implementation — [[EXECPLAN-0045-customization-end-to-end-for-permission-holders]], [[EXECPLAN-0047-employee-record-walkthrough-two-remediation]]

<!-- GRAPH:END -->
