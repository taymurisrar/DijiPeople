---
ID: BUG-1550
aliases: [BUG-1550]
Title: Lead record shows two different owners on the same screen
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [leads]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-292
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1550 — Lead record shows two different owners on the same screen

> **Architect triage, 2026-08-27 — `DEFER`.** Ownership display, on a screen with little live data. Cheap, not urgent.


## Summary

A lead record displays two different owners at once. The record header shows
`Test User` while the body shows `Not set`. One of the two is wrong and the
screen gives the operator no way to tell which.

## Expected Behavior

A record shows one owner, consistently, wherever the owner appears on the
screen.

## Actual Behavior

The header renders `Test User`. The body renders `Not set`. Both are on the
lead detail screen at the same time, for the same record.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Leads and select a lead.
3. Compare the owner shown in the record header with the owner shown in the
   record body.

## Evidence

Observed on production, 2026-08-26, on the lead detail screen. Header and body
were captured showing `Test User` and `Not set` respectively for the same
record.

## Root Cause

Not established. The two surfaces plausibly read different fields — an assigned
owner versus a created-by actor, or a resolved lookup versus a raw id — but
which, and which one is authoritative, has not been confirmed.

## Impact

Ownership drives assignment and follow-up on leads. An operator cannot trust
either value, and a lead that appears owned in one place and unowned in another
may be worked twice or not at all.

Low volume today because the leads pipeline holds little real data, but the
defect is in the shared record header, so it may affect more than leads.

## Affected Areas

- `apps/admin` — the record header and the runtime record body
- `services/api/src/modules/leads`

## Proposed Resolution

Determine which field each surface reads and which one is the owner of record.
Make both read the same field. If the header is deliberately showing a different
concept — created-by, say — it should be labelled as that rather than as owner.

## Acceptance Criteria

- Header and body show the same owner for the same record.
- An unowned lead shows the same unowned state in both places.
- If two distinct concepts are shown, each carries its own label.

## Regression Coverage

None yet. Needs a test asserting header and body owner agree for owned and
unowned records. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]]. The picker-side
ambiguity in [[BUG-1553]] concerns the same owner field.

## Resolution

Partially fixed 2026-08-28 on `agent/open-bug-sweep`, and **the divergence was
not reproduced** — which is worth stating plainly rather than implying a
diagnosis.

What this record asks first is which field each surface reads. Both read
`assignedToUserId`. The header names the relation explicitly through
`OWNER_FIELD_CANDIDATES` (`displayValueField: "assignedToUser"`); the body
derived it by stripping the `Id` suffix, arriving at the same name. And
`readRelationLabel` already composes `firstName` + `lastName` and falls back to
`email`, which is exactly the shape the leads repository selects — so from the
source, both surfaces should resolve the same label.

So the cause is somewhere the source does not show: a payload difference between
the two fetches, most likely. Rather than guess at a fix, the body field now
names the relation explicitly, the same way the header does. That removes the
one structural difference between them — two routes to the same place, only one
of which stated where it was going — so they can no longer answer differently
even if the payloads differ.

**If a lead still shows two owners, that is new information** and the payload is
where to look, not the registry.

## QA Retest

Not retested in a browser, and this one needs it more than most — the fix is
reasoned from the source and the defect was observed in a browser.

Open the lead this record was raised against. If the header and the body now
agree, the structural difference was the cause. If they still disagree, capture
both fetches: the record payload and whatever the header is rendering from. That
comparison is the thing this closure could not do.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: both surfaces now name the same relation explicitly. The divergence itself was NOT reproduced from source. REG-292.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[leads]]
- Regression — REG-292 (see the regression register)

<!-- GRAPH:END -->
