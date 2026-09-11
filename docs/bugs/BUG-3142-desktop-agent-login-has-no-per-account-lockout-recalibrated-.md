---
ID: BUG-3142
aliases: [BUG-3142]
Title: Desktop-agent login has no per-account lockout (recalibrated from an overstated unthrottled-oracle claim)
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/agent, services/api/src/modules/auth]
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

# BUG-3142 — Desktop-agent login has no per-account lockout (recalibrated from an overstated unthrottled-oracle claim)

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Desktop-agent login has no per-account lockout (recalibrated from an overstated unthrottled-oracle claim)

Identified by the 2026-09-10 full technical audit as AUTH-04 / RATE-11 (confidence: AUTH-04=CONFIRMED, RATE-11=CONFIRMED).

## Expected Behavior

**AUTH-04:** Every credential-verifying endpoint uses the same path: `resolveLoginCredential` (which enforces `Identity.status`), the tenant lock, the global identity lock, and both failure registrars.

## Actual Behavior

**AUTH-04:** `POST /api/agent/auth/login` accepts unlimited password guesses against any account on the platform. It never increments `User.failedLoginAttempts`, never honours `User.lockedUntil`, never touches `Identity.failedLoginAttempts` / `lockedUntil`, and never refuses a `SUSPENDED` identity. An account locked out on the web login remains fully guessable here, and a successful guess here does not clear or trip anything.

**RATE-11:** BUG-0033 closed the enumeration oracle (uniform message, timing
  equalisation, deterministic candidate selection — `agent.service.ts:152-198`) and added the rate
  limit. It did **not** add account lockout. So the per-account counter that stops password
  guessing on `/api/auth/login` after 5 attempts does not exist here, and an attacker who prefers
  this endpoint gets a slower but **unbounded** guessing surface against every account on the
  platform, needing no tenant slug.

**Quantified:** 20 guesses / 10 min / IP against *any* account on the platform, unbounded in
  total because nothing accumulates on the account. The tenant login path caps a single account at
  5 wrong passwords ever-per-30-minutes; this path caps nothing.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**AUTH-04** (services/api/src/modules/agent/agent.service.ts):

`services/api/src/modules/agent/agent.service.ts:175` — the credential loop, over every tenant at once, comparing the *`User` row* hash:
```ts
    const candidates = await this.prisma.user.findMany({
      where: { email },
      include: { tenant: true, employee: true },
      orderBy: { createdAt: 'asc' },
    });

    let user: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(dto.password, candidate.passwordHash)) {
```
`AgentService` never imports `LoginLockoutService`, `resolveLoginCredential`, `registerIdentityFailure` or `registerIdentitySuccess` — grep over `services/api/src/modules/agent/` returns zero matches for all four. Contrast `AuthService.validateCredentials` (`auth.service.ts:1288`), which checks `credential.identityLockedUntil`, `this.loginLockoutService.isLocked(user)`, `Identity.status === 'SUSPENDED'`, and calls `registerFailure` / `registerIdentityFailure` on every miss.
The only control is `PublicRateLimitGuard` (`agent.controller.ts:50-53`), which is 20 requests per **(client IP, path)** per 10 minutes (`public-rate-limit.guard.ts:24`).

---

**RATE-11** (`services/api/src/modules/agent/agent.service.ts`):

  `agent.controller.ts:50-55` — `@Public() @UseGuards(PublicRateLimitGuard) @Post('auth/login')`.
  20 per 10 min per `(IP, path)` is the entire control.

  `agent.service.ts:174-190` — the lookup is deliberately **tenant-free**, so this one endpoint
  reaches every account on the platform:
  ```ts
  const email = dto.email.trim().toLowerCase();
  const candidates = await this.prisma.user.findMany({ where: { email }, include: { tenant: true, employee: true } });
  for (const candidate of candidates) {
    if (await bcrypt.compare(dto.password, candidate.passwordHash)) { user = candidate; break; }
  ```
  Neither `LoginLockoutService` nor `registerIdentityFailure` is called anywhere in this file —
  the whole `login` method has no failure bookkeeping. The tenant path's protections
  (`auth.service.ts:1369,1407`) do not apply.

---


Full finding text: AUTH-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`; RATE-11 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**AUTH-04:** Two concrete consequences. (1) The platform's account-lockout control is a single HTTP header away from being irrelevant — an attacker simply targets `/agent/auth/login` instead of `/auth/login`. From a modest pool of rotating IPs, 20 guesses per IP per 10 minutes is thousands of guesses an hour against a named HR administrator with no account-side consequence and no lock ever engaging. (2) A platform-suspended identity (the "this person may not sign in anywhere" state) can still obtain a working agent-desktop token.

**RATE-11:** Credential stuffing against a leaked password list is bounded only by source-address
  count, and each success yields an agent-desktop session with a **90-day refresh token**
  (`common/config/auth.config.ts:22` — `agentRefreshTtl: '90d'`).

## Affected Areas

services/api/src/modules/agent, services/api/src/modules/auth

## Proposed Resolution

**AUTH-04:** In `AgentService.login`, replace the direct `candidate.passwordHash` comparison with `resolveLoginCredential(this.prisma, candidate.id)`, and call `LoginLockoutService.isLocked` / `registerFailure` / `registerSuccess` and `registerIdentityFailure` / `registerIdentitySuccess` exactly as `AuthService.validateCredentials` does. Extract that sequence into one shared function so a third login endpoint cannot diverge again. (Difficulty: MEDIUM; Regression risk: MEDIUM (agents with a stale `User.passwordHash` after an identity-only write would begin failing — which is the correct behaviour, but will surface as support load); Fix now: YES)

**RATE-11:** Call `LoginLockoutService.isLocked` / `registerFailure` / `registerSuccess` in
  `AgentService.login`, using the resolved candidate. Where no candidate matches, register the
  failure against the *email* rather than a user — add an `Identity`-keyed counter reusing
  `registerIdentityFailure` (`users/identity.service.ts:211`). Threshold **5 failures →
  30-minute lock**, matching the tenant path so an attacker cannot pick the softer door. Cap
  `findMany` with `take: 5` (also RATE-05). (Difficulty: MEDIUM; Regression risk: MEDIUM — a shared kiosk device could lock a legitimate employee out; the
  lock must be per-account, not per-device.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/agent/agent.service.ts (audit id AUTH-04).
- The behaviour described in Expected Behavior holds for `services/api/src/modules/agent/agent.service.ts` (audit id RATE-11).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-04=MEDIUM (agents with a stale `User.passwordHash` after an identity-only write would begin failing — which is the correct behaviour, but will surface as support load), RATE-11=MEDIUM — a shared kiosk device could lock a legitimate employee out; the
  lock must be per-account, not per-device.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`
- Audit finding `RATE-11` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`
- Related — [[BUG-0033]]

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-04, RATE-11) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
