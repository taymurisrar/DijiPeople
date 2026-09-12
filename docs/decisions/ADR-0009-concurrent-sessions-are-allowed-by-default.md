---
ID: ADR-0009
aliases: [ADR-0009]
Title: Concurrent sessions are allowed by default; single-session is an explicit opt-in
Status: ACCEPTED
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
---
# ADR-0009 — Concurrent sessions are allowed by default; single-session is an explicit opt-in

## Status

Accepted — 2026-09-12, resolving [[BUG-3355]].

## Context

`persistRefreshToken` runs on every tenant login and on every refresh
rotation. Unless the tenant had explicitly stored a `security` /
`allowMultipleActiveSessions` setting with `value: true`, it revoked **every
other live refresh token for that user on that client** before writing the new
one:

```ts
// services/api/src/modules/auth/auth.service.ts (before this decision)
private async allowsMultipleActiveSessions(tenantId: string) {
  const setting = await this.prisma.tenantSetting.findUnique({ ... });
  return setting?.value === true;
}
```

An absent setting is not a rare case — it is the default state of every tenant
that has never opened Security & Access, which in production was **every**
tenant: the incident behind [[BUG-3355]] was investigated on a tenant with
**zero** rows in `TenantSetting` for category `security`.

The consequence: signing in from a second device (a phone after a desktop, a
second browser, a CI job exercising the same test account) silently ended the
first session. The displaced browser kept its cookies and rendered normally
until its next authenticated call failed — with no explanation, because
[[BUG-3356]] discarded the real reason. A user with two tabs open, or two
devices, lost one without being told why or that it had happened at all. That
is a defect, not a documented single-active-session policy, because nothing
about it was visible, configurable, or communicated.

Two behaviours were both defensible in isolation — the bug record laid them
out as the two live options:

1. Concurrent sessions allowed by default; a tenant that wants single-session
   opts in explicitly.
2. Single-session remains the default, but made *visible*: surfaced in
   Security & Access, warned about at sign-in, and the displaced session told
   what happened.

## Decision

**Option 1.** An absent `allowMultipleActiveSessions` setting now means
concurrent sessions are **permitted**. Only an explicit `false` turns
single-session behaviour on for a tenant.

Reasoning:

- **The restrictive default was chosen for the wrong kind of operation.**
  "Absent means most restrictive" is the right instinct for a permission check
  — an unlisted capability should not be granted by accident. It is the wrong
  instinct for a session policy, because the restrictive reading here does not
  *deny* an action; it *silently destroys work in progress* on a device the
  acting session cannot see. A denied permission produces an immediate,
  attributable error at the point of the attempt. A revoked session produces a
  delayed, unattributed failure somewhere else entirely.
- **It matches ordinary user expectation.** Almost every consumer and business
  SaaS product allows a user to be signed in on a phone and a laptop at once
  without asking. A DijiPeople tenant administrator, sales lead, or HR manager
  working from two devices during a normal day is the common case, not an edge
  case to guard against.
- **Single-session-by-default has no compensating control today.** Choosing
  option 2 instead would still have shipped a policy that ends sessions
  without a warning at sign-in and without a "you were signed in on another
  session already" prompt — meaningfully more work than inverting a boolean's
  default, for a security property (limiting concurrent sessions) that most
  tenants do not need.
- **Nothing here removes the control.** A tenant that has a genuine reason to
  require single-session — a regulated workspace, a shared-terminal deployment
  — sets `allowMultipleActiveSessions: false` on **Settings → Security &
  Access → Security Governance → Password & Login Policies → Session Rules**,
  and every login and refresh continues to honour it exactly as before. What
  changes is only what happens when nobody has decided.

## Consequences

- `TenantAuthPolicyService.resolveEffectivePolicy()`
  (`services/api/src/common/security/tenant-auth-policy.service.ts`) is now
  the single place this value — and every other session-lifetime value — is
  resolved, read by both `AuthService.persistRefreshToken` and
  `JwtAuthGuard`. See [[ITEM-0162]] for why that consolidation happened
  alongside this decision rather than separately: the two used to disagree
  about `idleTimeoutMinutes` in exactly the shape this bug's investigation
  needed to rule out.
- `DEFAULT_TENANT_SETTINGS.security.allowMultipleActiveSessions` in
  `tenant-settings.catalog.ts` changed from `false` to `true`, so the
  settings-runtime default shown to a tenant that has never saved this screen
  matches what is actually enforced.
- `prisma/seed-config.ts` gained `seedTenantSessionPolicyDefaults()`, which
  upserts an explicit `allowMultipleActiveSessions: true` row for every
  tenant. This is not load-bearing for correctness — the resolver's own
  default already reads absence as `true` — it exists so the decision is a
  recorded fact for every tenant rather than an inference a future reader has
  to re-derive. It never overwrites a tenant that has already set this
  explicitly.
- The Security & Access screen's "Allow multiple active sessions" checkbox
  gained help text stating what it does and that it is on by default, so a
  tenant administrator turning it off is making an informed choice rather than
  discovering the behaviour by reading a bug report.
- Existing tenants that were relying — knowingly or not — on the old
  restrictive default will start allowing concurrent sessions the next time
  they sign in, unless they explicitly set `allowMultipleActiveSessions:
  false`. No tenant is known to depend on the old default; it was never a
  documented or configurable feature.
- `TenantAuthPolicyService` is `@Global()`-exported from `AuthModule`, so
  future consumers of tenant session policy (an active-sessions list,
  device-trust prompts) have one place to read it from rather than a second
  ad hoc query.

## Related

- [[BUG-3355]] — the record this decision resolves.
- [[BUG-3356]] — why the displaced session failed with no explanation, which
  is what made this defect take a database read to diagnose.
- [[ITEM-0162]] — the session-policy consolidation this decision shares an
  implementation with.
- `services/api/src/modules/auth/PASSWORD-LOGIN-POLICY.md` — the enforcement
  table this decision updated.
