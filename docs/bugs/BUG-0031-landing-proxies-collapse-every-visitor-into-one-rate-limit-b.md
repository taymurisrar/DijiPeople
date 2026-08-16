---
ID: BUG-0031
aliases: [BUG-0031]
Title: Landing proxies collapse every visitor into one rate limit bucket
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [apps/landing, services/api/src/common]
OwnerAgent: backend-api
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt:
---

# BUG-0031 — Landing proxies collapse every visitor into one rate limit bucket

## Summary

`PublicRateLimitGuard` throttles per client IP. **None of the four
`apps/landing` route handlers forwards the visitor's IP**, so the API sees the
landing server's egress address for all traffic and every visitor on earth
shares a single 20-writes-per-10-minutes bucket.

This breaks the control in both directions at once: it is trivially possible for
one visitor to deny the form to everybody, and the guard cannot tell an attacker
from a customer on any landing-proxied path.

## Expected Behavior

A public rate limit distinguishes one client from another. Exceeding it affects
only the client that exceeded it.

## Actual Behavior

The guard keys on `` `${request.ip}:${request.path}` ``. Behind the landing
proxy, `request.ip` is constant. Therefore:

- **Availability** — 20 lead submissions from any single visitor return HTTP 429
  to *every* visitor for up to ten minutes. On `/request-demo` and `/contact`
  that is the primary conversion path of the public site.
- **Control ineffectiveness** — on landing-proxied paths the limit is not an
  abuse control at all; it is a global cap on legitimate traffic.

The guard works as designed only for callers reaching the API directly.

## Reproduction

1. Run the API and `apps/landing`.
2. From browser A, submit `/request-demo` 20 times inside ten minutes.
3. From browser B **on a different machine and a different public IP**, submit
   `/request-demo` once.
4. Browser B receives `429 PUBLIC_RATE_LIMITED` despite never having submitted.

Step 3 is the whole finding — a second, innocent client is throttled by the
first client's activity.

## Evidence

- `services/api/src/common/guards/public-rate-limit.guard.ts:16` — the key is
  `request.ip` + `request.path`; `:18-20` — 20 non-GET / 120 GET per 10 minutes.
- `apps/landing/app/api/leads/route.ts:9-12` — forwards only `Content-Type` and
  `X-Request-Id`. No `X-Forwarded-For`, no `X-Real-IP`.
- `apps/landing/app/api/partners/` (optional catch-all route) — same omission.
- `apps/landing/app/api/signatures/` (optional catch-all route) — same omission.
- `apps/landing/app/api/public/subscribe/route.ts:8-13` — forwards only the
  three country headers.
- `services/api/src/main.ts:130-145` — `trust proxy` resolves `request.ip` from
  the hosting proxy hop, which is the landing server, not the visitor.

Note the country headers **are** forwarded by the subscribe proxy, so the
pattern of forwarding a client-derived header is already established there. The
IP simply was not included.

## Root Cause

Established: the landing route handlers were written as minimal forwarders and
never treated the client identity as part of the payload the API depends on. The
API's guard silently accepts whatever `request.ip` resolves to and has no way to
detect that it is being handed a proxy's address rather than a client's.

Neither half fails loudly, which is why this survived a rate-limit fix
(BUG-0013) that was specifically about this guard.

## Impact

Reachable in production by anyone.

Availability impact is the more likely one in practice, and it is
customer-facing: the public site's lead forms return 429 to genuine prospects
because of unrelated traffic. There is no alert on this — a 429 from the guard
is not distinguishable in monitoring from a successful throttle.

Severity `HIGH`, not `CRITICAL`: no data is exposed and no authorization is
bypassed.

## Affected Areas

All four `apps/landing/app/api/**/route.ts` handlers ·
`services/api/src/common/guards/public-rate-limit.guard.ts` · every
`/public/*` endpoint reached through landing — leads, partner inquiries, partner
onboarding and activation, contract signing.

## Proposed Resolution

Needs an ExecPlan, because the naive fix is a security regression.

Forwarding `X-Forwarded-For` from the proxy is necessary but **not sufficient**:
a header the API trusts unconditionally lets a direct caller spoof any client
identity and evade the limit entirely. The plan must state which hop is trusted
and how, consistently with the existing `TRUST_PROXY_HEADERS` handling in
`main.ts`.

Also to be settled in the same plan: the guard's state is a module-level `Map`,
so limits multiply by API instance count and reset on deploy. That is acceptable
for a coarse abuse control and not for a fairness control; which of the two this
is meant to be should be decided rather than inherited.

## Acceptance Criteria

- Two clients with different public IPs have independent limits through the
  landing proxy.
- A client-supplied `X-Forwarded-For` reaching the API directly cannot alter the
  key used for that request.
- The chosen trust boundary is stated in `docs/architecture/` and matches
  `TRUST_PROXY_HEADERS`.

## Regression Coverage

**None today.** The regression must assert that two distinct forwarded client
identities receive independent counters, and that an untrusted hop cannot set
them.

## Dependencies

[[BUG-0030-public-subscribe-endpoint-has-no-rate-limiting]] — fixing that one
first yields a throttle keyed on the wrong identity. Sequence them together.
[[ITEM-0013]] — the mechanical coverage check.

## Related Items

[[BUG-0013-public-lead-endpoint-had-no-rate-limiting]] (the fix this defect
silently undermines) · [[BUG-0030-public-subscribe-endpoint-has-no-rate-limiting]] ·
[[ITEM-0013]] · [[landing-architecture]] · [[leads]] · [[partners]] ·
[[contracts-and-agreements]].

## Resolution

Not resolved. Found by an audit; no product code changed by that task.

## QA Retest

Not applicable — not yet fixed. Verified by reading all four proxies, the guard
and the proxy-trust handling in `main.ts` at `78072d2`. The two-client
reproduction was **not executed** — it needs two distinct public IPs, which the
audit environment did not have. The code path is unambiguous, but the
observation is by inspection, not by execution.

## History

- 2026-08-16 — found during the `apps/landing` deep documentation audit
  (TASK-0002), verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. The obvious fix — forward
  `X-Forwarded-For` — creates a spoofable limit if applied without deciding the
  trust boundary, so this may not be taken as a one-line change.
</content>
