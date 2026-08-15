---
ID: BUG-0009
aliases: [BUG-0009]
Title: Server-side session revocation depended on the refresh cookie surviving
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: cbc2db8
AffectedModules: [apps/admin/app/api/auth/logout, services/api/src/modules/auth]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:
---

# BUG-0009 — Server-side session revocation depended on the refresh cookie surviving

## Summary

The admin logout route only called the API's revocation endpoint when the
refresh cookie was still present. A "sign out" performed after that cookie had
expired cleared the browser but left the platform session live server-side.

## Expected Behavior

Signing out revokes the session on the server, regardless of which cookies the
browser still holds.

## Actual Behavior

With the refresh cookie already gone, the local cookies were cleared and the
`PlatformRefreshToken` row was left unrevoked.

## Reproduction

Sign out with the refresh cookie already expired, then inspect the
`PlatformRefreshToken` row. **Not reproduced** — see QA Retest.

## Evidence

[QA run 2026-08-14-admin-session-expired-logout-cbc2db8](../qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md),
finding B2. `AuthService.logout` reads only `getClientId` and
`extractTokenFromRequest`, and the latter reads cookies and ignores the body.

## Root Cause

The route treated one particular cookie as the precondition for revocation,
rather than forwarding whichever auth cookies exist and letting the API decide.

## Impact

A session the user believes is closed remains usable server-side until natural
expiry. Bounded by token lifetime; no exposure to a third party unless the token
was already stolen — which is exactly the case where sign-out matters most.

## Affected Areas

`apps/admin/app/api/auth/logout`, and the API's `auth` module as the authority
on revocation.

## Proposed Resolution

Applied: forward the `X-DijiPeople-App: admin` header and a Cookie header built
from whichever auth cookies are present, so revocation is attempted whenever any
credential remains.

## Acceptance Criteria

Signing out with an expired refresh cookie still results in a revoked
`PlatformRefreshToken` row.

## Regression Coverage

**None.** Not observable without a live API session — the reason this record is
`FIXED` and not `VERIFIED`. Adding coverage depends on the live-API test
capability tracked as [[ITEM-0002]].

## Dependencies

[[ITEM-0002]] — no isolated live-API session harness exists.

## Related Items

Found while auditing the path of [[BUG-0008-session-expired-sign-in-again-returned-405]],
alongside [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500]].
Module [[platform-admin|Platform Admin]].

## Resolution

Fixed 2026-08-15 on branch `agent/admin-session-expired-logout-auth`, in the same
change as BUG-0008.

## QA Retest

**Outstanding.** The QA run records it as fixed but unverified at runtime,
because the API was not running. The follow-up is named in that run: sign out
with the refresh cookie already expired against a live API and confirm the row
is revoked.

## History

- 2026-08-15 — found by auditing the BUG-0008 path; fixed in the same change.
- 2026-08-15 — imported into the durable bug system as `FIXED`, awaiting retest.
