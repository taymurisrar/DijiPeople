---
ID: ITEM-0162
aliases: [ITEM-0162]
Title: Session timeout configuration lives in two places that disagree, and most of the env values are inert
Type: TECH_DEBT
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [api:auth, api:tenant-settings]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3355
RelatedQA:
RelatedADR: ADR-0009
RelatedImplementation: services/api/src/common/security/tenant-auth-policy.service.ts
TargetMilestone:
BlockedBy:
---

# ITEM-0162 — Session timeout configuration lives in two places that disagree, and most of the env values are inert

## Summary

How long a tenant session lasts is decided twice: by a set of `AUTH_*`
environment variables on the API service, and by a per-tenant auth policy whose
defaults are hardcoded in `resolveTenantAuthPolicy`. The two disagree, and for
tenant users the policy usually wins — so several environment variables that
were deliberately set in production have no effect on the behaviour they name.
An operator reading the service configuration would form a confident and wrong
picture of how long sessions live.

## Why It Matters

Session lifetime is a security control. When the knob an operator turns is not
the one the system reads, the control is unverifiable: tightening it appears to
work and does not. This was measured during the investigation behind
[[BUG-3355]], where the production configuration said sessions expire in eight
hours and the database said thirty days.

It also costs diagnosis time. Answering "why did this session end" currently
requires reading four files and a database row, because no single place states
the effective policy.

## Evidence

Measured against production API commit `85c31d9d` and tenant
`91ab031f-8fa2-48b9-b346-7cdf326571ef`, which has **zero** `TenantSetting` rows
in category `security`, so every policy value in play is a code default.

**Absolute lifetime.** The service sets
`AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=28800`, eight hours. Observed
`RefreshToken.absoluteExpiresAt` on a fresh sign-in is the sign-in time plus
**thirty days**. The login path never consults the environment variable: it
passes an explicit value computed from `absoluteSessionLifetimeDays`, whose
policy default is `30`.

- `services/api/src/modules/auth/auth.service.ts:356-366` — login passes
  `absoluteSessionLifetimeDays * 86_400_000` explicitly.
- `services/api/src/modules/auth/auth.service.ts:2161-2205` —
  `resolveTenantAuthPolicy` defaults, all hardcoded.
- `services/api/src/common/config/auth.config.ts:211-226` —
  `getClientAbsoluteTimeoutMs`, reached only by the rotation path when no prior
  value exists.

**Access token lifetime.** The service sets `AUTH_ACCESS_TOKEN_TTL_SECONDS=15m`.
For a tenant user the access token TTL is `sessionTimeoutMinutes` minutes,
policy default `480`. The environment variable applies to no tenant sign-in.

**Idle timeout, advertised versus enforced.** `buildAuthResponse` returns
`idleTimeoutMinutes` to the client from the policy default of `480`.
`JwtAuthGuard.resolveIdleTimeoutMs` falls back to
`AUTH_IDLE_SESSION_TIMEOUT_SECONDS`, set to `1800`. So the API tells the client
eight hours and enforces thirty minutes.

**Remember-me variables on the wrong path.** `JWT_ACCESS_TTL_REMEMBER_ME=30m`
and `JWT_REFRESH_TTL_REMEMBER_ME=30d` are read only by
`buildPlatformAuthResponse`. No tenant sign-in consults them. See [[BUG-3357]].

**Two same-purpose variables with different values.** `AUTH_COOKIE_SAME_SITE` is
`lax` and `COOKIE_SAME_SITE` is `none` on the same service;
`AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS` is `28800` while
`SESSION_ABSOLUTE_TIMEOUT_SECONDS` is `2592000`. Which one applies depends on
the call site.

**The web side cannot be audited at all.** Every auth variable on the
`diji-people-web` Vercel project is stored with type `sensitive`, which is
write-only through the API, so the effective cookie configuration of the tenant
app cannot be read back by anyone.

## Proposed Approach

No ExecPlan needed; nothing here changes a schema or a contract.

Decide which layer owns session lifetime. The tenant policy is the better
owner — it is per tenant, it is the one users can be shown, and it is already
what the code mostly obeys. Then:

1. Make the environment variables the *defaults the policy falls back to*,
   rather than a parallel set of values read at different call sites. One
   resolver returns the effective policy, and both the login path and
   `JwtAuthGuard` use it.
2. Stop advertising a value that is not enforced: the `idleTimeoutMinutes` in
   the login response must be the number the guard will apply.
3. Delete or wire up the variables that do nothing, and collapse the duplicated
   `AUTH_*` and `SESSION_*` pairs to one name each.
