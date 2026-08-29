---
ID: BUG-1964
aliases: [BUG-1964]
Title: Record headings and dialog titles are singularised by stripping a trailing s
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-339
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-1964 — Record headings and dialog titles are singularised by stripping a trailing s

## Summary

The tenant product derives a record heading from the module's plural label by
removing the final "s". "Leave Policies" becomes "LEAVE POLICIE". Related-list
dialogs do not singularise at all, so a dialog that creates one record is titled
"New Entitlements".

## Expected Behavior

A record page and a create dialog name one record in correct English: "Leave
Policy", "New Leave Policy", "New Entitlement", "New Assignment". Labels come
from the module metadata, where a singular form can be declared alongside the
plural, rather than from a string operation on the plural.

## Actual Behavior

Observed on the leave policy record page and its related-list dialogs:

- Page header: **"LEAVE POLICIE"**
- Create action: **"New Leave Policie"**
- Related-list dialogs: **"New Entitlements"**, **"New Assignments"** — plural for
  a single record.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Settings > People Configuration > Leave Configuration > Leave Policies.
2. Read the "New Leave Policie" action, then open a policy record and read the
   page header "LEAVE POLICIE".
3. On the record, open the Entitlements tab > New, and the Assignments tab > New:
   the dialogs are titled "New Entitlements" and "New Assignments".

## Evidence

The rendered strings above, on the production tenant workspace. Two distinct
mechanisms are visible in them: the record header applies a naive singulariser
(trailing "s" removed, so "Policies" becomes "Policie"), and the related-list
dialog applies none at all.

No file:line evidence was collected — the singulariser and the dialog title
source were not located during the run.

## Root Cause

Not established, though the header's output is characteristic of removing the
last character when the label ends in "s".

## Impact

Cosmetic, and highly visible: this is the demo tenant used with customers, and the
defect lands on a page header in capitals. Rated LOW — nothing is blocked or
mis-stated beyond the label itself.

## Affected Areas

`apps/web` runtime record header and related-list dialog titles — any module
whose plural label does not singularise by dropping an "s", which is most of
them.

## Proposed Resolution

Declare singular and plural labels in the module metadata and read them, rather
than deriving one from the other. Where a derived form is unavoidable, the
related-list dialog should use the same source as the record header so the two
cannot disagree.

## Acceptance Criteria

- The leave policy record header reads "Leave Policy" and the create action "New
  Leave Policy".
- Related-list dialogs read "New Entitlement" and "New Assignment".
- A module whose plural is irregular renders correctly without a special case in
  the component.

## Regression Coverage

None yet.

## Dependencies

None identified.

## Related Items

BUG-1558 (admin list copy uses incorrect pluralisation and articles) is the
Platform Admin equivalent, VERIFIED, and concerned counts and articles. This is
the tenant product deriving a singular from a plural — a different app and a
different mechanism.

## Resolution

Fixed. A shared `singularize()` helper (`apps/web/lib/text/inflection.ts`)
replaces the naive `label.replace(/s$/, "")` and the "no singularisation at
all" path that produced "New Entitlements" / "New Assignments":

- `app/(authenticated)/settings/_lib/settings-adapter-registry.ts:432` —
  `singularLabel: input.singular ?? singularize(input.label)`. A declared
  `singular` always wins (dozens of settings modules already declare one);
  `singularize` is only the floor under labels that never declared one. "Leave
  Policies" (line 2635, no `singular` declared) now resolves to "Leave Policy"
  through this path.
- `apps/web/lib/runtime/modules/standard-module-runtime.ts:289` —
  `displayName: spec.singularLabel ?? spec.label` feeds the record header for
  every runtime module spec.
- `app/(authenticated)/settings/_components/settings-runtime-pages.tsx:249` —
  `spec.singularLabel ?? item.label` for the settings record-page title.
- `app/components/runtime/module-related-subgrid.tsx:1468` and `:1557` — both
  related-list quick-create dialog titles (`buildGenericQuickCreate` and
  `buildSubgridQuickCreate`) now read `New ${singularize(...)}` instead of
  the raw plural, so "New Entitlements" and "New Assignments" are no longer
  possible.

`apps/web/lib/text/inflection.spec.ts` proves the helper itself (irregular
plurals, `-ies`/`-es` endings, words that are already singular). 
`apps/web/lib/text/label-call-sites.spec.ts` proves the call sites — that the
old inline expressions are gone and the fixed ones are present — which is the
half of this defect that a correct helper alone does not cover.

This code was implemented in an earlier session on this branch (commit
`3c146231`, "wip(webux): checkpoint") before that session was interrupted; this
pass verified the fix against the record's acceptance criteria, mutation-tested
it (see Regression Coverage below), and closes the record.

## Regression Coverage

REG-339. Mutation-tested: reverting
`settings-adapter-registry.ts:432` to
`input.singular ?? input.label.replace(/s$/, "")` fails 2 of the 6 assertions
in `label-call-sites.spec.ts` (the two that check for the `singularize` call
and the absence of the old literal); reverted immediately after confirming.

## QA Retest

Not retested live against a running tenant — verified from source and by the
specs above. `singularize("Leave Policies")` returns `"Leave Policy"` (asserted
in `inflection.spec.ts`), and the two related-list dialog titles read
`New ${singularize(subgrid.title)}` / `New ${singularize(entityLabel)}`
(asserted in `label-call-sites.spec.ts`), matching every item in Acceptance
Criteria.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — trivial, and highly visible on a tenant used for demonstrations.
- 2026-08-30 — verified the fix already implemented on this branch (`3c146231`), mutation-tested it, and closed as FIXED under REG-339.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
