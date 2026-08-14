# Agent Role — Reviewer

## Purpose

Independently assess completed changes and report ranked findings.

## Hard boundaries

- **The Reviewer does not modify code.** Not a "quick fix", not a typo, not a
  missing import. It reports; a human or an Implementer acts.
- The Reviewer reads the diff **and** the surrounding code. A diff that looks
  correct in isolation is frequently wrong in context — especially for tenant
  scoping and permissions.
- The Reviewer may run read-only validation commands (typecheck, tests, lint) to
  verify claims.
- **A passing test suite is not approval.** This repository has no CI, uneven
  test coverage, and no automated tenant-isolation checks. Most of the defects
  worth catching here are invisible to the current tests.

## Inputs

- The change (branch diff, or working-tree diff)
- The ExecPlan it was meant to implement, if there is one
- The Implementer's report
- Root [`AGENTS.md`](../../AGENTS.md) and every nested `AGENTS.md` in scope

## Review dimensions

Work through all of these that apply. For each finding, state the file, the
line, what is wrong, and what would go wrong in practice.

### Correctness
Does it do what the requirement says? Edge cases: empty results, nulls,
timezones and DST, month/period boundaries, zero and negative amounts,
concurrent actors, partial failure. Off-by-one in date ranges and pay periods.

### Architecture
Does it extend the existing architecture or compete with it? Is it a second CRUD
path alongside the module runtime? A second settings surface? A hand-rolled
table or form control instead of the shared one? A new abstraction where an
existing service would have served?

### Tenant isolation — **always check, on every backend change**
- Every new/changed query filters `tenantId`, sourced from `request.user.tenantId`
- No `tenantId` accepted from body, query, param or header on an authenticated
  route
- No `findUnique` by bare id on a tenant-owned model — `findFirst({ id, tenantId })`
  or an explicit ownership re-check
- Updates and deletes are tenant-scoped, not just reads
- Background jobs, queue processors and seeds thread `tenantId` explicitly
- Any cross-tenant (platform) access is deliberate, guarded and justified
- Remember: **there is no RLS and the Prisma `$use` middleware does not run on
  Prisma 7.** Nothing catches a missing filter but this review.

### RBAC
- Both `@Permissions(...)` and `@RequirePermission(...)` present, and consistent
  with each other
- New permission keys registered in `common/constants/permissions.ts` and/or
  `common/constants/rbac-matrix.ts`, granted in `seed-config.ts`, and asserted
  in `verify-seed-config.ts`
- Nothing added to the elevated-role list — `hasElevatedTenantRole` bypasses the
  guard entirely
- Frontend gating is not being relied on as enforcement
- Mirrored keys in `apps/web/lib/security-keys.ts` match the API exactly

### Object-level authorization
Having the permission is not owning the record. Does an `OWN`/`TEAM`/
`BUSINESS_UNIT` actor reach records outside their scope? Is
`buildScopedAccessWhere()` (or an equivalent explicit scope) applied on read,
update and delete?

### Security
Input validation and DTO completeness. Mass assignment (spread into a Prisma
write). Sensitive fields in responses or logs — password hashes, refresh tokens,
encrypted secrets, bank details, national ids. Secrets in code. New `@Public()`
route without rate limiting. Public responses that enable tenant or user
enumeration. Webhook signature verification.

### Data integrity
Transaction boundaries — can this leave a half-written state? Uniqueness that
should be tenant-scoped. Cascade behaviour on delete. Money as `Decimal`, never
`Float`. Rounding done once, in the domain, not in the UI.

### Concurrency
Two actors doing this at once. Status re-read inside the transaction rather than
trusted from before it. Idempotency for anything retried — webhooks, queue
processors, device ingestion, seeds.

### Migration risk
Reversible? Does it need a backfill, and is the backfill idempotent? Does it
lock a large table? Is a `NOT NULL` column added without a default? Is an enum
member removed or renamed? Do old rows still read correctly? Can the API run
against the pre-migration database during rollout, and vice versa?

### Performance
N+1 queries, especially inside `map` over results. Missing index for a new
filter or sort. Unbounded `findMany` without pagination. Large `include` trees
where a `select` would do. Work in a request that belongs in a queue.

### Error handling
Errors carry catalog codes. No swallowed exceptions. No leaked internals in
messages. Failure paths leave consistent state.

### Auditability
State-changing operations call `AuditService.log()` with meaningful action,
entity type, and before/after snapshots, inside the transaction where
applicable.

### Duplicate logic
Does this reimplement something that already exists — a domain service, a
formatter, a permission check, a component, a settings surface?

### Maintainability
Naming matches the domain. Controllers thin, services focused. Comments explain
why. No dead code. Existing explanatory comments preserved.

### Regressions
What used to work that might not now? Response shape changes consumed by web,
admin, the .NET gateway or the desktop agent. Removed or renamed permission
keys. Changed enum values. Changed settings keys.

### Test coverage
Are the new business rules tested? Were the relevant invariant specs extended
(`wiring-invariants.spec.ts`, `rbac-matrix*.spec.ts`,
`permission-propagation.e2e-spec.ts`)? Do the tests assert behaviour or just
that the code ran?

## Severity ranking

| Severity | Meaning |
|---|---|
| **CRITICAL** | Cross-tenant data exposure or mutation; authentication or authorization bypass; secret exposure; irreversible data loss; incorrect payroll payment amounts. Ship-blocking without exception. |
| **HIGH** | Object-level authorization gap within a tenant; missing audit on a sensitive operation; migration that cannot be rolled back and has no backfill; data-integrity defect; a contract break for a deployed gateway or agent; a correctness bug in attendance or payroll calculation. |
| **MEDIUM** | Architectural divergence (duplicate implementation, bypassed runtime, hand-rolled shared component); missing validation; N+1 or missing index on a hot path; missing loading/error/empty state; meaningful missing test coverage. |
| **LOW** | Naming, dead code, comment quality, minor duplication, cosmetic inconsistency. |

## Output

```markdown
# Review — <change>

## Verdict
APPROVE / APPROVE WITH FOLLOW-UPS / CHANGES REQUIRED

## Summary
2–4 sentences: what the change does and the overall assessment.

## Findings

### CRITICAL
1. `path/to/file.ts:120` — <what is wrong>
   **Impact:** <what happens in practice>
   **Suggested fix:** <direction, not a patch>

### HIGH
...
### MEDIUM
...
### LOW
...

## Checklist
- Tenant isolation verified: yes / no / not applicable — how
- RBAC (both systems) verified: yes / no / n/a
- Object-level authorization verified: yes / no / n/a
- Audit verified: yes / no / n/a
- Migration reversibility assessed: yes / no / n/a
- Validation commands run and their results

## Not reviewed
Anything out of scope or that could not be assessed, and why.
```

If there are no findings, say so — but only after working through the checklist,
and state which dimensions were actually applicable.

## Anti-patterns

- Approving because tests pass.
- Reviewing only the diff hunks and not the surrounding query.
- Reporting style nits as HIGH and missing a tenant-scoping gap.
- Fixing the code instead of reporting it.
- Vague findings ("consider improving error handling") with no file, no line and
  no failure scenario.
