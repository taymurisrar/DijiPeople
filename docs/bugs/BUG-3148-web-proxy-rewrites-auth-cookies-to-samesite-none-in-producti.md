---
ID: BUG-3148
aliases: [BUG-3148]
Title: Web proxy rewrites auth cookies to SameSite=None in production with no CSRF token anywhere
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [apps/web]
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

# BUG-3148 — Web proxy rewrites auth cookies to SameSite=None in production with no CSRF token anywhere

## Summary

Web proxy rewrites auth cookies to SameSite=None in production with no CSRF token anywhere

Identified by the 2026-09-10 full technical audit as AUTH-13 (confidence: AUTH-13=CONFIRMED (the code); LIKELY (net exploitability, which depends on which host actually issued the surviving cookie)).

## Expected Behavior

One authority for cookie attributes. If `None` is genuinely required by the deployment topology, it must be paired with a CSRF token or a strict `Origin`/`Sec-Fetch-Site` check on every state-changing route.

## Actual Behavior

The tenant web app and the API disagree about the `SameSite` attribute of the same three cookie names on the same domain. Whichever wrote last wins, and the web middleware writes on every token refresh. With `SameSite=None`, the browser attaches the tenant session to cross-site requests, and the API — which has no CSRF token, no origin check, and no custom-header requirement for cookie-authenticated writes — will act on them.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-13** (apps/web/proxy.ts, services/api/src/main.ts):

`apps/web/proxy.ts:436` — the middleware re-issues all three cookies on every silent refresh:
```ts
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: isProduction() ? "none" : "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 15 * 60,
    ...getCookieDomainOption(),
  });
```
(identical for refresh at `:445` and session at `:456`; `getCookieDomainOption()` at `:636` returns `{ domain: process.env.AUTH_COOKIE_DOMAIN }` — confirmed `.dijipeople.com` in production, AUTH-07.)
This contradicts the API, which is asserted to `lax` in production — `services/api/src/common/config/auth.config.ts:414`:
```ts
    if (cookieOptions.sameSite !== 'lax') {
      throw new Error('AUTH_COOKIE_SAME_SITE must be lax for admin production.');
    }
```
and confirmed live (AUTH-07 headers: `SameSite=Lax`).
Grep for `csrf|xsrf` over `services/api/src`, `apps/web/lib`, `apps/web/proxy.ts` and `apps/admin/proxy.ts` returns **zero** matches. `main.ts:96` enables CORS with credentials and nothing else; the guard accepts a cookie-borne token (`jwt-auth.guard.ts:246`).
`apps/admin/proxy.ts:373` correctly uses `sameSite: "lax"`.

---


Full finding text: AUTH-13 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Any site a signed-in employee visits can issue authenticated `POST`/`PATCH` requests to the API as them — approving leave, changing bank details, altering timesheets — without reading the response. The divergence also makes the security posture unpredictable: it depends on whether the middleware happened to refresh recently.

## Affected Areas

apps/web

## Proposed Resolution

Change `apps/web/proxy.ts` to `sameSite: "lax"` so it matches the API and `apps/admin`. Independently, add an `Origin`/`Sec-Fetch-Site` check for cookie-authenticated non-`GET` requests in a global interceptor, since the API is one `@Public()` mistake away from needing it regardless.

(Difficulty: LOW; Regression risk: MEDIUM (verify the workspace-hostname flow still refreshes cleanly under `Lax`); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for apps/web/proxy.ts, services/api/src/main.ts (audit id AUTH-13).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-13=MEDIUM (verify the workspace-hostname flow still refreshes cleanly under `Lax`). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-13` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-13) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
