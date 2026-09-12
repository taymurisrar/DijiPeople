---
ID: ITEM-0183
aliases: [ITEM-0183]
Title: Remove agent-added explanatory helper text from tenant screens
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
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

# ITEM-0183 — Remove agent-added explanatory helper text from tenant screens

## Summary

Across tenant screens, agents have added sentences that explain a control
instead of making the control clear. Some describe implementation ("updates
ownership through the Module data adapter"). Some were copied from an unrelated
screen ("apply the same allocation, billing, and approval details"). Some
contradict the data on the page. Several render twice. On 2026-09-13 the owner
said plainly: "I don't want this extra info ever". This item removes every
occurrence found in the second demo walkthrough. Where a control is unclear
without its sentence, the fix is the control or its label.

## Why It Matters

The text makes screens longer and harder to scan, and it breaks layout: the
login row wraps. It leaks internal architecture to tenants, and where it has
drifted from behaviour it misleads. The owner has said this copy is never
wanted, so each surviving occurrence repeats a mistake that has already been
flagged.

## Evidence

Observed on the demo tenant (`https://dijipeople-demo.ws.dijipeople.com`) as
the workspace owner, deployed build at `df0f84f1`, then located in the source.

**Why "help text twice".** `FieldShell` in
`apps/web/app/components/ui/form-control.tsx` renders `hint` twice: once as an
"i" tooltip beside the label (`:102-121`) and again as the feedback line under
the control (`feedback = error || warning || hint`, `:72`, rendered from
`:133`). Every `hint=` on a text, select or textarea field therefore appears on
screen twice.

| # | Screen | Text (abridged) | Source |
|---|---|---|---|
| 1 | Login | "Keeps you signed in on this browser across restarts. It does not change how long an individual sign-in stays active." — also pushes "Activate account" into a two-line wrap | `apps/web/app/(public)/login/login-form.tsx:311` |
| 2 | Employee record, work sites | widget description, sky-blue info box "This employee has no explicit work site assignment…", empty state "…except their inherited primary site" | `apps/web/app/components/runtime/module-widget-renderer.tsx:2378-2384`, `:2517-2523` |
| 3 | Reporting hierarchy dialog | "An avatar and a name at rest. Hover, focus, or tap a person for their role, department, work email, and work site." | `apps/web/app/components/runtime/module-widget-renderer.tsx:2775` |
| 4 | Email providers | "Configuration JSON is sent to the backend as-is. Masked secrets remain protected by backend merge rules." | `apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx:293` |
| 5 | Record Assign dialog | "This action updates ownership through the Module data adapter and respects module permissions." | `apps/web/app/components/runtime/module-assign-dialog.tsx:95` |
| 6 | Assign Roles side panel | "Select one or more employees and apply the same allocation, billing, and approval details in one go." — copied from project allocation, hardcoded for every assignment subgrid | `apps/web/app/components/runtime/module-related-subgrid.tsx:1036-1037` |
| 7 | Create custom module | "Use camelCase. This logical name is immutable after creation." (rendered twice); "Inactive modules stay registered but should be hidden from customization-driven UI."; subtitle "Create a tenant-scoped metadata module." | `apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx:374`, `:382`, `:423` |
| 8 | Add field | "Generated from display name with publisher prefix … This logical name is locked after creation." (rendered twice) | `apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx:524` |
| 9 | Choice list / relationship / action bar dialogs | "Generated with publisher prefix …_. Locked after creation." (rendered twice) | `apps/web/app/(authenticated)/settings/customization/_components/metadata-components-management.tsx:494` |
| 10 | Create view | "Use camelCase. This key cannot be changed after creation." (twice); Filters JSON / Sorting JSON hints with Employee-column examples (`employmentStatus`, `hireDate`) shown on non-employee modules | `apps/web/app/(authenticated)/settings/customization/_components/views-management.tsx:578`, `:649`, `:656` |
| 11 | Sidebar Designer | page description "Reorder, rename, hide, and audience-gate the main sidebar … a newly released module still appears without being added here." plus paragraphs in the designer | `apps/web/app/(authenticated)/settings/customization/sidebar/page.tsx:23`, `apps/web/app/(authenticated)/settings/customization/_components/sidebar-designer.tsx` |
| 12 | Notification rules | three panel paragraphs explaining the two-gate model | `apps/web/app/(authenticated)/settings/notifications/_components/notification-rules-manager.tsx:177`, `:205`, `:286` |

Occurrences 2 and 12 are also removed by the redesigns in [[ITEM-0179]] and
[[ITEM-0180]]. They are listed here so that whichever lands first removes them,
and none survives because each item assumed the other would do it.

## Proposed Approach

Contained; no ExecPlan needed.

1. Delete each text in the table. Do not replace it with other text.
2. Where a control is unclear without it, change the control. Give the login
   checkbox's row a layout that does not wrap. Derive the logical or system
   name instead of asking for camelCase ([[ITEM-0184]] covers the customization
   dialogs). Remove the JSON filter/sort textareas in favour of the view
   designer's own controls, or at minimum drop the Employee examples. Give the
   Assign Roles panel no subtitle, or have the assignment spec supply its own
   title only.
3. Fix `FieldShell` so a hint cannot render twice. Choose one presentation;
   given the owner's instruction, the tooltip is the one to question.
4. Sweep the remaining `hint=` and panel `description=` usages in the same
   screens for the same pattern, and remove any that explain rather than label.
   Report what was removed.

**Preventing re-addition — proposed, not mandated.** Options for the Architect
to choose from:
- a unit test asserting the specific strings above are absent;
- a lint rule or spec that flags new `hint=` string literals longer than a
  short threshold in `apps/web`;
- a review-checklist line in `apps/web/AGENTS.md`.

The first is cheapest and has no false positives. The second catches new cases
but will need an allowlist.

## Acceptance Criteria

- None of the twelve texts listed in Evidence is rendered on the demo tenant.
- On the login page at 1440px and 400px, "Remember me" and "Activate account"
  sit on one line, each without wrapping.
- No field anywhere renders the same hint text twice.
- The Assign Roles panel does not mention allocation, billing or approval.
- No text was added anywhere as a remedy. The diff removes copy or changes
  controls and labels only.
- The chosen re-addition guard, if any, fails when one of the removed strings
  is restored (mutation-tested).

## Dependencies

None blocking. Coordinate with [[ITEM-0179]] (work-site texts) and
[[ITEM-0180]] (rules paragraphs) so the same lines are not edited in two
branches.

## Related Items

[[ITEM-0179]] Work Sites tab. [[ITEM-0180]] notification events page.
[[ITEM-0184]] customization and record usability. [[ITEM-0164]] hierarchy
viewer, whose dialog carries occurrence 3.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
