---
ID: ITEM-0007
aliases: [ITEM-0007]
Title: Product decision — should duplicate website leads be deduplicated?
Type: PRODUCT_DECISION
Status: PRODUCT_DECISION
Priority: P3
Severity: LOW
AffectedModules: [services/api/src/modules/leads, apps/landing]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0021
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0007 — Product decision: should duplicate website leads be deduplicated?

## Summary

Two identical public website lead submissions produce two `Lead` rows. The
partner inquiry endpoint on the same public surface **does** deduplicate, via a
`submissionHash`. The asymmetry is undocumented.

## Why It Matters

For a demo-request form, accepting a repeat submission is arguably correct — a
visitor who submits twice may genuinely want a second conversation, and
suppressing it silently loses intent. But sales sees two records for one company
and cannot tell whether that is signal or noise, and nobody wrote down which
behaviour was intended.

The cost of leaving it undecided is not the duplicates. It is that the next
person to touch either endpoint will make the two consistent in whichever
direction they happen to prefer.

## Evidence

`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`:

- A1.10 — two identical website submissions produce two `Lead` rows.
- B1.05 — a duplicate partner inquiry is deduplicated by `submissionHash`,
  returning one row and the same reference.
- Recorded explicitly under "Observations that are not defects".

## Proposed Approach

**Decide, then implement.** Three defensible answers:

1. Keep as is, and document the asymmetry so it stops being re-litigated.
2. Deduplicate within a window (say 24 hours) on email + company, returning the
   existing reference — the partner behaviour.
3. Accept the row but flag it as a probable duplicate for sales to merge.

Not an engineering decision. Recorded here so the question survives.

## Acceptance Criteria

The chosen behaviour is documented in the Leads module knowledge, and the two
public lead surfaces are either consistent or explicitly and deliberately
different.

## Dependencies

None. Interacts with [[BUG-0021]], which concerns what the contact form *puts in*
a lead row — decide both together and the public lead surface stops being two
half-designed forms.

## Related Items

[[BUG-0021]] · [[BUG-0013]] · module [[leads|Leads]] · requirement [[requirement-lead-conversion|Lead Conversion]].

## History

- 2026-08-15 — imported from the commercial onboarding E2E observations.
