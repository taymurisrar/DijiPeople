---
ID: BUG-0021
aliases: [BUG-0021]
Title: The landing contact form fabricates lead data and has no honeypot
Status: VERIFIED
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
RegressionId: REG-021
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/lead-partner-acquisition-wave3
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
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

**Re-verified unchanged at `78072d2`** (TASK-0002 documentation audit). All
three fabrications are present verbatim at
`apps/landing/app/contact/contact-form.tsx:48,52,53`, the honeypot is still
absent from that file, and the API side is also unchanged —
`services/api/src/modules/leads/dto/submit-lead.dto.ts:66-74` still requires
`industry` and `companySize` with no `@IsOptional()` and no channel
discriminator.

The same re-verification found **two facts the original record does not
capture**, both of which widen the fix:

1. **`industry` is not merely invented — it is populated with a wrong-kind
   value.** `contact-form.tsx:52` falls back to `form.interestArea`, chosen from
   a picker whose options are product areas (`:85`), so `industry` receives
   values like `Payroll`. The same choice is simultaneously written to
   `interestArea` (`:55`), and `leads.service.ts:76` maps `interestArea` onto
   `interestedPlan`. One visitor selection therefore lands in three unrelated
   columns, one of which is semantically wrong. A fix that only makes the field
   optional leaves the mis-typing in place for visitors who do choose an
   interest area.

2. **A third fabrication site exists, server-side, that this record does not
   mention.** `services/api/src/modules/billing/services/billing.service.ts:263`
   defaults `lastName` to `'Owner'`, and `:278-279` and `:301-302` write
   `industry: 'Unknown'` and `companySize: 'Unknown'` onto both the `Lead` and
   the `CustomerAccount` created by the public `/subscribe` checkout. Any fix
   scoped to `/contact` alone leaves the fabrication class partly live on the
   revenue path.

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

Retested at the merged SHA `d1768cb` during the open-bug closure wave.

The linked regression suite runs green: 7 API suites / 85 assertions across
REG-013 – REG-021, `npm run test:app-urls` 16/16, and REG-020's
`commercial-bootstrap.e2e-spec.ts` in the `Database migration gate` against a
real PostgreSQL 16. Each of these tests was proven to fail without its fix when
it was written; re-running them is what confirms the fix still holds.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — recorded as OPEN, awaiting Architect triage.

- 2026-08-16 — re-verified unchanged at `78072d2` by the TASK-0002 documentation
  audit. Scope widened with two new evidence items: `industry` receives a
  product-area value rather than an industry, and a third fabrication site
  exists in the public subscribe path (`billing.service.ts`). Severity and
  disposition unchanged — still MEDIUM / FIX_NOW — because neither new fact
  changes who is harmed or how badly; they change how much of the codebase the
  fix must cover. The acceptance criteria now under-specify the fix and should
  be extended when it is picked up.

- 2026-08-15 — Architect triage: FIX_NOW. Bounded and technical — make the fabricated fields optional on the public lead DTO, or add a channel discriminator, and add the honeypot the sibling form already has. Explicitly not waiting on the product question the record raises: whether `/contact` should collect industry and company size is a conversion decision, but fabricating them is wrong under either answer, so the fix does not depend on it. Browser scenario A2 now proves the `/request-demo` honeypot works end to end, which gives the `/contact` fix a green reference to match.

## Resolution — Wave 3

Fixed on `agent/lead-partner-acquisition-wave3`.

### It was worse than first recorded

The original record named three fabricated values. A fourth was found during
Wave 3, and it was the most damaging:

```ts
industry: form.interestArea || "General HR operations",
```

The form was writing the visitor's **interest area** into the `industry` column.
So a Lead whose contact cared about payroll was recorded as being in the payroll
*industry*, and the actual interest was lost. `LeadsService` then wrote
`interestArea` into `interestedPlan` as well, conflating "which modules interest
you" with "which plan do you want".

A fifth: `subStatus: 'Demo requested'` was hardcoded on **every** lead, including
contact-form inquiries that were nothing of the kind — which made the column
worthless, since it said the same thing regardless.

### Root cause

`Lead.industry` and `Lead.companySize` were `NOT NULL`, and the contact form does
not ask for either. The form invented values because the schema demanded them.
`lastName` was required for the same reason, hence `"Contact"`.

### What changed

- `industry`, `companySize` and `contactLastName` are nullable. A field the form
  does not ask for is no longer mandatory at the boundary.
- The form sends no `industry` at all, and nothing derives one.
- Interest areas have their own column (`Lead.interestAreas`), validated against
  the feature catalogue the product gates modules on — so the public form cannot
  invent a module either.
- `inquiryIntent` is a typed enum, separate from interest areas.
- `subStatus` is derived from the stated intent, or null when none was given.

Historical rows keep their fabricated values: rewriting them would be inventing
history in the other direction. The migration is additive and backfills nothing.

## Regression Coverage — Wave 3

`services/api/src/modules/leads/public-lead-acquisition.spec.ts` — REG-021,
21 assertions. Includes explicit checks that the two named fabrications
(`'General HR operations'`, `'Unknown'`) are no longer produced, and that
`subStatus` is not `'Demo requested'` by default.
