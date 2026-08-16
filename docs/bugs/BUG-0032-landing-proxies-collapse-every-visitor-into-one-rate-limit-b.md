---
ID: BUG-0032
aliases: [BUG-0032]
Title: Landing proxies collapse every visitor into one rate limit bucket
Status: FIXED
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
ResolvedAt: 2026-08-16
---

# BUG-0032 — Landing proxies collapse every visitor into one rate limit bucket

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

[[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]] — fixing that one
first yields a throttle keyed on the wrong identity. Sequence them together.
[[ITEM-0013]] — the mechanical coverage check.

## Related Items

[[BUG-0013-public-lead-endpoint-had-no-rate-limiting]] (the fix this defect
silently undermines) · [[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]] ·
[[ITEM-0013]] · [[landing-architecture]] · [[leads]] · [[partners]] ·
[[contracts-and-agreements]].

## Resolution

Fixed, and the scope was larger than this record found.

The record identified the four `apps/landing` route handlers. Auditing for the
fix showed the same defect in `apps/web` and `apps/admin`: **20 route handlers
across all three apps** proxy to the API, and none forwarded the visitor's
address. `apps/web/app/api/auth/login/route.ts` mattered most — once
BUG-0031's guard was applied to `POST /auth/login`, an unfixed proxy would have
throttled *every tenant login in the product* to 20 attempts per 10 minutes
globally. The two bugs had to land together; fixing BUG-0031 alone would have
caused an outage.

Both halves live in one module, `packages/config/client-ip.js`, so the sender
and the reader cannot drift apart:

- `buildForwardedClientHeaders` — what a proxy sends. Re-exported per app as
  `apps/<app>/lib/forwarded-headers.ts` and spread into all 20 outbound
  `fetch()` calls.
- `readForwardedForClientIp` — how the chain is read: the **first** entry, the
  client-closest, so no intermediate hop can present itself as the client.
- `services/api/src/common/security/client-ip.ts` — `resolveClientIp`, which
  the guard now keys on instead of `request.ip`.

The forwarded chain is believed only where a proxy we control is actually in
front. That decision already existed in
`modules/tenant-domains/request-hostname.ts`; it was **extracted** to
`common/security/proxy-trust.ts` and is now shared rather than duplicated, so a
deployment cannot end up trusting the forwarded host while ignoring the
forwarded address.

`scripts/check-proxy-forwards-client-ip.mjs` makes it mechanical, and is a
required CI step. It counts `...forwardedClientHeaders(` call sites against
`fetch(` call sites per file: an earlier version tested only that the
identifier appeared, which the *import line alone* satisfied — deleting the
spread from the one place it mattered left the check green.

## QA Retest

- `npm run check:proxy-forwards-client-ip` — 20 handlers pass. Verified to
  fail: removing the spread from `apps/landing/app/api/leads/route.ts` reports
  `(0/1 fetches covered)` and exits 1.
- `services/api/src/common/security/client-ip.spec.ts` — 6 assertions covering
  both directions: the visitor is read behind a trusted proxy, two visitors on
  one egress address get separate identities, a forged chain is ignored when no
  proxy is trusted, and the identity is never empty.
- `public-rate-limit.guard.spec.ts` gained the behavioural assertion: one
  visitor exhausting the limit no longer affects another behind the same proxy.
  Confirmed to fail against the old `request.ip` key.
- Typecheck passes for `web`, `admin`, `landing` and `api`; app suites
  391 / 71 / 49 tests all passing.

## History

- 2026-08-16 — found during the `apps/landing` deep documentation audit
  (TASK-0002), verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. The obvious fix — forward
  `X-Forwarded-For` — creates a spoofable limit if applied without deciding the
  trust boundary, so this may not be taken as a one-line change.
- 2026-08-16 — fixed. Scope widened from 4 landing handlers to 20 across three
  apps after finding that the tenant login proxy shared the defect and would have
  turned BUG-0031's fix into a global login outage.
