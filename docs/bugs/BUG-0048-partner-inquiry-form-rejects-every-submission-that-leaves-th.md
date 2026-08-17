---
ID: BUG-0048
aliases: [BUG-0048]
Title: Partner inquiry form rejects every submission that leaves the optional website blank
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 3fe3292
AffectedModules: [apps/landing, services/api/src/modules/partner-experience]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-framework-remediation-3fe3292.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0048 — Partner inquiry form rejects every submission that leaves the optional website blank

## Summary

`Company website` is an optional field on the public partner inquiry form. An
untouched HTML input submits `""` through `FormData`, and the landing form sent
that straight through as `website: ""`.

`@IsOptional()` in class-validator skips validation only for `null` and
`undefined` — **not** for an empty string. So `@IsUrl()` ran against `""`, the
API answered `400 website must be a URL address`, and the submission was
discarded.

**Every visitor who left the optional website field blank was unable to submit a
partner inquiry at all.**

## Expected Behavior

Leaving an optional field blank submits the form.

## Actual Behavior

The form shows `website must be a URL address` and no `PartnerInquiry` row is
created. The field that fails is one the visitor was never asked to fill.

## Reproduction

1. Open `/partners` on the landing site.
2. Fill every field **except** `Company website`.
3. Accept the privacy acknowledgement and submit.

Observed: the status region reads `website must be a URL address`;
`select count(*) from "PartnerInquiry"` is unchanged.

## Evidence

Playwright, run `32004225633`, `flow-b-partner-journey.spec.ts` B1 — the page
snapshot captured at failure:

```yaml
- status [ref=e62]: website must be a URL address
```

followed by:

```
Error: the browser submission created exactly one PartnerInquiry
Expected: 1
Received: 0
```

Both the form and the DTO, before the fix:

```ts
// apps/landing/app/partners/partner-inquiry-form.tsx
website: data.get("website"),          // "" for an untouched input

// services/api/.../partner-experience.dto.ts
@IsOptional()
@IsUrl({ require_protocol: false, require_tld: true })
website?: string;                      // @IsOptional() does not skip ""
```

The same form already handled this correctly one line above, for
`partnershipModel`: `data.get("partnershipModel") || undefined`. Only `website`
broke, because it is the only optional field with a *format* validator — the
others are `@IsString()`, which `""` satisfies.

## Root Cause

A mismatch between what an HTML form submits for an untouched field (`""`) and
what `@IsOptional()` treats as absent (`null`/`undefined`). Neither side is wrong
in isolation; the contract between them was never stated.

## Impact

The public partner acquisition surface — the top of the partner funnel. Anyone
who did not happen to type a website URL could not become a partner lead, and
the failure was a validation message about a field they had deliberately skipped.

How long this was live is not established: the browser suite is the only
coverage this journey has ever had, and it has been failing for a different
reason (selector drift) since it was written, so it never reached this
assertion.

## Affected Areas

`apps/landing/app/partners/partner-inquiry-form.tsx`,
`services/api/src/modules/partner-experience/dto/partner-experience.dto.ts`.

## Proposed Resolution

Fixed at both ends, deliberately:

- **The form** no longer sends `""` for an optional field —
  `data.get("website") || undefined`, matching what `partnershipModel` already
  did.
- **The DTO** normalises `""` to `undefined` before validation. The endpoint is
  `@Public()`, so the browser form is not its only possible caller, and a public
  API that 400s on an empty optional string is brittle for every client.

## Acceptance Criteria

- Submitting with `Company website` blank creates exactly one `PartnerInquiry`.
- Submitting with a valid URL still stores it.
- Submitting with a malformed URL is still rejected — the fix must not turn the
  validator off.

## Regression Coverage

`e2e/tests/flow-b-partner-journey.spec.ts` B1, which now asserts the **success**
shape rather than the presence of a status region. That change is part of the
fix: the form renders success and failure into the same `role="status"` element,
so the old assertion passed while the API was rejecting every submission, and
the failure surfaced three statements later as a row count with no explanation.

## Dependencies

None.

## Related Items

[[QA-PARTNER-004]] · [[QA-PARTNER-003]] · [[BUG-0021]] — the other defect found
on this same public surface, where the frontend fabricated required fields to
satisfy a DTO rather than fixing the contract.

## Resolution

Both fixes on `agent/framework-remediation`. `npm run typecheck` 8/8; the seven
partner suites pass (39 tests).

## QA Retest

Browser E2E on the integrated SHA — B1 must reach `Reference` in the status
region, and B2–B4 must run rather than being skipped by B1's failure.

## History

- 2026-08-17 — found by the browser suite after its selector drift was repaired.
  The drift had masked this: B1 timed out filling the form and never submitted,
  so the API rejection had never been observed.
