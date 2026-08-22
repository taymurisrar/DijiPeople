---
ID: BUG-0010
aliases: [BUG-0010]
Title: Unguarded cookie options could turn admin sign-out into a 500
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: cbc2db8
AffectedModules: [apps/admin/app/api/auth/logout]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RegressionId: REG-032
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-20
ResolvedAt: 2026-08-17
---

# BUG-0010 — Unguarded cookie options could turn admin sign-out into a 500

## Summary

`getClearAuthCookieOptions()` was called unguarded in the admin logout route. It
throws on a rejected cookie configuration — for example an `ADMIN_COOKIE_DOMAIN`
set to a domain that does not match the serving host, such as a `.vercel.app`
production host — which would turn sign-out into a 500 for every operator.

## Expected Behavior

A misconfigured cookie domain degrades to clearing what can be cleared. Sign-out
is the one flow that must never depend on configuration being right.

## Actual Behavior

The throw propagated and the route would answer 500.

## Reproduction

`NODE_ENV=production` plus a rejected cookie domain. **Not reproduced** in the QA
run — the fix is the defensive fallback already shipping in `apps/web`.

## Evidence

[QA run 2026-08-14-admin-session-expired-logout-cbc2db8](../qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md),
finding B3.

## Root Cause

A configuration validator invoked on a failure path with no fallback. The
equivalent guard already existed in `apps/web`, so this was **divergence between
the two apps**, not a missing idea.

## Impact

Latent. Would strand every admin operator on any deployment with a mismatched
cookie domain — the same class of user-visible outcome as
[[BUG-0008-session-expired-sign-in-again-returned-405]].

## Affected Areas

`apps/admin/app/api/auth/logout`.

## Proposed Resolution

Applied: guard the call and fall back, mirroring `apps/web`.

## Acceptance Criteria

With a rejected cookie configuration, sign-out still returns a redirect and
clears every cookie it can.

## Regression Coverage

`REG-032` and partial scenario `QA-AUTH-002` name
`apps/admin/app/api/auth/logout/logout-route.spec.ts`. The static test confirms
the safe wrapper/fallback source shape but does not execute the route under a
rejected cookie configuration.

## Dependencies

Executed route proof remains [[ITEM-0002]].

## Related Items

Found in the same audit as [[BUG-0008-session-expired-sign-in-again-returned-405]]
and [[BUG-0009-session-revocation-depended-on-the-refresh-cookie]].
Module [[platform-admin|Platform Admin]]. Pattern-adjacent to
[[divergent-duplicate-guard]] — two apps, one guard, present in only one.

## Resolution

Fixed 2026-08-15 on branch `agent/admin-session-expired-logout-auth`.

## QA Retest

**Pass, executed 2026-08-20** — by invoking the handlers, which is what this
section previously said had never been done.

`apps/admin/app/api/auth/logout/logout-route.behaviour.spec.ts` — 7 tests,
passing, alongside the 10 existing source-shape assertions.

Mutation-proven rather than assumed. Restoring each defect in
`apps/admin/app/api/auth/logout/route.ts` fails the tests that name it:

| Defect restored | Result |
|---|---|
| `if (!refreshToken) return;` — revocation guarded on the refresh cookie alone | 2 tests fail |
| the rejected-config throw allowed to escape `getSafeClearAuthCookieOptions` | 3 tests fail |

The rejected cookie configuration is now driven through both handlers. POST
returns 200 and GET redirects to `/login` carrying its `reason` — the
acceptance criterion this record was reopened for. Both still expire the
cookies via the fallback, so a sign-out under a broken configuration is a real
sign-out and not merely a non-error.

Paired with its negative: when the configuration is **accepted**, the real
options are used and the cookie is still marked `Secure`. Without that pair, a
route that always took the fallback would pass every failure test while silently
dropping the cookie domain and secure flag in production.

## History

- 2026-08-20 — `Status` corrected `VERIFIED` -> `FIXED`, by the body-content
  check added for [[ITEM-0071]] on its first run. The record had claimed
  `VERIFIED` since 2026-08-17 while its own QA Retest section said the
  acceptance criterion had never been executed.

  The 2026-08-17 entry below is how it got there, and it is worth reading twice:
  a reconciliation pass took the `VERIFIED` status as given and *normalised the
  disposition to match it*. That made the frontmatter self-consistent and the
  record self-contradictory, because nothing in the pass read the prose. The
  fix is real and `REG-032` is real; what was never true is that QA verified it.

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-17 — independent WP-02 review found that the named regression only
  inspects source and never executes the rejection path. Corrected to `FIXED` /
  `FIX_NOW` pending [[ITEM-0002]].

- 2026-08-15 — found by auditing the BUG-0008 path; fixed in the same change.
- 2026-08-15 — imported into the durable bug system as `FIXED`, awaiting retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-032 (see the regression register)

<!-- GRAPH:END -->
