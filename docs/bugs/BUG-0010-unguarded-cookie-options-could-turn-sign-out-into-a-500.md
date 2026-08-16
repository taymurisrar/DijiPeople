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
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RegressionId: REG-032
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
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

**None.** Requires production-like environment validation to trigger. Tracked
with the live-environment testing gap, [[ITEM-0002]].

## Dependencies

[[ITEM-0002]].

## Related Items

Found in the same audit as [[BUG-0008-session-expired-sign-in-again-returned-405]]
and [[BUG-0009-session-revocation-depended-on-the-refresh-cookie]].
Module [[platform-admin|Platform Admin]]. Pattern-adjacent to
[[divergent-duplicate-guard]] — two apps, one guard, present in only one.

## Resolution

Fixed 2026-08-15 on branch `agent/admin-session-expired-logout-auth`.

## QA Retest

**Outstanding** — needs a production-like environment. Not reachable from the
flow the QA run covered, and strictly more defensive than the code it replaced.

## History

- 2026-08-15 — found by auditing the BUG-0008 path; fixed in the same change.
- 2026-08-15 — imported into the durable bug system as `FIXED`, awaiting retest.
