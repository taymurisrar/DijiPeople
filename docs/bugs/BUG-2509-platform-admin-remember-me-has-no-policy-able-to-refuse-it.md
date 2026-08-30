---
ID: BUG-2509
aliases: [BUG-2509]
Title: Platform admin remember-me has no policy able to refuse it
Status: PRODUCT_DECISION
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: ade1fea7
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2509 — Platform admin remember-me has no policy able to refuse it

## Summary

On the tenant path, `rememberMe` is a request the tenant may refuse: the flag is
ANDed with `allowRememberMe` from that tenant's security settings before it can
extend anything. On the platform admin path there is no equivalent. A boolean in
the request body extends a platform super-admin's access token to 30 minutes and
their refresh token to 30 days, and nothing server-side can decline.

The most privileged identity in the system therefore has the weakest control over
its own session lifetime.

## Expected Behavior

Session lifetime for a platform administrator is at least as governable as it is
for an ordinary tenant employee — and arguably should be shorter, not longer, and
should certainly not be decided by the client.

## Actual Behavior

- `buildAuthResponse` (tenant): `rememberMe = rememberMe && authPolicy.allowRememberMe`,
  then the refresh TTL becomes the tenant's `refreshTokenExpiryDays`.
- `buildPlatformAuthResponse` (platform): no policy is read at all. `rememberMe`
  selects `JWT_ACCESS_TTL_REMEMBER_ME` (default `30m`) and
  `JWT_REFRESH_TTL_REMEMBER_ME` (default `30d`) directly.

There is also no absolute session lifetime or idle timeout on the platform path;
the tenant response carries `absoluteSessionLifetimeDays` and
`idleTimeoutMinutes`, and the platform one does not.

## Reproduction

1. `POST /api/admin/auth/login` with header `X-DijiPeople-App: admin` and
   `"rememberMe": true`.
2. Read `tokens.refreshTokenExpiresIn` in the response: `30d`.
3. There is no platform setting, environment gate or role condition that changes
   this to anything shorter for a given administrator.

## Evidence

- `services/api/src/modules/auth/auth.service.ts:2000-2002` — the tenant policy
  gate.
- `services/api/src/modules/auth/auth.service.ts:2118-2152` —
  `buildPlatformAuthResponse`, with no policy lookup.
- `services/api/src/modules/auth/auth-session-lifecycle.spec.ts` — "the platform
  path honours remember-me with no policy able to refuse it", which pins the
  current behaviour so that changing it is deliberate.

## Root Cause

The tenant auth policy is stored per tenant in `TenantSetting`, and the platform
identity has no tenant. Rather than the platform path getting its own policy
store, it got none — the asymmetry follows from where the settings live, not from
a decision that platform sessions should be ungoverned.

## Impact

A stolen or shared platform-admin refresh token stays valid for up to thirty days
unless it is explicitly revoked. Combined with BUG-2506 — where sign-out failed to
revoke it at all — that window was neither bounded nor closable by the operator.
BUG-2506 is now fixed, which reduces this from an active exposure to a policy gap,
which is why it is filed MEDIUM rather than HIGH.

No evidence of exploitation: this is a design observation from reading the two
code paths side by side, not an incident.

## Affected Areas

- `POST /api/admin/auth/login`
- `buildPlatformAuthResponse`, `services/api/src/modules/auth/auth.service.ts`
- the platform admin console session

## Proposed Resolution

A product decision, not a bug fix. The options, in the order this record
recommends them:

1. Give the platform path its own policy — a platform setting equivalent to
   `allowRememberMe`, with an absolute lifetime and an idle timeout to match the
   tenant path. Most consistent, most work.
2. Refuse remember-me on the platform path outright, so a platform session is
   always a short one. Smallest change; a deliberate reduction in convenience for
   the smallest and most privileged population.
3. Keep it, and record it as accepted risk with a stated rationale.

What should not happen is that it stays undecided while a test merely pins it.

## Acceptance Criteria

Whichever option is chosen: the platform session lifetime is decided by something
server-side, the decision is written down, and the pinning test is updated to
assert the decision rather than the accident.

## Regression Coverage

Behaviour is pinned by
`services/api/src/modules/auth/auth-session-lifecycle.spec.ts`. That test asserts
what happens today and is explicitly marked as pinning rather than endorsing; it
must be revised as part of any fix.

## Dependencies

None.

## Related Items

- [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]

## Resolution

Not fixed. Raised for a product decision by the repository owner.

## QA Retest

Pending the decision.

## History

- 2026-08-30 - created during the SESSION-0084 auth validation, from reading the
  tenant and platform token builders against each other.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
