---
ID: BUG-3143
aliases: [BUG-3143]
Title: Session cookies scoped to Domain=.dijipeople.com transmit the platform-admin token to every tenant hostname
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3143 — Session cookies scoped to Domain=.dijipeople.com transmit the platform-admin token to every tenant hostname

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Session cookies scoped to Domain=.dijipeople.com transmit the platform-admin token to every tenant hostname

Identified by the 2026-09-10 full technical audit as AUTH-07 (confidence: AUTH-07=CONFIRMED (executed against production)).

## Expected Behavior

Host-only cookies (no `Domain`), or at minimum a separate registrable domain for the admin console. A platform-admin credential should never traverse a hostname a customer is served on.

## Actual Behavior

A DijiPeople platform administrator's `admin_access_token` is attached by the browser to **every** request to any `*.dijipeople.com` host, including every tenant workspace. Symmetrically, a tenant user's `dp_web_access_token` is sent to `admin.dijipeople.com`. `HttpOnly` prevents JavaScript from reading them but not from causing them to be sent, and any host under the apex can *set* a same-named `Domain=.dijipeople.com` cookie that shadows the victim's.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-07** (services/api/src/common/config/auth.config.ts, production AUTH_COOKIE_DOMAIN):

Executed 2026-09-10 against production:
```
$ curl -sI -H "X-DijiPeople-App: admin" https://api.dijipeople.com/api/auth/me
Set-Cookie: admin_access_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
Set-Cookie: admin_refresh_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
$ curl -sI -H "X-DijiPeople-App: web" https://api.dijipeople.com/api/auth/me
Set-Cookie: dp_web_access_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
```
`services/api/src/common/config/auth.config.ts:296` — the domain is a single shared value with no per-client separation in practice:
```ts
  const domain =
    (clientId ? configService.get<string>(`${getPublicClientEnvPrefix(clientId)}_COOKIE_DOMAIN`) : undefined) ||
    configService.get<string>('AUTH_COOKIE_DOMAIN') ||
    configService.get<string>('COOKIE_DOMAIN') || undefined;
```
`packages/config/platform-domains.js:180` — every surface lives under the one apex: `appHost` `app.<base>`, `adminHost` `admin.<base>`, `apiHost` `api.<base>`, and tenant workspaces at `<slug>.<tenantBaseDomain>`, defaulting to the same base.
`auth.config.ts:369` — the only production guard on the value rejects `localhost` and `*.vercel.app`, not an over-broad apex.

---


Full finding text: AUTH-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

This is the amplifier for AUTH-06 and for any future subdomain takeover, misconfigured CNAME, or additional service under the apex: each one turns from "a bug on that host" into "platform-admin session compromise". Independently, it means the blast radius of a single XSS anywhere under `dijipeople.com` is the whole platform.

## Affected Areas

services/api/src/modules/auth

## Proposed Resolution

Unset `AUTH_COOKIE_DOMAIN` on the API service (and `apps/web`) so cookies become host-only, and verify the tenant workspace flow still works — each workspace hostname will then hold its own session, which is the correct isolation for a multi-tenant product. Extend `isInvalidProductionCookieDomain` in `auth.config.ts` to reject a bare apex for the `admin` client.

(Difficulty: MEDIUM (needs a session-continuity check across the workspace-routing flow); Regression risk: MEDIUM; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/config/auth.config.ts, production AUTH_COOKIE_DOMAIN (audit id AUTH-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-07=MEDIUM. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-07) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
