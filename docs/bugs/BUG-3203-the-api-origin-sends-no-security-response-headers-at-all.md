---
ID: BUG-3203
aliases: [BUG-3203]
Title: The API origin sends no security response headers at all
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [services/api/src/main.ts]
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

# BUG-3203 — The API origin sends no security response headers at all

## Summary

The API origin sends no security response headers at all

Identified by the 2026-09-10 full technical audit as ORCH-01 / INF-17 / OBS-28 (confidence: ORCH-01=CONFIRMED (live response + absence in code), INF-17=CONFIRMED, OBS-28=CONFIRMED).

## Expected Behavior

**ORCH-01:** The API should send at minimum X-Content-Type-Options: nosniff, Strict-Transport-Security, Referrer-Policy, and X-Frame-Options: DENY, and should disable x-powered-by.

**INF-17:** `helmet()` (or the equivalent handful of explicit headers) on the API, matching the posture the frontends already have; the `*.onrender.com` hostname either blocked or accepted as a documented decision.

**OBS-28:** `helmet()` in `main.ts` with HSTS and `nosniff`, matching `packages/config/security-headers.js`; `secure: true` unconditional in production.

## Actual Behavior

**ORCH-01:** api.dijipeople.com returns JSON and file downloads with no nosniff, no HSTS, and an X-Powered-By: Express banner.

**INF-17:** API responses — which include JSON containing employee and payroll data, and file downloads from `StorageService` — carry no `X-Content-Type-Options: nosniff` and no HSTS. The onrender.com hostname is a second, unprotected front door to the same service.

**OBS-28:** `api.dijipeople.com` responses carry no HSTS. Because the API is called directly by the Electron agent and the .NET gateway — clients with no browser HSTS cache — a downgrade on the first connection is not mitigated.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**ORCH-01** (services/api — services/api/src/main.ts):

Live, 2026-09-10:
```
$ curl -D - https://api.dijipeople.com/api/health
HTTP/1.1 200 OK
Server: cloudflare
x-powered-by: Express
x-render-origin-server: Render
```
No Strict-Transport-Security, no X-Content-Type-Options, no X-Frame-Options, no Referrer-Policy, no CSP.

packages/config/security-headers.js:1-12 — the shared header policy exists but its own docstring scopes it to the front ends: "Security response headers for the three Next apps." securityHeadersForApp() is consumed by the Next configs only.

grep -rn "helmet|X-Content-Type-Options" services/api/src returns nothing, and helmet is absent from services/api/package.json. The API applies no header middleware of any kind.

---

**INF-17** (services/api/src/main.ts, packages/config/security-headers.js):

The three frontends are well covered. `packages/config/security-headers.js:70-75`:
```js
{
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
}
```
plus `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a report-only
CSP, applied by all three apps via `securityHeadersForApp`.

The API applies none of it. `grep -rn "helmet" services/api/src services/api/package.json`
returns **nothing**, and `grep -rn "Strict-Transport-Security\|X-Content-Type-Options" services/api/src`
returns **nothing**. `main.ts` configures CORS, cookie parsing, body parsing,
a validation pipe and an exception filter — no security headers.

Two hostnames answer: `https://api.dijipeople.com` and
`https://dijipeople.onrender.com` (`docs/deployment/platform-access.md:167`).
No WAF, CDN or edge proxy is configured anywhere in the repository.

---

**OBS-28** (services/api/src/main.ts, packages/config/security-headers.js):

`rg -rn helmet services apps --include=*.ts --include=*.json --include=*.js` (excluding `node_modules`) → **zero results**. Not installed, not imported.
`services/api/src/main.ts` sets only `trust proxy` (`:58-62`), `cookieParser()` (`:92`), body parsing and CORS (`:96`). No `Strict-Transport-Security`, no `X-Content-Type-Options`, no `Referrer-Policy` on any API response.
The Next apps **do** set them, from one shared definition — `packages/config/security-headers.js:73-74`:
```js
key: "Strict-Transport-Security",
value: "max-age=63072000; includeSubDomains",
```
consumed by `apps/web/next.config.ts:29` and `apps/landing/next.config.ts:22`.
No `preload` token.
Cookies are configurable rather than hardcoded — `services/api/src/common/config/auth.config.ts:306-351` — and line 335 refuses the one genuinely unsafe combination in production-like environments:
```ts
if (isProductionLike(configService) && sameSite === 'none' && !secure) { ... }
```
**Gap:** `secure` is only forced when `sameSite === 'none'`. A production deployment configured `sameSite=lax, secure=false` passes both this check and `config/env.validation.ts:85-94`, and would emit auth cookies over plain HTTP.
No plain-HTTP path was found in `render.yaml`.

---


Full finding text: ORCH-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`; INF-17 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`; OBS-28 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**ORCH-01:** The API is the origin that serves uploaded tenant documents. Without nosniff, a browser may MIME-sniff an uploaded file and execute it as HTML or script in the API's origin, which is the standard stored-XSS-via-upload path. Without HSTS, a first-contact request to http://api.dijipeople.com is downgradeable. X-Powered-By is free reconnaissance.

**INF-17:** Moderate and mostly compounding rather than standalone. Missing `nosniff` on a file-download route is the sharpest edge — an uploaded document served with a guessable content type can be sniffed into executable script, which is precisely the risk the frontends' own comment (`security-headers.js:26`) cites. Missing HSTS on the API leaves the first request to `api.dijipeople.com` downgradeable.

**OBS-28:** First-connection downgrade for non-browser clients; MIME sniffing on API responses.

## Affected Areas

services/api/src/main.ts

## Proposed Resolution

**ORCH-01:** Add helmet in main.ts (or reuse baselineSecurityHeaders() from packages/config via an Express middleware so one definition still governs all four surfaces), and call expressApp.disable('x-powered-by'). Confirm Content-Disposition: attachment and a fixed Content-Type on every download route at the same time. (Difficulty: LOW; Regression risk: LOW — these four headers cannot break a JSON API. Add CSP to the API separately, since it serves no HTML.; Fix now: YES)

**INF-17:** 1. Add `helmet` to the API bootstrap with `contentSecurityPolicy: false` (the API serves no HTML) — roughly three lines in `main.ts`, and it reuses a dependency posture the project already accepts on the frontends.
2. Decide explicitly about `dijipeople.onrender.com`: either leave it as the documented operational origin (it is what health checks and release verification use) or reject requests whose `Host` is not an expected one. Leaving it undecided is the current state. (Difficulty: LOW; Regression risk: LOW; Fix now: YES for (1))

**OBS-28:** Add `helmet` to `services/api` and configure it from `packages/config/security-headers.js` so the API and the apps cannot drift; change `auth.config.ts:335` to require `secure` in every production-like configuration. (Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api — services/api/src/main.ts (audit id ORCH-01).
- The behaviour described in Expected Behavior holds for services/api/src/main.ts, packages/config/security-headers.js (audit id INF-17).
- The behaviour described in Expected Behavior holds for services/api/src/main.ts, packages/config/security-headers.js (audit id OBS-28).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: ORCH-01=LOW — these four headers cannot break a JSON API. Add CSP to the API separately, since it serves no HTML., INF-17=LOW, OBS-28=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `ORCH-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`
- Audit finding `INF-17` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`
- Audit finding `OBS-28` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`
- Related — [[BUG-0040]]

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (ORCH-01, INF-17, OBS-28) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
