# Record page layout contract

> Written for ITEM-0167. The product owner named the employee main form
> (`apps/web/app/(authenticated)/employees/[employeeId]/page.tsx`) the
> reference layout and asked every other module's record page to look like
> it. Until this document, "look like it" meant "what the employee page
> happens to do" — not something a reviewer could check a new page against.
> This document is that check. See `EXECPLAN-0044` for the migration this
> document was written to drive.

## What a record page is, in this codebase

A **record page** is a route that shows one entity instance in enough depth
to read and act on it — as opposed to a **list page** (many rows, one
screen) or a **dashboard/summary** (aggregated, no single record). If a route
under `app/(authenticated)/**/[id]/` (or an equivalent singular-record route
such as `me/payslips`, which shows the signed-in user's own single record set
without an id segment) answers "here is one thing, what do you want to do
with it," it is a record page and this contract applies to it.

## The shell, and what each part is for

The reference implementation is `ModuleRecordPage`
(`apps/web/app/components/runtime/module-record-page.tsx`), composed from:

| Part | Component | Answers |
|---|---|---|
| Shell / page frame | `ModuleDetailShell` → `ModulePageLayout` | Where is this in the app? Loading/error/access-denied? |
| Status header | `ModuleRecordHeader` | What is this record, who owns it, what state is it in? |
| Action bar | `ModuleCommandBar` | What can I do to this record right now? |
| Tab strip | `ResponsiveRuntimeTabs`, mounted by `RuntimeMetadataFormRenderer` when a form has more than one tab | Which part of this record am I looking at? |
| Section grid | `RuntimeMetadataFormRenderer` | The fields and system widgets themselves. |
| Related lists | `module-related-tabs.tsx` / `module-related-subgrid.tsx` (optional) | What else references this record? |

`StandardModuleRecordPage` is a thin pass-through to the same
`ModuleRecordPage`, and the employee record's own
`EmployeeRuntimeFormWrapper` calls `ModuleRecordPage` directly — so "the
employee record" and "a standard module record page" are the same engine
with different callers, not two implementations that happen to look alike.
That is what this contract requires every other record page to also be true
of.

## MUST

A record page **must**:

1. **Render through `ModuleRecordPage`** (directly, via
   `StandardModuleRecordPage`, or via a bespoke wrapper that calls
   `ModuleRecordPage` itself, the way `EmployeeRuntimeFormWrapper` does) —
   not a hand-rolled page frame, header, or action row.
2. **Show a status header** via `ModuleRecordHeader` — title, and where the
   entity has one, an owner and a status/sub-status.
3. **Put every record-level action in the action bar** (`ModuleCommandBar`),
   never as ad hoc buttons scattered in the page body.
4. **Use the shared tab strip** (`ResponsiveRuntimeTabs`, via
   `RuntimeMetadataFormRenderer`) when the record has more than one logical
   section a user switches between — never a hand-rolled tab control. A
   single-section record correctly has no tab strip at all (see BUG-3378's
   fix: `RuntimeMetadataFormRenderer` only claims `role="tablist"` /
   `role="tabpanel"` semantics when a tab strip is actually mounted).
5. **Declare fields and system widgets through form metadata**
   (`lib/runtime/modules/*-metadata.adapter.ts` or
   `standard-module-specs.ts`), not through page-level components that
   fetch and render record data outside the form. If a record needs a
   surface the metadata form cannot express as a field or a system widget,
   that surface still renders **inside** a form section as a system widget
   (see `employee.workSites`, `dlp_captures` — ITEM-0165, ITEM-0166) — never
   as a sibling of the whole form the way the pre-fix employee page rendered
   `EmployeeWorkSites` and `EmployeeDlpCaptures`.
6. **Descend heading levels properly from the record title**, per the
   existing accessibility rule in `apps/web/AGENTS.md`. A form section renders
   at `h4` under the record title; nothing on a record page should render a
   page-level `h2` or `h3` sibling of the form (this is the concrete defect
   ITEM-0165 and ITEM-0166 fixed on the employee page itself).
7. **Preserve every permission check the bespoke page performed.** Migrating
   to the shared shell must not widen or narrow who can view, edit, or act on
   the record. `@Permissions` / `@RequirePermission` on the backend are the
   authority; the migrated page's command visibility and field editability
   must keep expressing the same rules through the runtime's existing
   mechanisms (`isDisabled`/`disabledReason` on commands, `resolveFieldEditable`,
   `visibilityRules`), not weaker or stronger ones picked for convenience.
