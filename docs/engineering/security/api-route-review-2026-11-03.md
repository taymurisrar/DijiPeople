# Review of the four P2 tenant-scoped routes — 2026-11-03

The authorization register (`api-authorization-register.json`) holds four routes the
classifier called `TENANT_SCOPED_NO_ACTION_AUTHZ`: authenticated, and tenant-keyed
by the service, but with no `@Permissions` / `@RequirePermission`. This is the manual
review that register entry asked for. Every claim below is exercised by
`services/api/test/tenant-scoped-reads.e2e-spec.ts` on real PostgreSQL (15 tests).

## Verdicts

| Route | Authentication | Action authz | Object / row authz | Tenant isolation | Sensitive data | Enumeration | Verdict |
|---|---|---|---|---|---|---|---|
| `GET runtime-metadata/published` | `JwtAuthGuard`, no `@Public` | none, by design: every signed-in user renders the app from it | n/a (tenant-wide metadata) | `findFirst({ tenantId: user.tenantId })`; no input | metadata only (field and view definitions, `readPermission` names, no record data) | nothing to enumerate; a tenant with no snapshot gets `published:false` | **Sound.** Owner decision: declare `@AuthenticationOnly()` or gate |
| `GET organization-hierarchy/tree` | `JwtAuthGuard` | none | **none**: whole tree, no business-unit scope | every query takes `user.tenantId`; handler has no request input | names, ids, active flags only | n/a | **Tenant-safe; scope is an owner decision** (below) |
| `GET error-logs/:traceId` | `JwtAuthGuard` | owner-or-support in the service | owner (`log.userId`) or tenant support role, *and* same tenant | tenant compared in the service (`findUnique` by trace id, then verified) | stored through `sanitizeForErrorLog`; secrets redacted | foreign, platform-scope and missing references return the same 404 body | **Defect found and fixed** (below) |
| `GET error-logs/:traceId/download` | `JwtAuthGuard` | same service gate | same | same | redacted text; stack only for the owner or a customizer | same 404; filename is `[A-Za-z0-9_.-]` only, a hostile id cannot reach the header | **Fixed with the route above** |

## Defect fixed: an occurrence inherited another tenant's identity

`ErrorLog` is an *incident* keyed by a fingerprint of source, code, method, path and
message — no tenant. The first request to hit an error creates the incident row; every
later hit adds an `ErrorLogOccurrence` carrying its own diagnostic JSON. `JSON.stringify`
drops `undefined`, so an occurrence with no `tenantId` (a failed sign-in that never
resolved a tenant) or no `userId` stored neither, and `hydrateOccurrence` then spread the
*incident* under it. The occurrence read as the first caller's: a tenant-less platform
log was served to that tenant's support users, and an anonymous occurrence to the first
user. The same applied to `params`, `query`, `requestBody`, `stack`, `cause`, `details`,
`ipAddress` and `userAgent`.

Fix (`error-logs.service.ts`): every per-request field now comes from the occurrence and
is `null` when it did not record it; legacy occurrences without a diagnostic keep the
incident's values. Before the fix three tests failed (platform-scope log served to a
tenant support role, foreign/platform not equal to missing, download of the platform
log); all pass after it.

Exposure: needed a shared fingerprint, a valid `traceId` (an opaque id), and a tenant
support role. Low likelihood, but the payload class (platform sign-in diagnostics) is the
kind this route is meant to exclude.

## Owner decisions that remain

- **Hierarchy tree scope.** Any user in a tenant sees every organization, business unit,
  department and team, including units their access scope excludes. Not a tenant leak
  and carries no personal data; it does disclose structure across business units. Either
  accept it (the pickers need it) or apply `buildScopedAccessWhere`. Not changed here:
  tightening it could empty pickers for scoped users.
- **Declaring the contract.** The three routes above are sound as authentication-only
  routes, but the register entries stay open until the owner either declares
  `@AuthenticationOnly()` on them or adds a permission. The entries are marked
  `REVIEWED` with the evidence; nothing was self-approved.

## Not verified

- Behaviour through HTTP (guards run, status codes on the wire). The tests call the
  controllers and services directly and check the guard metadata; the app-level
  exception filter is not in the loop (see the e2e-app-lacks-the-exception-filter note).
- Rate limiting on trace-id guessing. Trace ids are opaque and a miss is uniform, but no
  throttle was measured.

## Completeness gate (API-001..004)

`scripts/api-completeness.test.mjs` runs the gate against throwaway repositories and
proves it fails when it should: a standard mutable resource missing a lifecycle
operation (API-002), a token or missing justification for a `notApplicable` exception
(accepted only with a real reason), update or delete on a read-only or the new
`immutable` type (API-003), `DELETE` on a sensitive resource without an `allow` entry,
an unclassified controller (API-001), and an unguarded route (API-004).

Two limits worth knowing. `sensitive` resources are only checked for `DELETE`; seven
sensitive controllers expose `PATCH`/`PUT`/restore (contracts, roles, platform-users,
platform-teams, employer-bank-accounts, salary-package-rules) and tightening the rule
would need an owner-approved `allow` entry for each. The checker proves what is
*declared*, never that a route behaves.
