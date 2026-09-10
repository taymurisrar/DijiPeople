---
ID: BUG-3115
aliases: [BUG-3115]
Title: Rate limiter trusts a forged X-Forwarded-For and covers no authenticated endpoint
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: f26357a8
AffectedModules: [services/api/src/common/security/client-ip.ts, services/api/src/common/guards/public-rate-limit.guard.ts, services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-407
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt: 2026-09-11
---

# BUG-3115 — Rate limiter trusts a forged X-Forwarded-For and covers no authenticated endpoint

## Summary

`PublicRateLimitGuard` keyed every public-write budget on `resolveClientIp`,
which unconditionally trusted the *leftmost* entry of `X-Forwarded-For`
whenever any proxy was configured as trusted. The API is directly reachable
(`https://dijipeople.onrender.com`, `api.dijipeople.com`), so that leftmost
entry is exactly the value an external caller supplies. Rotating it bought a
fresh 20-request budget on `login`, `forgot-password`, `activate-account`,
`public/subscribe` and `public/leads` per request, with no botnet required.
Separately, no authenticated endpoint in the product was rate limited at all —
the only guard that existed applies to 13 pre-session handlers.
Audit findings: RATE-01, RATE-03, INF-06 (`docs/engineering/audits/2026-09-10-full-technical-audit/`).

## Expected Behavior

A client-supplied `X-Forwarded-For` prefix must never be able to mint a fresh
rate-limit identity. The address a rate limiter trusts must be the one a real
trusted hop (Cloudflare, then Render — the two real hops in front of this
deployment) itself observed and appended, not whatever an attacker put in
front of it. Authenticated traffic must also have a ceiling, so one signed-in
account cannot saturate the single API instance for every tenant.

## Actual Behavior

`packages/config/client-ip.js:readForwardedForClientIp` returned
`raw.split(',')[0]` unconditionally — the first, attacker-controlled entry —
whenever `resolveClientIp` decided a proxy was trusted at all (a boolean
decision that discarded the configured hop count). `render.yaml` also set
`TRUST_PROXY_HEADERS: "true"` (one hop), undercounting the real
Cloudflare→Render topology (two hops) even had the code used it. Separately,
`grep -rn "APP_GUARD|useGlobalGuards" services/api/src` found no global guard,
so 239+ authenticated handlers ran with no rate limit of any kind.

## Reproduction

1. `POST /api/auth/login` with `X-Forwarded-For: 203.0.113.1` and a wrong
   password 20 times → 21st request returns `429 PUBLIC_RATE_LIMITED`.
2. Repeat with `X-Forwarded-For: 203.0.113.2` (only the header changed, same
   real origin) → the budget resets; unlimited distinct identities are
   available by incrementing this header, defeating the credential-stuffing
   control the guard exists to provide.
3. Authenticate once and issue >120 mutating requests/minute against any
   controller as that one user → no `429` at any point, pre-fix.

## Evidence

- `packages/config/client-ip.js` (pre-fix): `const first = raw.split(",")[0];`
  with no hop-count parameter.
- `services/api/src/common/security/client-ip.ts` (pre-fix):
  `isProxyTrusted(request)` returned a boolean only, discarding the numeric
  hop count `resolveTrustProxySetting` already computes.
- `render.yaml:134-135` (pre-fix): `TRUST_PROXY_HEADERS: "true"` → 1 hop,
  against a real Cloudflare + Render topology (2 hops) — confirmed by
  `CF-RAY` / `Server: cloudflare` response headers on
  `https://dijipeople.onrender.com/api/health` per INF-06.
- `grep -rn "APP_GUARD\|useGlobalGuards" services/api/src` → zero matches
  (RATE-03).

## Root Cause

Two related defects. (1) The client-IP resolver was designed around a single
assumed shape — a first-party Next app relaying an honest chain — and trusted
position 0 unconditionally rather than the position a specific number of real,
trusted hops actually write to, which only coincides with position 0 when
nothing untrusted sits in front. Since the API is directly reachable, that
assumption is false for a large share of its actual traffic. (2) Rate limiting
was added incrementally, per-route, on `PublicRateLimitGuard` alone; nothing
ever asked "what about every other route", so the coverage gap was never a
decision, just an absence.

## Impact

Reachable today, unauthenticated, against a production payroll platform:
unlimited login attempts, unlimited tenant-signup/lead/subscribe submissions,
and a denial-of-service switch against a specific victim IP (forge their
address to exhaust *their* budget). Authenticated: one compromised or
malicious account could saturate the single 0.5-vCPU API instance for every
tenant. HIGH rather than CRITICAL because none of this crosses tenant
boundaries or exposes data directly.

## Affected Areas

`services/api/src/common/security/client-ip.ts`,
`packages/config/client-ip.js`, `services/api/src/common/guards/public-rate-limit.guard.ts`,
`render.yaml` (`TRUST_PROXY_HEADERS`), and — new — `services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts`,
wired globally in `main.ts`/`app.module.ts`.

## Proposed Resolution

1. Make the hop count (not a boolean) flow from `resolveTrustProxySetting`
   through to `readForwardedForClientIp`, which now indexes
   `X-Forwarded-For` from the **right** by that count, and refuses to guess
   (`null` → `'unknown'`) when the chain is too short to contain that many
   genuine hops — never falls back to the leftmost entry.
2. Prefer `cf-connecting-ip` when present: Cloudflare recomputes it from the
   real TCP peer on every request and a client cannot make it lie, unlike
   `X-Forwarded-For`, which Cloudflare only appends to.
3. Set `TRUST_PROXY_HEADERS: "2"` in `render.yaml` to describe the real
   Cloudflare→Render topology.
4. Add `AuthenticatedRateLimitInterceptor`, global via
   `app.useGlobalInterceptors`, keyed on `(userId, read|write)` — 600/min
   reads, 120/min writes — covering every authenticated route without
   depending on any controller remembering to opt in.

**Known, accepted trade-off**, documented in code and here rather than hidden:
closing the forgery bypass means traffic proxied through this product's own
first-party Next.js apps (`apps/web`, `apps/admin`, `apps/landing`) can no
longer be told apart per browser visitor for the handful of public forms
`PublicRateLimitGuard` covers, because Cloudflare/Render append the *relay's*
own address for that path too, not the original browser's. This is a
granularity regression (back to BUG-0032's original coarseness for that one
scenario), not a new security hole — the alternative was leaving the
CONFIRMED forgery bypass in place. A follow-up (tracked here, not solved in
this pass) would recover the granularity via an authenticated internal channel
between the apps and the API that does not depend on `X-Forwarded-For`
content at all.

The `AuthenticatedRateLimitInterceptor` is a two-tier (read/write) budget, not
the full three-tier (read/write/expensive) design the audit's `RATE.md`
describes — a dedicated `@Expensive()` tier on payroll-calculate/export/report
endpoints is follow-up work, not bundled into this fix.

## Acceptance Criteria

- Varying only the attacker-controlled prefix of `X-Forwarded-For` does not
  change the resolved client identity or grant a fresh rate-limit budget.
- A request whose `X-Forwarded-For` is shorter than the configured trusted-hop
  count resolves to neither the forged entry nor the raw socket address.
- `cf-connecting-ip`, when present, is used over `X-Forwarded-For`.
- Every authenticated request is subject to a per-user ceiling; exhausting one
  user's budget does not affect another user, and exhausting the write budget
  does not affect the read budget.
- `POST /auth/refresh` and other `@Public()` routes are unaffected by the new
  interceptor (no `request.user` yet when it runs).

## Regression Coverage

`services/api/src/common/security/client-ip.spec.ts`,
`services/api/src/common/guards/public-rate-limit.guard.spec.ts` (updated),
`services/api/src/common/interceptors/authenticated-rate-limit.interceptor.spec.ts`
(new). See REG-407.

## Dependencies

None.

## Related Items

Related audit findings: RATE-01, RATE-03, INF-06. See
[[BUG-2458]] (the refresh-throttling lesson this fix deliberately does not
regress) and `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`,
`raw/INF.md`.

## Resolution

Fixed on branch `agent/cs-s5-security`. Changed `packages/config/client-ip.js`
(hop-count-aware indexing + `hasForwardableClientValue`),
`services/api/src/common/security/proxy-trust.ts` (`resolveTrustedProxyHopCount`),
`services/api/src/common/security/client-ip.ts` (prefers `cf-connecting-ip`,
indexes by hop count, no unsafe fallback), `render.yaml`
(`TRUST_PROXY_HEADERS: "2"`), and added
`services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts`,
wired globally in `main.ts` and `app.module.ts`.

## QA Retest

Not yet retested by QA; verified locally via the regression suite listed
above (all passing against this branch's own `packages/config`).

## History

- 2026-09-10 — created from security review at `f26357a8`.
- 2026-09-11 — fixed on `agent/cs-s5-security`; status FIXED.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-407 (see the regression register)

<!-- GRAPH:END -->
