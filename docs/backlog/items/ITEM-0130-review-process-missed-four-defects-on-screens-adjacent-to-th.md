---
ID: ITEM-0130
aliases: [ITEM-0130]
Title: Review process missed four defects on screens adjacent to the change
Type: TEST_GAP
Status: READY
Priority: P1
Severity: 
AffectedModules: [apps/web, .agent]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0130 — Review process missed four defects on screens adjacent to the change

## Summary

Four defects were found by the user in minutes, on screens one click from work
that had just passed CI, a full framework validation, 1,598 web tests and a
post-deploy verification: an entitlement leak in Reports ([[BUG-3007]]), raw
UUIDs in every analytics drill-down ([[BUG-3020]]), a horizontal scrollbar in the
account menu ([[BUG-3021]]), and two explanatory cards nobody reads
([[ITEM-0128]]).

None was subtle. All four are visible on first sight of the screen. The question
this record answers is why a process that ran thousands of assertions found none
of them.

## Why It Matters

The gap is not that a test failed. Every test passed, and the tests were sound
for what they covered. The gap is that **nothing in the process looked at a
screen until the work was already in production**, and when it did look, it
looked only where the change was.

Left unaddressed, the same shape recurs on the next task, because none of the
existing gates is the one that would have caught these.

## Evidence

Four distinct causes, one per defect class.

**1. Verification was scoped to the structure that was changed.** The settings
tree was audited exhaustively — all 87 items, every plan, a coverage spec that
fails on an unattributed page. Reports was not looked at once, despite being the
same class of surface, offering the same capabilities, in the same sidebar. This
is precisely the failure already written up as
[`gate-scoped-to-one-structure`](../../qa/known-bug-patterns/gate-scoped-to-one-structure.md)
— a rule enforced by walking one structure cannot reach a second one — and the
pattern was written *by this task* hours before the user found its next instance.
Writing the lesson down did not cause it to be applied.

**2. The assertions were resolver-level, never rendered.** Coverage compared two
data structures — the attribution map against the built item registry. That
cannot see a UUID in a cell, a scrollbar, or thirteen paragraphs above the fold,
because it never renders anything. There is no React Testing Library in
`apps/web`, so no component test was written and none was proposed.

**3. Nothing outside the diff was in scope.** The account menu is global chrome
touched by no commit in this task. A diff-scoped review never opens it. Neither
does a test suite organised by module.

**4. Data plausibility was never checked, only data correctness.** The
production verification asserted that each plan resolved to the right capability
set — and it did. It did not ask whether the resulting screens looked right. The
same run walked past an attendance surface showing 36% in one tile and 107.917%
for the same metric beside it, and a trend line drawn from two points across
thirty days, because neither is a capability question.

## Proposed Approach

No ExecPlan. Four changes, each aimed at one cause above, in order of value.

**Look at the screen before claiming completion.** For any task changing what a
user sees, open the changed screen *and its immediate neighbours* — the tabs
beside it, the shell chrome around it — before reporting. This task drove a
browser only after merging to production. Doing it before would have found three
of the four.

**Treat a surface class as the unit, not a surface.** When a rule is applied to
one metadata-driven surface, enumerate the others in the same class and state in
the record which were checked and which were not. The settings tree, the module
runtime, the reporting catalog and the command registry are one class.

**Add rendered assertions where the cost is justified.** A cheap first step needs
no new dependency: assert over the serialised accessibility snapshot that no
labelled cell matches a UUID pattern, and that no dropdown container scrolls
horizontally. Both defects here would have failed such a check.

**Ask whether the numbers are plausible, not only whether they are permitted.**
Two figures for one metric on one screen, a percentage with three decimals from
three rows, and a trend line from two points are all findable by looking, and
none is findable by a test that checks entitlement.

## Acceptance Criteria

- A task-completion field records which screens were opened, or states that none
  needed to be.
- A record that applies a cross-cutting rule names the other surfaces in the same
  class and their status.
- A rendered check exists for UUIDs in labelled columns and for horizontal
  overflow in menus.
- The `gate-scoped-to-one-structure` pattern gains this instance, including the
  fact that it failed to prevent its own recurrence.

## Dependencies

None.

## Related Items

- [[BUG-3007]], [[BUG-3020]], [[BUG-3021]], [[ITEM-0128]] — the four defects.
- [[BUG-2958]] — the task whose review missed them.
- [`gate-scoped-to-one-structure`](../../qa/known-bug-patterns/gate-scoped-to-one-structure.md)
  — the pattern that described cause 1 and did not prevent it.
- Modules — [[tenant-application]]

## History

- 2026-09-09 — the user asked why the relevant agents did not catch these
  defects. Raised as a durable record rather than answered only in conversation,
  because the answer is a process change and a conversation is not one.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0095. Not deferred:
  each further task run under the current process is another chance to ship the
  same class of defect.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
