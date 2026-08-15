---
ID: BUG-0021
aliases: [BUG-0021]
Title: The landing contact form fabricates lead data and has no honeypot
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/landing, services/api/src/modules/leads]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:
---

# BUG-0021 — The landing contact form fabricates lead data and has no honeypot

## Summary

The landing `/contact` form fills required lead fields with invented values —
`industry: 'General HR operations'`, `companySize: 'Unknown'`, and
`lastName: 'Contact'` when the visitor gives a one-word name — and, unlike
`/request-demo`, carries no honeypot field.

## Expected Behavior

A lead record contains what the visitor actually said. Fields the form does not
collect are absent, not invented. Every public form has the same anti-spam
treatment.

## Actual Behavior

Every `/contact` lead arrives with three fabricated attributes that are
indistinguishable from real ones downstream, and the endpoint has no honeypot.

## Reproduction

Submit `/contact` with a one-word name and inspect the resulting `Lead` row.

## Evidence

QA run, UI / UX section, rated MEDIUM. The contrast is with `/request-demo`,
which does carry a honeypot — verified working by scenario A1.08 (honeypot
submissions are silently dropped with no row and no id leaked).

## Root Cause

Required DTO fields on the shared lead endpoint, satisfied by the form rather
than by making them optional for this channel. The honeypot was added to one
form and not the other.

## Impact

Sales sees segmentation data — industry and company size — that nobody supplied,
on an unknown fraction of inbound leads. `lastName: 'Contact'` reaches outbound
email templates. Missing honeypot leaves one of two public lead forms without the
protection the other has; note that the rate-limit gap on the same endpoint was
a separate defect, now fixed
([[BUG-0013-public-lead-endpoint-had-no-rate-limiting]]).

## Affected Areas

`apps/landing` contact form; `services/api/src/modules/leads` public DTO.

## Proposed Resolution

Make the fabricated fields optional on the public lead DTO — or add a channel
discriminator so `/contact` and `/request-demo` may require different fields —
and add the honeypot. **Do not** solve it by making the contact form ask for
industry and company size; that is a conversion decision, not an engineering
one, and belongs with the Product owner.

## Acceptance Criteria

A `/contact` submission produces a `Lead` whose `industry`, `companySize` and
`lastName` are either what the visitor supplied or empty — never invented. A
honeypot submission is silently dropped, as `/request-demo` already is.

## Regression Coverage

**None.** Testable without a browser at the DTO/service level.

## Dependencies

None. A product opinion is welcome on whether `/contact` should collect the
extra fields, but the fabrication should stop either way.

## Related Items

Modules [[leads|Leads]]. Requirement [[requirement-lead-conversion|Lead Conversion]].
Sibling public-surface defect: [[BUG-0013-public-lead-endpoint-had-no-rate-limiting]].
The asymmetry between the two public lead forms is also why
[[ITEM-0007]] exists.

## Resolution

Not resolved.

## QA Retest

Not applicable.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — recorded as OPEN, awaiting Architect triage.

- 2026-08-15 — Architect triage: FIX_NOW. Bounded and technical — make the fabricated fields optional on the public lead DTO, or add a channel discriminator, and add the honeypot the sibling form already has. Explicitly not waiting on the product question the record raises: whether `/contact` should collect industry and company size is a conversion decision, but fabricating them is wrong under either answer, so the fix does not depend on it. Browser scenario A2 now proves the `/request-demo` honeypot works end to end, which gives the `/contact` fix a green reference to match.
