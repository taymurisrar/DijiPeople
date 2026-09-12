---
ID: ITEM-0184
aliases: [ITEM-0184]
Title: Employee record and customization usability defects found in the second demo walkthrough
Type: UX
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [apps/web, employees, customization, users]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
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

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
