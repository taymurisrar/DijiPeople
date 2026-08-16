---
ID: BUG-0033
aliases: [BUG-0033]
Title: Desktop agent login is unthrottled and enumerates users across every tenant
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [services/api/src/modules/agent, apps/agent-desktop]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId: REG-025
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0033 — Desktop agent login is unthrottled and enumerates users across every tenant

## Summary

`POST /api/agent/auth/login` is `@Public()`, carries **no rate limiting**, looks
the user up by e-mail **across the entire `User` table with no tenant filter**,
and returns **different error messages** for "no such user" and "wrong
password". Together those three facts make it an unthrottled credential-testing
and account-enumeration oracle covering every tenant on the platform at once.

## Expected Behavior

Root `AGENTS.md`: "Public endpoints (`@Public()`) additionally need rate limiting
(`PublicRateLimitGuard`), strict input validation and **no tenant enumeration in
responses or error messages**."

An authentication failure returns one indistinguishable message regardless of
cause.

## Actual Behavior

- `agent.controller.ts:43-44` — `@Controller('agent')` applies
  `JwtAuthGuard, PermissionsGuard`. `@Public()` at `:48`, `:54` and `:60`
  short-circuits `JwtAuthGuard` for the three auth handlers. No throttling guard
  is applied at either level, and the file imports none.
- **There is no global guard to fall back on.** `APP_GUARD` and
  `useGlobalGuards` return **zero matches** across `services/api/src`, so nothing
  covers these routes.
- `agent.service.ts:133-139` — `prisma.user.findFirst({ where: { email } })`,
  no `tenantId`.
- `agent.service.ts:141-143` vs `:152-154` — `'Agent login failed: user was not
  found.'` versus `'Agent login failed: password does not match.'`

## Reproduction

1. `POST /api/agent/auth/login` with `{ email: <any address>, password: 'x',
   deviceFingerprint: '…' }`.
2. Observe the response body: `user was not found` if the address belongs to
   nobody, `password does not match` if it belongs to a real user **in any
   tenant**.
3. Repeat without limit. No `429` is ever returned.

Step 2 is the enumeration; step 3 is what makes it cheap.

## Evidence

Paths and lines as listed under Actual Behavior, all read at `78072d2`.

Contrast within the same repository: `public-leads.controller.ts:14` applies
`@UseGuards(PublicRateLimitGuard)` at controller level, with a comment
explaining that an unthrottled public endpoint is an amplifier. The agent auth
controller did not get the same treatment.

## Root Cause

Established for the throttling half: rate limiting is applied per controller by
hand and nothing verifies that a `@Public()` route has it —
the same root cause as [[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]]
and the unbuilt check in [[ITEM-0013]]. This is the third instance.

The enumeration half is a separate cause: the messages were written to be
helpful during development and never revisited. The absent tenant filter is
**not** a defect on its own — the desktop client cannot know its tenant before
authenticating, so a global lookup is the intended design (see
[[desktop-agent-architecture]]). It is what turns the message difference from a
per-tenant leak into a platform-wide one.

## Impact

Reachable by anyone on the internet who can resolve the API host.

- **Credential stuffing / password spraying** against every tenant
  simultaneously, at whatever rate the host permits.
- **Account enumeration** — confirm whether any e-mail address belongs to a
  DijiPeople user, in any tenant, without a valid password. That is exactly the
  tenant enumeration `AGENTS.md` prohibits on public endpoints.
- The desktop agent additionally requires a linked `Employee` (`:164-167`) and
  an active tenant (`:157-162`), each with its own distinct message, so a
  successful password guess further discloses employment status.

Not `CRITICAL`: no authentication is bypassed and no tenant-owned business data
is returned. What leaks is account existence, and what is missing is a rate
control.

## Affected Areas

`services/api/src/modules/agent/agent.controller.ts` ·
`agent.service.ts` (`login`, `refresh`, `logout`) · every tenant's user
directory · `apps/agent-desktop` sign-in.

## Proposed Resolution

Two independent changes; neither needs an ExecPlan.

