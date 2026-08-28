---
ID: BUG-1553
aliases: [BUG-1553]
Title: Owner and template pickers list indistinguishable duplicate entries
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [contracts, platform-users]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-293
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1553 — Owner and template pickers list indistinguishable duplicate entries

> **Architect triage, 2026-08-27 — `DEFER`.** Picker disambiguation. The template half is masked by BUG-1541 anyway.


## Summary

Selection pickers offer entries the user cannot tell apart. The owner picker
lists "Taimur Israr" twice — two genuinely different accounts — and the contract
template list shows "DijiPeople SaaS Subscription & Services Agreement" twice.
In both cases the operator must guess, and a wrong guess assigns the wrong owner
or generates from the wrong template.

## Expected Behavior

Every entry in a picker is distinguishable. Where two records share a display
name, the entry carries something that separates them — an email, a version, a
status, or a date.

## Actual Behavior

Two entries render identically. Nothing in the list distinguishes them.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open any record with an owner and open the owner picker. Observe two
   identical "Taimur Israr" entries.
3. Create an agreement from a customer and open the template picker. Observe two
   identical "DijiPeople SaaS Subscription & Services Agreement" entries.

## Evidence

Observed on production, 2026-08-26, in both pickers. The two owner entries
correspond to different accounts; the duplicate template entries were not
investigated far enough to establish whether they are two versions of one
template or two separate template records.

## Root Cause

Not established. The owner case is a display problem — the accounts are
genuinely distinct and only the label collides. The template case may be the
same, or may be genuine duplicate template records, and those need different
fixes.

## Impact

An operator assigning an owner picks one of two at random. For templates, the
consequence is generating a customer-facing agreement from the wrong document —
which matters more, though it is currently masked by [[BUG-1541]], since no
generated agreement is usable regardless of which template produced it.

## Affected Areas

- `apps/admin` — runtime lookup rendering and the owner picker
- `services/api/src/modules/platform-users`
- `services/api/src/modules/contracts` — template selection
- `services/api/src/modules/legal` — versioned templates

## Proposed Resolution

For the owner picker, add a disambiguator to the rendered label — email is the
obvious one and is already available on the record.

For templates, first establish whether the duplication is display-level or two
real records. If two records, the question is which should be selectable, and
that is a product decision rather than a rendering fix.

## Acceptance Criteria

- No two entries in the owner picker render identically.
- Two accounts sharing a display name are distinguished by email.
- The template picker either shows one entry per selectable template, or
  distinguishes versions explicitly.

## Regression Coverage

None yet. Needs a test asserting picker entries are unique by rendered label
given two records with the same display name. Requires a `REG-nnn` entry once
written.

## Dependencies

None, though the template half may need a product decision.

## Related Items

Related to [[BUG-1550]], which concerns the same owner field on the record
screen. The template half sits alongside [[BUG-1541]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

`normalizeRuntimeLookupPayload` now appends a disambiguator where two options
share a label — email first, then code, key, contract number, version, status,
and a shortened id last. The owner picker's duplicate names carry their emails,
which this record identified as the obvious answer and which was on the record
all along, never reached.

Only where a label actually repeats. Showing everyone's email beside their name
would clutter every picker in the console to solve a problem that exists in two
of them, and a disambiguator is only informative when there is something to
disambiguate from.

**The template question is still open**, as this record frames it. Making the
two entries distinguishable does not answer whether both *should* be selectable
— that is the product decision the record identifies, and it is unchanged.

## QA Retest

Not retested in a browser. `lookup-disambiguation.spec.ts` covers the duplicate
and unique cases, the fallback ordering, and that a disambiguator identical to
the label is skipped rather than rendered as an empty parenthesis.

Worth checking a picker with all-distinct entries too: it should be visually
unchanged. A fix that clutters every dropdown to solve two of them would be a
poor trade.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: duplicate lookup labels gain a disambiguator, unique ones are untouched. REG-293.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-293 (see the regression register)

<!-- GRAPH:END -->