8. **Keep loading, error, empty, and access-denied states** — the shell
   provides these (`ModulePageLayout`'s `loading`/`error`/`accessDenied`
   props, `AccessDeniedState`), so a migrated page must wire them, not drop
   them because the shell "probably handles it."
9. **Work at tablet and mobile widths**, per the responsive rule already in
   `apps/web/AGENTS.md` — the shell and `ResponsiveRuntimeTabs` already
   handle the common breakpoints, so a migrated page inherits this for free
   as long as it does not fight the shell with fixed widths.

## MAY vary

A record page **may** legitimately differ from the employee record in:

- **Which commands appear**, and their placement rules (`placement:
  "detail-command-bar"` vs. other command placements) — the command *bar*
  is fixed, its *contents* are per-module.
- **Whether it has a form selector** (Main / Quick form, etc.) — most
  modules have exactly one form and never show the selector.
- **Whether it has related lists**, and which ones.
- **Whether it has more than one tab** — many valid record pages are a
  single section with no tab strip.
- **Bespoke system widgets** for data the generic field/lookup system cannot
  express (a document list, a hierarchy tree, an approval tracker) — as long
  as the widget is declared through the form's metadata and rendered inside
  a section, per MUST #5.
- **A data adapter of its own**, when the standard adapter's nine hardcoded
  `moduleKey` branches cannot serve it (see `apps/web/AGENTS.md`'s note on
  `standard-module-data.adapter.ts` — adding a tenth branch is exactly the
  accretion `ITEM-0036` exists to stop; prefer a dedicated adapter file, the
  employee module's own pattern, over extending the shared one further).

## Documented exceptions

A page may be **bespoke by design** when the runtime genuinely cannot express
what the screen needs to do — not merely because migrating it is more work.
An exception requires a name and a reason, recorded here (or in the ExecPlan
that grants it) rather than left as silent drift:

| Page | Reason | Recorded in |
|---|---|---|
| `payroll/runs/[runId]` | A payroll run is a **process being driven**, not a record being edited — its screen is a wizard-like sequence (calculate → review → lock → post) with per-stage validation gates and a live calculation log, not a field-and-tab record view. Forcing it into `ModuleRecordPage` would either strip that process model or bolt a wizard onto a shell built for CRUD. | `EXECPLAN-0044` |
| `payroll/payslips`, `me/payslips` | A payslip is a **generated, immutable document view** (render a PDF-shaped statement, offer download/export) with no fields to edit and no command bar beyond "export" — closer to a document viewer than a record form. | `EXECPLAN-0044` |
| `attendance/corrections/[id]`, `attendance/exceptions/[id]` | Both are **single-decision approval screens** (approve/reject one flagged event) reached from a queue, not a persistent record a user returns to browse across tabs — `ModuleRecordPage`'s tab strip and form-selector machinery has nothing to attach to here. | `EXECPLAN-0044` |

Every other page named in [[ITEM-0167]]'s Evidence section (`timesheets/[timesheetId]`,
`claims/[claimId]` + `me/claims`, `business-trips/[tripId]` + `me/business-trips`,
`onboarding/[onboardingId]`, `inbox/[notificationId]`,
`recruitment/employee-drafts/[employeeId]`) is a genuine record with no
structural reason to stay bespoke, and is tracked for migration in
`EXECPLAN-0044`'s waves rather than listed here as an exception.

## Conformance check

`apps/web/app/(authenticated)/_components/record-page-shell.conformance.spec.ts`
enumerates every `page.tsx` under a `[id]`-shaped (or documented
single-record) route and asserts it imports `ModuleRecordPage`,
`StandardModuleRecordPage`, or a wrapper already known to call one of them
(`EmployeeRuntimeFormWrapper`) — directly or by re-exporting a component that
does. A route not on that allowlist and not calling one of those components
fails the check. The exceptions table above, plus any page not yet migrated
under `EXECPLAN-0044`, is the check's explicit, named allowlist — adding a
route to the allowlist without a reason is what this document exists to
prevent.

## Related

- [[ITEM-0167]] — the record this document was written to satisfy.
- `EXECPLAN-0044` — the migration plan built on this contract.
- [[BUG-3378]] — the tab-strip accessibility fix this contract's tab-strip
  rule (MUST #4) depends on already being in place.
- [[ITEM-0165]], [[ITEM-0166]] — the employee record's own conformance fixes
  (MUST #5, #6), which made the reference page worth copying.
- `apps/web/AGENTS.md` — the existing reuse-before-you-build and
  responsive/accessibility rules this document extends to the record-page
  level specifically.
