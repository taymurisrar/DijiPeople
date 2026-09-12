---
ID: ITEM-0166
aliases: [ITEM-0166]
Title: Move data-loss prevention captures off the employee record page into the Agent surface
Type: UX
Status: DONE
Priority: P2
Severity: 
AffectedModules: [apps/web, agent]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: apps/web/lib/runtime/modules/employee-metadata.adapter.ts, apps/web/app/components/runtime/module-widget-renderer.tsx, apps/web/app/(authenticated)/_components/dlp/employee-dlp-captures.tsx
TargetMilestone: 
BlockedBy: 
---

# ITEM-0166 — Move data-loss prevention captures off the employee record page into the Agent surface

## Summary

The employee record page ends with a **Data-loss prevention captures** panel
listing clipboard captures and rule-triggered screenshots recorded by the
desktop agent. The product owner's view is that it does not belong on the
employee form and should sit with the desktop agent feature instead.

That is the right call, and the destination already exists. The employee record
**already has an Agent tab**, and the feature already has two homes of its own.
The panel is the odd one out rather than the only home for this data.

## Why It Matters

An employee record is the HR view of a person: identity, employment, pay,
leave, documents. Surveillance capture is a security-investigation concern with
a different audience, a different legal posture, and — as the panel's own
subtitle says — its own audit requirement, because viewing captured content is
itself audited. Putting it inline on the record means every HR user who opens
anyone's profile is one scroll away from a surveillance surface they have no
reason to be on.

It is also the third thing on this page that is not part of the form, which is
why the page's structure reads as disordered.

## Evidence

- `apps/web/app/(authenticated)/employees/[employeeId]/page.tsx:227-232` —
  `EmployeeDlpCaptures` is mounted as a page-level sibling of the runtime form,
  not as a form section.
- The component's own header comment describes itself as "the investigator's
  contextual view — the same data as the standalone `/dlp-review` page, scoped
  to this employee." It is explicitly a duplicate view by design.
- `apps/web/app/(authenticated)/dlp-review/page.tsx` — the standalone
  investigator page over the same data.
- `apps/web/app/(authenticated)/settings/desktop-agent/` — rule configuration
  and agent settings.
- **The employee record already has an Agent tab.** Read from the live record at
  `cbd9b812`, the tab strip is: Summary, Attendance, Leave History, Timesheets,
  Documents, Compensation, Banking Details, Payslips, Project Allocations,
  Previous Employment, Employee History, Education, **Agent**.
- Heading levels on the same page show the panel is structurally adrift: the
  record title is an `h2`, form sections are `h4`, the work sites panel is an
  `h2`, and this panel is an `h3`.

## Proposed Approach

Contained, no ExecPlan needed. Two options, in order of preference:

1. **Move it into the existing Agent tab**, where the desktop agent's other
   per-employee information already lives. This keeps the investigator's
   employee-scoped view — which is genuinely useful — while taking it off the
   default view of every profile and putting it behind a deliberate click. The
   tab is already there, so this is a relocation rather than new surface.

2. **Replace it with a link** to `/dlp-review?employeeId={id}`, deep-linking the
   standalone investigator page scoped to this employee, and delete the
   embedded panel.

Either way the panel stops being a sibling of the form. Whichever is chosen,
check that the permission gating the surveillance data travels with it: the
question of who may see captures should not be answered differently by the tab
than by `/dlp-review`.

## Acceptance Criteria

- No data-loss prevention panel renders as a sibling of the employee record
  form.
- Employee-scoped captures remain reachable for users permitted to see them,
  from the Agent tab or from a link to the scoped investigator page.
- The permission required to view captures is the same on every surface that
  shows them.
- Viewing captured content is still audited, unchanged.

## Dependencies

None. Should land with [[ITEM-0165]], since both remove page-level panels from
the same record page and the page composition is touched once.

## Related Items

[[ITEM-0165]] the work sites panel on the same page. [[ITEM-0167]] the record
shell conformance work. The DLP capture feature itself was delivered under
TASK-0020 and TASK-0023.

## Resolution

Took option 1 (move into the existing Agent tab). A new section
(`agent-desktop-dlp-captures`) was added to the `agent` tab in
`employee-metadata.adapter.ts`, alongside the existing `agent-desktop`
section, with a `dlp_captures` widget component. `module-widget-renderer.tsx`
dispatches `dlp_captures` directly — the same way `agent_desktop` is
dispatched — to the **existing, unmodified** `EmployeeDlpCaptures` component,
reused rather than duplicated or reimplemented. `employees/[employeeId]/page.tsx`
no longer mounts it as a page-level sibling.

**Post-merge correction:** the component initially stayed at its original
path, `employees/_components/employee-dlp-captures.tsx`, and
`module-widget-renderer.tsx` imported it from there. That broke an
architectural invariant this record did not originally weigh:
`services/api/src/modules/customization/package-layer-runtime.spec.ts`'s
"keeps shared runtime components free of Module-specific names and routes"
asserts that the *shared* widget-rendering file — the generic engine every
module's record page renders through — never imports from a specific
module's own folder, the same way it never hardcodes a module's REST route.
Importing `EmployeeDlpCaptures` from `employees/_components/` gave the
shared file an undeclared dependency on the employees module, growable by
anyone who did the same for a different module next.

Fixed by relocating the component — not copying it — to
`apps/web/app/(authenticated)/_components/dlp/employee-dlp-captures.tsx`,
the same shared, underscore-folder convention `DocumentList` and
`DocumentUploadForm` already use for a widget several record types can host.
`module-widget-renderer.tsx` now imports it from there, and the employee
record's own usage (the only other reference in the app) points at the same
file — there is still exactly one implementation, so the permission answer
this record's Acceptance Criteria require (identical on every surface) still
holds by the same construction as before: same component, same guard, now
just reached from a shared path rather than the employees module's own path.
A DLP component does not live with the employees module for the same
architectural reason `DocumentList` does not — it is runtime-shared
infrastructure, not employees-owned code, even though today it happens to be
mounted only on the employee record.

Because the component itself did not change, the permission answer is
identical by construction on every surface that shows it: the Agent tab, the
old page-level panel, and the standalone `/dlp-review` page all read through
the same `/api/agent/dlp/*` routes, gated server-side on `dlp.review`, and
content reveal (`/api/agent/dlp/clipboard-events/{id}/content`,
`/api/agent/dlp/screenshots/{id}`) is unchanged, so the audit record it writes
on every content read is unchanged. Nothing in this change touches
`dlp.review` gating, the audit call, or the content-reveal endpoints — the
relocation is presentational (which tab mounts the component), not a change
to the guard.

## History

- 2026-09-11 — created at `cbd9b812` from a user report; the existing Agent tab
  and the two existing homes for this feature were confirmed before filing, so
  the work is a relocation rather than a new screen.
- 2026-09-12 — implemented for SESSION-0103. See Resolution.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