1. Apply `PublicRateLimitGuard` at **controller level** on `AgentController`, so
   the three `@Public()` handlers inherit it and a fourth added later does too.
   Login limits should be tighter than the generic 20-per-10-minutes.
2. Collapse the failure messages. `user was not found`, `password does not
   match`, `account is not active` and the missing-employee `Forbidden` must
   become one message with one status for the caller; keep the distinction in
   the server log where it is useful and not disclosed.

## Acceptance Criteria

- Repeated failed logins from one client return `429`.
- A login attempt for a non-existent address and one for a real address with a
  wrong password are **indistinguishable** in status, body and timing class.
- A test fails if any `@Public()` handler in `AgentController` has no rate-limit
  guard.

## Regression Coverage

**None today** — there is no spec of any kind for the `agent` module
(`services/api/src/modules/agent/` contains controller, module, service and
`dto/` only, and no `services/api/test/*.e2e-spec.ts` covers `/agent/*`). The
regression must assert both the `429` and the message equivalence.

## Dependencies

[[ITEM-0013]] — the mechanical rate-limit coverage check that would have caught
this and the two before it.

## Related Items

[[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]] ·
[[BUG-0013-public-lead-endpoint-had-no-rate-limiting]] · [[ITEM-0013]] ·
[[desktop-agent-architecture]] · [[desktop-agent]] · [[authentication]] ·
[[multi-tenancy]] · bug pattern [[authorization-missing]].

## Resolution

Fixed. All three facts this record identified are closed, and a fourth defect
found in the same handler is closed with them.

- **Unthrottled** — `POST /agent/auth/login`, `/refresh` and `/logout` now
  carry `PublicRateLimitGuard`, and the ITEM-0013 invariant built for BUG-0031
  fails the build if that regresses.
- **Distinguishable messages** — "user was not found" and "password does not
  match" are both now `Invalid credentials.`, matching what
  `AuthService.validateCredentials` has always returned.
- **Timing** — a missing address used to skip bcrypt entirely and answer in
  microseconds, which enumerates exactly as well as the message did. It now
  compares against a fixed hash. The cost factor is part of the fix: user
  passwords are hashed at cost 12, and measured here a cost-12 comparison takes
  ~261 ms against ~67 ms for cost 10, so equalising with a cheaper hash would
  have left a four-fold gap. The first draft used a cost-10 constant and would
  have done exactly that.
- **Cross-tenant lookup (new)** — `findFirst({ where: { email } })` was not
  merely tenant-blind, it was **non-deterministic**. `User` is unique on
  `[tenantId, email]`, not on `email`, so someone employed by two tenants — a
  contractor, an outsourced accountant — has two rows, and the handler resolved
  to whichever the database returned first. They could be refused their own
  account, or land in the wrong workspace, depending on query plan. The desktop
  agent sends no workspace (`AgentLoginDto` carries only e-mail, password and
  device fields), so the password disambiguates: candidates are fetched and the
  one whose hash matches is the account.

The two remaining specific messages — inactive account, no linked employee — are
deliberately left specific and commented as such. Both are reachable only after a
correct password, so they confirm nothing an attacker did not already know, and
collapsing them would send a legitimate employee to reset a password that is
fine. This mirrors the reasoning already documented in `AuthService.login`.

## QA Retest

`services/api/src/modules/agent/agent-login-enumeration.spec.ts` — 5
assertions: identical message for both outcomes, no reason named in the message,
bcrypt time spent on a non-existent address, correct account selected when one
address exists in two tenants, and lookup that does not assume global e-mail
uniqueness.

Verified to fail against the defect: restoring the original `findFirst` +
two-message shape fails **4 of the 5**.

Full API suite as CI runs it: 155 suites, 1107 tests, all passing.

## History

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified directly against source at `78072d2`.
- 2026-08-16 — Architect triage: `FIX_NOW`. Both halves are small, bounded and
  need no design work, and the endpoint is internet-reachable. Sequenced ahead of
  BUG-0031 because this one leaks information as well as lacking a limit.
- 2026-08-16 — fixed. Throttling closed via the BUG-0031 invariant; enumeration
  closed via uniform message plus timing equalisation; a non-deterministic
  cross-tenant account resolution was found in the same handler and fixed.
