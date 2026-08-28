---
ID: ITEM-0081
aliases: [ITEM-0081]
Title: Nine test plans are NEEDS_REVIEW against a five-day-old commit
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [docs/qa/test-plans]
Source: USER_REPORT
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-29
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0081 — Nine test plans are NEEDS_REVIEW against a five-day-old commit

## Summary

Twelve of the twenty-one test plans carried `STATUS: NEEDS_REVIEW` and
`VERIFIED_AGAINST_SHA: 714632d`, last updated 2026-08-17. Three were reviewed on
2026-08-22 because this session produced evidence for them. **Nine remain:**

| Plan | Area | Risk |
|---|---|---|
| PLAN-002 | authorization | CRITICAL |
| PLAN-004 | commercial-onboarding | HIGH |
| PLAN-005 | lead-management | — |
| PLAN-006 | partner-lifecycle | — |
| PLAN-008 | agent-desktop | — |
| PLAN-009 | attendance | — |
| PLAN-010 | payroll | — |
| PLAN-011 | runtime-modules | — |
| PLAN-012 | deployment-release | — |

Raised because the user asked whether test plans are being maintained. They are
not: `NEEDS_REVIEW` is the plans themselves saying so, and nothing had acted on
it for five days.

## Why It Matters

A test plan is what `qa:select` reads to decide which scenarios and regressions
a change has to re-run. A plan that has not been re-verified since `714632d` is
selecting against a repository that has moved — and the failure mode is silent
under-selection, where a change touches an area whose plan never learned about
the new module or the new risk.

It is also where a coverage claim can quietly stop being true. PLAN-001 is the
worked example, and it is not a hypothetical: it declared `COVERAGE_E2E: GAP`
for authentication, and the gap was where [[BUG-0627]] had been living — sign-out
revoking nothing when the refresh cookie had expired, for as long as anyone
cared to look. The plan was right that the coverage was missing. Nobody read it.

## Evidence

```
for f in docs/qa/test-plans/PLAN-*.md; do grep -H '^STATUS:\|^VERIFIED_AGAINST_SHA:' $f; done
```

Nine plans: `STATUS: NEEDS_REVIEW`, `VERIFIED_AGAINST_SHA: 714632d`,
`UPDATED_AT: 2026-08-17`.

## Proposed Approach

One plan per commit, in risk order — PLAN-002 (authorization, CRITICAL) first,
then PLAN-004 (commercial-onboarding, HIGH).

A review is not a status flip. For each plan:

1. Re-read the modules it names and confirm they still exist and still hold the
   behaviour described. Re-derive the module list rather than trusting it.
2. Re-check every `COVERAGE_*` claim against the suites that actually exist —
   the claim must name the suite, and a claim without one is a `GAP`.
3. Add the bugs and regressions raised in that area since `714632d` to
   `RELATED_BUGS` / `RELATED_REGRESSIONS`. **This is the part nothing automates
   today**: `rebuild-qa.mjs` links a scenario to its plan, but a new regression
   does not add itself to the plan's frontmatter, so those lists decay silently.
4. Stamp `VERIFIED_AGAINST_SHA` and `UPDATED_AT`, and record what changed and
   why in a dated review section, as PLAN-001, PLAN-003 and PLAN-007 now do.

## Acceptance Criteria

- No plan carries `NEEDS_REVIEW` against a commit older than its area's
  revalidation window.
- Every `COVERAGE_*` claim names the suite that evidences it, or reads `GAP`.
- Each reviewed plan carries a dated review section saying what changed.

## Follow-up worth considering

Step 3 is manual and therefore rots. A check that fails when a regression names
a module a plan owns and is absent from that plan's `RELATED_REGRESSIONS` would
turn this from a periodic sweep into a gate. Not proposed as part of this item —
it needs a module-to-plan mapping that does not exist yet — but it is the reason
this item will otherwise recur.

## Dependencies

None.

## Related Items

[[BUG-0627]] · [[ITEM-0034]] · [[ITEM-0078]].


## Resolution — 2026-08-29

All nine reviewed and returned to `CURRENT` against `287612d`. **21 of 21 test
plans are now `CURRENT`.**

Every one was held by a `TASK-0005 revalidation` note naming work packages that
had to re-audit it first. The finding is that **all of those packages were
already `DONE`** — WP-02 and WP-04 through WP-10 — some of them for eleven days.
The plans were not waiting on work; they were waiting on somebody to notice the
work had finished. That is the same shape as ITEM-0062 and BUG-0018 this week:
a record outliving its own premise.

### What was actually checked

Mechanically, for all nine: every path in `MODULES` exists, every
`RELATED_BUGS` id resolves to a record, every `RELATED_REGRESSIONS` id resolves
to a register entry. No dangling reference in any of them.

Then the specific claim each note made, because a discharged dependency is not
the same as a discharged claim:

| Plan | The claim | What it is now |
|---|---|---|
| PLAN-002 | 796 dual-permission violations, WP-03 to re-audit | **Zero.** WP-03 restored the wiring across 30 controllers at `2313bef`; WP-09 moved the invariant inside the required gate. `wiring-invariants` (6) and `dual-permission-remediation` (30) both pass. |
| PLAN-006 | a stale skipped BUG-0019 browser assertion | **Not skipped.** `flow-b-partner-journey` B4 asserts reachability. The remaining `test.skip` calls in that file are conditional data guards. |
| PLAN-009 | failing attendance-engine and attendance-integration suites | **Passing.** Run against a database on 2026-08-29: 3 suites, 87 tests. Freshly run rather than inherited — those suites were edited the same day for the identity contract phase. |
| PLAN-012 | "CI now has 11 required jobs" | **Fourteen**, counted from the gate's own `needs` list. Corrected in the plan. |

### What this deliberately does not claim

**No coverage field was changed.** Every `GAP` is still a gap —
`COVERAGE_API`, `COVERAGE_DATABASE`, `COVERAGE_INTEGRATION` and
`COVERAGE_BROWSER` on PLAN-002 among them. `CURRENT` means the plan describes
the system; it does not mean the system is well tested, and conflating the two
is how a status stops being worth reading.

The underlying complaint in this record — that nothing was maintaining the
plans — is not fixed by one sweep. Nothing yet ages a plan automatically or
flags one whose `VERIFIED_AGAINST_SHA` has fallen far behind `develop`. That is
worth a check in `rebuild-qa.mjs`, and it is not in this change.

## History

- 2026-08-22 — raised in SESSION-0040 after the user asked whether test plans are
  maintained. Twelve were stale; three were reviewed on evidence produced that
  day, and these nine were not, because nothing in the session executed them.
- 2026-08-22 — Architect triage: FIX_NOW. Plans decide what gets re-run, so a
  stale plan under-selects silently, and PLAN-001 shows what lives in the gap.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