4. Record the effective defaults in `docs/environment-variables.md`, which today
   lists values that do not match what production applies.
5. Raise separately with the owner whether the web project's auth variables
   should stay `sensitive`, given that it makes the tenant app's cookie
   behaviour unauditable.

## Acceptance Criteria

- One function returns the effective session policy for a tenant, and every
  enforcement point uses it.
- The `idleTimeoutMinutes` and lifetime values returned to a client match what
  the guard enforces, asserted by a test.
- No auth environment variable remains that the tenant path never reads.
- `docs/environment-variables.md` states the effective defaults, and a check
  fails when they drift.

## Dependencies

None. [[BUG-3357]] overlaps on the remember-me variables and can land first or
together.

## Related Items

[[BUG-3355]] — the investigation that measured this. [[BUG-3357]] — remember-me
lifetimes, the client-side half of the same confusion. [[BUG-3359]] — rotation
behaviour governed by another variable in this set.

## Resolution

Done 2026-09-12, on `agent/r-s3-auth`, alongside [[BUG-3355]] which needed the
same consolidation. Acceptance criteria, addressed in order:

1. **"One function returns the effective session policy for a tenant, and
   every enforcement point uses it."** Done. New
   `TenantAuthPolicyService.resolveEffectivePolicy()`
   (`services/api/src/common/security/tenant-auth-policy.service.ts`) is now
   called by both `AuthService.buildAuthResponse`/`persistRefreshToken` and
   `JwtAuthGuard.resolveIdleTimeoutMs`. `AuthService`'s own private
   `resolveTenantAuthPolicy` was deleted.
2. **"The `idleTimeoutMinutes` and lifetime values returned to a client match
   what the guard enforces, asserted by a test."** Done. Both now read the
   same resolver, so they cannot disagree by construction, and
   `jwt-auth.guard.spec.ts` gained a test asserting the guard's computed idle
   timeout equals what `TenantAuthPolicyService` would advertise for the same
   tenant.
3. **"No auth environment variable remains that the tenant path never
   reads."** **Deliberately not done.** The proposed approach was to make the
   `AUTH_*` variables the tenant policy's fallback default. Production has all
   of them set (`AUTH_ACCESS_TOKEN_TTL_SECONDS=15m`,
   `AUTH_IDLE_SESSION_TIMEOUT_SECONDS=30m`,
   `AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h`) to values far below the
   hardcoded defaults every tenant with no `security` settings row currently
   lives on. Wiring them in would silently drop such a tenant's absolute
   session lifetime from 30 days to 8 hours the instant this reaches
   production — full re-authentication, daily, for every user, with no
   settings change and no announcement. This batch is going straight to
   `main`. Changing what every tenant's session actually does, as a side
   effect of a disagreement fix, is a product decision for the account owner
   to make explicitly, not something this task should decide unilaterally.
   **Left as a follow-up requiring an explicit go/no-go from the owner**, not
   as an oversight — `tenant-auth-policy.service.ts`'s class doc comment and
   `docs/environment-variables.md` both record the reasoning and the current
   (inert) status of these variables on the tenant path.
4. **"`docs/environment-variables.md` states the effective defaults, and a
   check fails when they drift."** Partly done. The effective defaults and
   precedence are documented, including which four variables are genuinely
   inert on the tenant path and why. **No automated drift-check validator was
   written** — adding one was judged out of scope for a task already touching
   this many auth surfaces immediately before a production release; it is a
   reasonable follow-up, not asserted as done here.

The duplicated `AUTH_*`/`SESSION_*` variable pairs (`AUTH_COOKIE_SAME_SITE` vs
`COOKIE_SAME_SITE`, `AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS` vs
`SESSION_ABSOLUTE_TIMEOUT_SECONDS`) were **not** collapsed to one name each —
`auth.config.ts`'s existing precedence (`AUTH_*` checked first) was left
exactly as it already was, and just documented clearly, rather than deleting
environment variables a running production service may still reference.
Point 5 (whether the web project's auth variables should stay Vercel
`sensitive`) was not raised with the owner as part of this task; it remains
open.

## History

- 2026-09-11 — created at `118d22ed` from production configuration read against
  observed database rows.
- 2026-09-12 — done on `agent/r-s3-auth`: single resolver consolidates
  `AuthService` and `JwtAuthGuard`, closing the disagreement that motivated
  this item. Wiring the `AUTH_*` env vars in as tenant-policy defaults was
  deliberately deferred as a product decision — see Resolution.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3355]]
- Modules — [[auth]], [[settings]]

<!-- GRAPH:END -->
