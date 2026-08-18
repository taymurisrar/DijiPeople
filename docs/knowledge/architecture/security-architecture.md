# Security Architecture

> Generated from repository evidence at `42df4a7`.

The trust boundaries, invariants and durable failure classes the Security Agent
reviews against. This is the standing map; the current records in `docs/bugs/`,
`docs/qa/regressions/` and `docs/qa/known-bug-patterns/` are the live truth, and
where they disagree with this document **they win**.

It deliberately does **not** restate every bug record. It names the classes and
links to where the detail lives.

## Trust boundaries

Six places where data crosses from untrusted to trusted. Every one of them has
produced a defect in this repository.

| Boundary | What crosses | What must never be trusted |
|---|---|---|
| Browser → Next route handler | Cookies, form payloads | Role, permission, tenant, price, total, approval state |
| Next route handler → API | Forwarded request + cookie auth | The handler's own authorization opinion — it makes none |
| API → PostgreSQL | Prisma queries | That a `where` clause carries `tenantId` unless it visibly does |
| Third party → API | Stripe webhooks, device ingestion | Payload authenticity without signature verification |
| Desktop agent → API | Attendance events, credentials | Client-asserted identity or timestamps |
| Gateway (.NET) → API | On-premise device data | That the gateway is the only caller |

**The Next route handlers are the boundary most often misread.** They are thin
proxies. The API is the authority. A handler that re-implements an authorization
or tenant decision is a second source of truth, and BUG-0039 is what that costs:
two proxies converted an authoritative 403 into a 200 carrying another
employee's payslips and bank accounts.

## Tenant isolation — convention, not enforcement

The single most important invariant here, and it is **enforced by convention**.

- No PostgreSQL row-level security.
- No global tenant Prisma middleware. `PrismaService` registers a `$use`
  middleware, but it scopes by *business unit*, not tenant — and on
  `@prisma/client@7.8.0` `$use` is unavailable, so it is inert. **Never treat it
  as a safety net.**
- No automatic tenant filter in the generic entity data API.

Which means every tenant-scoped query is a hand-written `where` clause, and the
review question is always: *does this specific query filter `tenantId`, taken
from `request.user`?*

`findUnique` by bare id on a tenant-owned model is unsafe by construction. Use
`findFirst` with `{ id, tenantId }`, or re-verify before returning or mutating.
Updates and deletes need the same treatment.

`tenantId: 'platform'` is the one legitimate string sentinel, routing audit rows
to `PlatformAuditLog`. There are no others.

## Authorization is three steps, not one

DijiPeople runs **two permission systems at once**, and `PermissionsGuard`
requires *all* declared legacy keys **and** *at least one* matrix privilege:

```ts
@Permissions('employees.read')                      // common/constants/permissions.ts
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')   // common/constants/rbac-matrix.ts
```

Row-level scope is a **third, separate** step, done inside the service via
`buildScopedAccessWhere()` / `resolveEffectiveAccessLevel()`.

The failure this shape produces is specific and recurrent: **holding the right
permission is not the same as owning the record.** An `OWN` or `TEAM` role with
`employees.read` must not reach another person's record, and only the third step
prevents that.

`hasElevatedTenantRole` bypasses the guard entirely. Nothing joins that list
without an explicit recorded decision.

## Durable failure classes

Each has happened. The Security Agent retrieves the *current* records for the
modules in scope rather than working from this list — it is a map, not an
inventory.

| Class | Canonical shape |
|---|---|
| Refusal converted to success | A proxy turned 403 into 200 with someone else's data (BUG-0039) |
| Cross-tenant lookup | `findUnique` by bare id on a tenant-owned model |
| Client-controlled tenant | `tenantId` from body, query, param or header |
| Half a permission pair | Only one of the two decorators declared |
| Permission ≠ ownership | Correct permission, no object-level scope |
| Fail-open guard | Permits when its input is absent or malformed |
| Untrusted forwarded identity | Client address trusted without a verified proxy chain (BUG-0032) |
| Public endpoint abuse | Unauthenticated route without rate limiting or bounded input |
| Non-idempotent money | A replayed request charges or provisions twice |
| Mass assignment | A DTO spread into `create`/`update` |
| Signed-artifact mutation | A record changed after it became legally fixed |
| Unsafe destructive action | Deletion without scope, confirmation or audit |
| Frontend gating mistaken for enforcement | `lib/permissions.ts` is cosmetic |

## Public surface

At the last count there were **32 `@Public()` handlers across 12 controllers**,
including *partially* public controllers — `auth`, `agent`, `tenants`,
`tenant-settings` — where most handlers are guarded and a few are not.

**Never assume a controller is uniformly public or uniformly guarded.** Count
them on the branch under review.

Every public endpoint needs rate limiting (`PublicRateLimitGuard`), strict input
validation, and no tenant enumeration in responses *or in error messages*.

## Secrets and sensitive data

Integration credentials go through `SecretEncryptionService`;
`SECRET_ENCRYPTION_KEY` is mandatory in production and the service only *throws*
in production — elsewhere it warns and stores plaintext, which is why test
environments must set it too or they exercise a path that never runs for real.

Never in a response or a log: password hashes, refresh tokens, encrypted
secrets, full national ids, bank details. Use explicit `select`, not `include`
everything. `sanitizeForErrorLog` exists for error payloads.

## Negative testing is the proof

Security names the attack; QA proves the outcome. A security fix without a
negative test is a fix that will regress silently.

The minimum negative set for an authorization change:

```
unauthorized (no token)          → 401
authenticated, wrong role        → 403
authenticated, wrong tenant      → 403 or 404, and NO data disclosed
authenticated, wrong owner       → 403 or 404, and NO data disclosed
malformed / absent identity      → refused, never defaulted
replayed request (where money or provisioning is involved) → idempotent
```

"No data disclosed" is part of the assertion. A 403 whose body leaks the record
is still a disclosure.

## Related

The boundaries above are not abstractions — each links to the record that proves
it. These are the canonical failures this document is a map of:

- Refusal converted to success — [[BUG-0039]]
- Untrusted forwarded identity — [[BUG-0032]]
- Missing security response headers — [[BUG-0040]]
- A report-only job that rounded its own result up — [[BUG-0049]]

Affected surfaces, as module knowledge:

- [[tenant-isolation]] · [[platform-admin]] · [[billing]] · [[tenant-provisioning]]

Sibling knowledge:

- [[ci-architecture]] — where the security gates actually run
- `.agent/agents/security.md` — the role that reviews against this
- `.agent/context/tenant-context.md` · `.agent/context/auth-rbac.md`
- `docs/qa/known-bug-patterns/` — the prevention rules
- `docs/qa/regressions/index.md` — what must not come back
