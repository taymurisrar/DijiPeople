---
ID: BUG-0081
aliases: [BUG-0081]
Title: Three apps claimed a forwarded-headers invariant test that did not exist
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: TEST_GAP
Source: SECURITY_REVIEW
DetectedDate: 2026-08-19
DetectedInSha: ffda0e3
AffectedModules: [landing, web, admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-071
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0008 WP-07
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
ResolvedAt: 2026-08-19
---

# BUG-0081 — Three apps claimed a forwarded-headers invariant test that did not exist

## Summary

`apps/landing/lib/forwarded-headers.ts`, and its byte-identical copies in
`apps/web` and `apps/admin`, each carried this sentence:

> `forwarded-headers.invariant.test.ts` fails the build if a handler forgets —
> the guarantee is mechanical rather than a convention, because this same
> convention has already been broken three times.

No file of that name existed anywhere in the repository. The guarantee was a
sentence. Found during the WP-07 security review of TASK-0008, while checking
whether the new public onboarding route handlers were covered by it.

## Expected Behavior

Every route handler under `app/api/` that fetches the API directly spreads
`forwardedClientHeaders(request)` into its outbound headers, and a test fails
the build when one does not — as the comment describes.

## Actual Behavior

Nothing enforced it. The rule held only for as long as each author remembered
it, and the comment actively discouraged anybody from checking, since a reviewer
who reads "the guarantee is mechanical" reasonably stops looking.

## Reproduction

```bash
find apps -name "forwarded-headers.invariant.test.ts" -not -path "*/.next/*"
# no output

grep -rn "forwarded-headers.invariant" apps --include=*.ts | grep -v "/.next/"
# only the three comments that name it
```

## Evidence

- `apps/landing/lib/forwarded-headers.ts:11-14` — the claim (also
  `apps/web/lib/forwarded-headers.ts` and `apps/admin/lib/forwarded-headers.ts`,
  identical wording).
- No matching file under any workspace at `ffda0e3`.
- The convention itself was **intact** at detection time: an audit of every
  handler naming `getApiBaseUrl` found 9 in landing, 10 in web and 5 in admin,
  and all 24 forwarded correctly.

That last point is why this is filed rather than shrugged off. A missing check
that would currently find nothing is the most dangerous kind — there is no
failing test to force the issue, and the only signal is a comment asserting the
opposite of the truth.

## Root Cause

The comment was written alongside the convention, describing the check its
author intended to add. The check was never added and nothing noticed, because
nothing validates that a named test file exists. It is the same class of defect
as an assertion that a file merely *mentions* a behaviour, which keeps passing
after the behaviour is deleted.

## Impact

Latent rather than live. The behaviour being protected is real: route handlers
run server-side, so without a forwarded address the API attributes every visitor
on earth to one egress IP, and `PublicRateLimitGuard` keys on exactly that. One
forgetful handler turns the public rate limit from a per-visitor budget into a
switch any single visitor can flip for everyone — which is [[BUG-0032]], already
filed once after it happened.

TASK-0008 added five new public route handlers to `apps/landing`, so the window
for the fourth occurrence was open at the moment this was found.

## Affected Areas

`apps/landing/app/api/**`, `apps/web/app/api/**`, `apps/admin/app/api/**`, and
`common/guards/public-rate-limit.guard.ts` / `common/security/client-ip.ts` on
the receiving side.

## Proposed Resolution

Write the check the comment promised, one per app so each fails its own CI job,
and correct the comment to name the file that now exists.

Scope it to handlers that name `getApiBaseUrl`, which is what marks a direct
fetch to the API.

## Acceptance Criteria

- A `*.spec.ts` in each of the three apps asserts that every direct-API route
  handler spreads `forwardedClientHeaders(request)`.
- Each asserts a **minimum handler count** first, so the check cannot pass by
  finding nothing — the inert-guard failure mode this bug is an instance of.
- Removing the forwarding from any one handler fails that app's test run.
- The comment in each `forwarded-headers.ts` names a file that exists.

## Regression Coverage

`apps/landing/lib/forwarded-headers.invariant.spec.ts` and its `apps/web` and
`apps/admin` counterparts.

Mutation-verified rather than merely observed passing: deleting
`...forwardedClientHeaders(request)` from `apps/landing/app/api/leads/route.ts`
turns the run from 10 passed to 1 failed / 9 passed, naming the offending file.
The handler was restored immediately and `git diff` confirms no residue.

## Dependencies

None.

## Related Items

- [[BUG-0032]] — the incident this convention was written after.
- [[BUG-0075]] — the other finding on the same public surface: a rate-limit
  guard applied where it did not help.
- [[TASK-0008]] — the parent this was found under.

## Resolution

Fixed on `agent/self-service-onboarding-provisioning`:

- Added `forwarded-headers.invariant.spec.ts` to `apps/landing/lib`,
  `apps/web/lib` and `apps/admin/lib`. Each walks its own `app/api` tree, selects
  the handlers that call the API directly, asserts a minimum count, then asserts
  the forwarding on each.
- Corrected the comment in all three `forwarded-headers.ts` files to name the
  file that now exists, and recorded there that the previous sentence had been
  doing a check's work with no check behind it.

Counts asserted: landing ≥ 9, web ≥ 10, admin ≥ 5.

The check is deliberately scoped to direct-API handlers. Handlers reaching the
API through `server-api.ts` are not covered, and not because they are safe —
`server-api.ts` does not forward the address either. They are excluded because
the endpoints they reach are authenticated and `PublicRateLimitGuard` does not
run on them, so the gap there is attribution rather than a bypass. Widening the
check to cover it without first deciding what should carry the address would
only fail the build with nothing to do about it. That is noted in each spec's
header comment rather than left for a reader to rediscover.

## QA Retest

Covered by the WP-08 QA campaign under TASK-0008. Current evidence: landing 97
tests, web 408, admin 101 — all pass, plus the mutation check above.

## History

- 2026-08-19 — found during the TASK-0008 WP-07 security review at `ffda0e3`.
- 2026-08-19 — disposition `FIX_NOW`; fixed in the same work package.
