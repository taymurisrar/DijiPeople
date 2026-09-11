---
ID: BUG-3204
aliases: [BUG-3204]
Title: Per-client JWT secrets are documented but not provisioned; client separation rests on an unsigned claim check
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
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

# BUG-3204 — Per-client JWT secrets are documented but not provisioned; client separation rests on an unsigned claim check

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Per-client JWT secrets are documented but not provisioned; client separation rests on an unsigned claim check

Identified by the 2026-09-10 full technical audit as AUTH-19 (confidence: AUTH-19=LIKELY (the fallback and the missing production assertion are CONFIRMED; the live values of `WEB_/ADMIN_/AGENT_JWT_*_SECRET` could not be read)).

## Expected Behavior

Distinct secrets per client, asserted at boot in production. The architecture doc (`docs/architecture/authentication.md:36`) describes per-client secrets as the design; the deployment does not implement it.

## Actual Behavior

In all probability one HMAC key signs web, admin and agent-desktop access tokens (and one more signs all three refresh tokens). The `appClientId`/`aud` check is the only thing keeping them apart, and there is no startup assertion that the three secrets differ.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTH-19** (services/api/src/common/config/auth.config.ts, render.yaml):

`services/api/src/common/config/auth.config.ts:44` — silent fallback to a single shared secret:
```ts
export function getClientAccessTokenSecret(configService: ConfigService, clientId: AuthClientId) {
  const key = `${getPublicClientEnvPrefix(clientId)}_JWT_ACCESS_SECRET`;
  const value = configService.get<string>(key);
  if (value?.trim()) { return value.trim(); }
  return getAccessTokenSecret(configService);   // JWT_ACCESS_SECRET
}
```
`services/api/src/common/config/auth.config.ts:378` — `assertAuthEnvironment`'s `requiredInProduction` list contains `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` but **none** of the six per-client keys, so a deployment with all three clients sharing one secret starts cleanly.
`render.yaml:79-82` declares only `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. The per-client keys appear only in `docs/environment-variables.md:161-166` and the `.env.example` files.
The separation that remains is `jwt-auth.guard.ts:86`:
```ts
      if (normalizeAuthClientId(payload.appClientId) !== clientId ||
          normalizeAuthClientId(String(payload.aud ?? '')) !== clientId) {
```
which is correct — I traced it: `clientId` comes from the attacker-controllable `X-DijiPeople-App` header (`auth.config.ts:257`), but flipping the header to another client makes the claim comparison fail, so cross-client replay is refused either way.

---


Full finding text: AUTH-19 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Defence in depth is absent rather than merely weak. The `aud` check is one refactor away from being dropped, at which point an agent-desktop token (90-day lifetime, stored on an employee's laptop) verifies as a web token. It also means one secret rotation logs out every client on every surface at once, which is why rotation gets deferred.

## Affected Areas

services/api/src/modules/auth

## Proposed Resolution

Generate six distinct secrets, set them on the Render service, declare them in `render.yaml` and `turbo.json` `globalEnv`, and add them to `requiredInProduction` in `assertAuthEnvironment` together with an assertion that no two of the three access secrets are equal.

(Difficulty: LOW; Regression risk: MEDIUM (rotation signs everyone out once); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/config/auth.config.ts, render.yaml (audit id AUTH-19).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-19=MEDIUM (rotation signs everyone out once). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-19` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-19) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
