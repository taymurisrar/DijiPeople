---
ID: BUG-3163
aliases: [BUG-3163]
Title: The rate-limit key trusts a client-supplied X-Forwarded-For because the API is directly reachable, bypassing Cloudflare
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3163 — The rate-limit key trusts a client-supplied X-Forwarded-For because the API is directly reachable, bypassing Cloudflare

## Summary

The rate-limit key trusts a client-supplied X-Forwarded-For because the API is directly reachable, bypassing Cloudflare

Identified by the 2026-09-10 full technical audit as RATE-01 / INF-06 / INF-08 (confidence: RATE-01=LIKELY *(the unverified link is named below)*, INF-06=LIKELY — every code link is read end to end; the one unverified link is whether Render's edge appends to an incoming `X-Forwarded-For` (the standard behaviour, which makes the attack work) or replaces it (which would not). That check needs a live request and was not performed., INF-08=NOT OBSERVED — searched for specifically, and the configuration that would answer it is not committed).

## Expected Behavior

**RATE-01:** Behind a known edge, the client IP comes from the edge's own
  non-forgeable header (`CF-Connecting-IP`), or from the chain indexed by the configured hop count
  from the right — never from the leftmost entry of an appendable header.

**INF-06:** Behind a single trusted proxy, the client address is the *rightmost* entry the trusted hop wrote — or, equivalently, `trust proxy: 1` semantics counting from the right. The leftmost entry is the one an untrusted client controls.

**INF-08:** Preview deployments target a non-production API and a non-production database, and the application says so visibly.

## Actual Behavior

**RATE-01:** With `trust proxy = 1`, Express's own `req.ip` would take the entry one
  hop from the right — the correct, proxy-written value. `resolveClientIp` ignores the configured
  hop count entirely and takes the leftmost entry, which is the *first* value in the chain and
  therefore whatever the original caller supplied. Cloudflare's documented behaviour is to
  **append** the connecting IP to an existing `X-Forwarded-For` rather than replace it, so the
  chain arriving at Express is `<attacker string>, <real client>, <edge>` and the guard keys on
  `<attacker string>`.

**INF-06:** A caller sending `X-Forwarded-For: 203.0.113.<n>` to `POST /api/auth/login` gets a fresh 20-request bucket for each value of `n`, because Render appends its own hop to the right and the reader takes the left. The credential-stuffing control the guard exists to provide is defeated by one header.

**INF-08:** Unknown, and the repository contains nothing that would make it safe.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**RATE-01** (`services/api/src/common/security/client-ip.ts`, `packages/config/client-ip.js`):

  `packages/config/client-ip.js:31-39` — the leftmost entry is taken:
  ```js
  function readForwardedForClientIp(headerValue) {
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const first = raw.split(",")[0];
  ```

  `services/api/src/common/security/client-ip.ts:27-31` — that value becomes the identity:
  ```ts
  if (isProxyTrusted(request)) {
    const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }
  ```

  `render.yaml:108-109` — `TRUST_PROXY_HEADERS: "true"` → `resolveTrustProxySetting` returns `1`
  (`packages/config/forwarded-host.js:57-59`), i.e. **exactly one trusted hop**.

  Measured production response headers on `https://dijipeople.onrender.com/api/health`:
  `Server: cloudflare`, `CF-RAY: …-SIN`, `x-render-origin-server: Render` — **two** hops in front
  of Express, not one.

  The codebase already knows it is behind Cloudflare —
  `services/api/src/modules/billing/controllers/public-billing.controller.ts:45`:
  `"api.dijipeople.com sits behind Cloudflare, which sets cf-ipcountry from …"` — yet
  `cf-connecting-ip` and `true-client-ip` are read **nowhere** in the repository
  (`grep -rin "cf-connecting-ip\|true-client-ip"` → zero source hits).

---

**INF-06** (services/api/src/common/security/client-ip.ts, packages/config/client-ip.js, packages/config/forwarded-host.js):

`packages/config/forwarded-host.js:49-64` — trust proxy is on for Render even
when `TRUST_PROXY_HEADERS` is unset (and the release record at INF-03 shows it
*is* unset live):
```js
if (configured) { … }
return env?.RENDER === "true" || env?.VERCEL === "1" ? 1 : false;
```

`services/api/src/common/security/client-ip.ts:26-34`:
```ts
export function resolveClientIp(request: Request): string {
  if (isProxyTrusted(request)) {
    const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
```

`packages/config/client-ip.js:31-39` reads the **leftmost** entry:
```js
const first = raw.split(",")[0];
```

`services/api/src/common/guards/public-rate-limit.guard.ts:53` keys the budget
on it:
```ts
const key = `${resolveClientIp(request)}:${request.path}`;
```
with `DEFAULT_WRITE_LIMIT = 20` per ten minutes on `login`,
`forgot-password`, `activate-account`, `public/subscribe` and `public/leads`
(guard lines 15-25).

And the API is directly reachable — `docs/deployment/platform-access.md:167`
gives the origin `https://dijipeople.onrender.com` alongside the
`api.dijipeople.com` alias, with no WAF, no Cloudflare and no edge protection
configured anywhere in the repository.

---

**INF-08** (apps/web, apps/admin, apps/landing, Vercel dashboard):

No `vercel.json` exists anywhere: `git ls-files | grep -i vercel.json` returns
nothing, and `.agent/context/deployment-runtime.md:47-48` states it:
> **Only component 1 has committed deployment configuration.** There is no
> `vercel.json`, no Dockerfile and no docker-compose.

`.agent/context/deployment-runtime.md:174-183`:
> The install scope, build command and environment values live in the Vercel
> dashboard and cannot be read from a clean clone.

Searching the three apps for any code that distinguishes a preview deployment
— `VERCEL_ENV`, `VERCEL_URL` — returns **no hits** outside test fixtures.
There is no guard, no banner, no environment gate and no refusal anywhere in
the frontends that behaves differently on a preview build.

What *is* determinable: `NEXT_PUBLIC_API_BASE_URL` is build-time and baked into
the bundle (`docs/deployment/environments.md:139-143`). Vercel's default is
that Preview environments inherit Production environment variables unless a
Preview-scoped value is set. So the default configuration — the one nothing in
this repository overrides — produces preview builds that call the production
API.

---


Full finding text: RATE-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`; INF-06 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`; INF-08 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**RATE-01:** Every rate limit in the product becomes decorative. One host can issue unlimited
  login attempts, unlimited tenant-signup calls, unlimited lead submissions and unlimited
  password-reset requests by rotating a header value, with no botnet and no cost. It also inverts:
  an attacker can *forge somebody else's* address and exhaust their budget, denying service to a
  specific customer's office IP.

**The unverified link:** I did not execute a request-volume probe against production (the audit
  brief forbids writes, and every rejected request writes a database row — see RATE-04). The
  single unverified claim is that Cloudflare/Render preserve a client-supplied `X-Forwarded-For`
  prefix rather than replacing it. Everything else — that the code reads the leftmost entry, that
  the hop count is configured and then ignored, that `CF-Connecting-IP` is never read, that the
  edge is Cloudflare — is CONFIRMED.

**INF-06:** Unlimited password attempts against a payroll platform's login, and unlimited `public/leads` / `public/subscribe` submissions. The code's own comment (`client-ip.ts:15-20`) states the requirement correctly — *"reachable directly, it is an attacker-controlled string and trusting it would hand any caller an unlimited supply of identities to rotate through"* — and then the deployment is precisely the reachable-directly case.

**INF-08:** If confirmed, every pull-request preview of `apps/web` is a working, publicly-reachable client of the production payroll database, authenticating against production sessions, on an unlisted but guessable `*.vercel.app` hostname. `CORS_ALLOWED_ORIGINS` supports wildcards (`services/api/src/config/env.validation.ts:132`, `matchesWildcardOrigin`), so a `*.vercel.app` entry — if one exists — would admit every preview of every project on that account.

## Affected Areas

services/api/src/common

## Proposed Resolution

**RATE-01:** In `resolveClientIp`, read `cf-connecting-ip` first when present (Cloudflare
  strips and rewrites it on every request, so it cannot be spoofed through the edge), falling back
  to indexing the `X-Forwarded-For` chain **from the right** by the configured hop count. Set
  `TRUST_PROXY_HEADERS: "2"` in `render.yaml` to describe the real Cloudflare→Render topology.
  Add a spec asserting that a request whose `X-Forwarded-For` is `1.2.3.4, 203.0.113.9` with two
  trusted hops resolves to neither `1.2.3.4` nor the socket address. (Difficulty: LOW; Regression risk: MEDIUM — changes which bucket existing traffic lands in; the same function
  feeds `apps/web` tenant routing, so verify workspace resolution simultaneously.; Fix now: YES)

**INF-06:** 1. Read the client hop from the right, counting the number of trusted hops (`resolveTrustProxySetting` already returns a hop count — use it in `readForwardedForClientIp` instead of always taking index 0). The first-party Next proxies that motivated the leftmost read (`packages/config/client-ip.js:42-55`) preserve the incoming chain without appending, so a right-indexed read still finds the visitor for that path — but verify that with the existing `client-ip` specs before changing it.
2. Separately, the limiter's `Map` is process-local. On one instance that is correct; it is listed here so the constraint is visible if INF-11's scale-out is ever taken. (Difficulty: MEDIUM (the header-position change is small; proving both the proxied and direct paths still work is the effort); Regression risk: MEDIUM (getting it wrong collapses every visitor behind a Next proxy into one bucket — BUG-0032, which is why the leftmost read exists); Fix now: YES — routes to the AuthZ/security specialist for severity adjudication; the infrastructure half of it is the direct reachability.)

**INF-08:** 1. **Verify first** (this is for the orchestrator's live-verification pass): read the Preview-scoped `NEXT_PUBLIC_API_BASE_URL` for all three Vercel projects, and read the live `CORS_ALLOWED_ORIGINS` for a `*.vercel.app` wildcard.
2. If previews point at production, set Preview-scoped variables pointing at the staging service from INF-07, and remove any `*.vercel.app` wildcard from the production CORS list in favour of the three exact production origins.
3. Commit a `vercel.json` per app so the deployment is reproducible from a clean clone, closing the finding `environments.md` has carried since August. (Difficulty: LOW; Regression risk: LOW; Fix now: YES (verify), then YES if confirmed)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/common/security/client-ip.ts`, `packages/config/client-ip.js` (audit id RATE-01).
- The behaviour described in Expected Behavior holds for services/api/src/common/security/client-ip.ts, packages/config/client-ip.js, packages/config/forwarded-host.js (audit id INF-06).
- The behaviour described in Expected Behavior holds for apps/web, apps/admin, apps/landing, Vercel dashboard (audit id INF-08).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RATE-01=MEDIUM — changes which bucket existing traffic lands in; the same function
  feeds `apps/web` tenant routing, so verify workspace resolution simultaneously., INF-06=MEDIUM (getting it wrong collapses every visitor behind a Next proxy into one bucket — BUG-0032, which is why the leftmost read exists), INF-08=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RATE-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`
- Audit finding `INF-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`
- Audit finding `INF-08` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RATE-01, INF-06, INF-08) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
