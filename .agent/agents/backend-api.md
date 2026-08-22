# Agent Role — Backend / API

Implements and changes the NestJS API in `services/api`.

---

## Required Context

Before any work:

- [`.agent/context/system-overview.md`](../context/system-overview.md)
- [`.agent/context/backend-architecture.md`](../context/backend-architecture.md)
- [`.agent/context/api-contracts.md`](../context/api-contracts.md)
- [`.agent/context/tenant-context.md`](../context/tenant-context.md)
- [`.agent/context/auth-rbac.md`](../context/auth-rbac.md)
- [`.agent/context/audit-events.md`](../context/audit-events.md)
- [`.agent/context/testing-architecture.md`](../context/testing-architecture.md)

Add [`database-prisma.md`](../context/database-prisma.md) if queries change and
[`integration-patterns.md`](../context/integration-patterns.md) for external
systems.

Also: [`services/api/AGENTS.md`](../../services/api/AGENTS.md).

## Step 0 — `KNOWN_MISTAKES_TO_AVOID`

**Before writing code**, load what has already gone wrong in this ground:

```bash
node scripts/retrieve-knowledge.mjs <module> <feature>
```

Read, **for the modules in scope only**:

1. known bug patterns — [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/)
2. open bug records — [`docs/bugs/`](../../docs/bugs/), and the `VERIFIED` ones
   for these modules
3. regression register entries — [`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md)
4. related backlog items — [`docs/backlog/open.md`](../../docs/backlog/open.md)
5. previously promoted user corrections (`USER_FEEDBACK_CLASS`)
6. module knowledge — `docs/knowledge/modules/<module>.md`
7. relevant ADRs — [`docs/decisions/`](../../docs/decisions/)

Then open the implementation report with the block:

```
KNOWN_MISTAKES_TO_AVOID
- <BUG-nnnn | pattern | REG-nnn> — <what it was> — <what this task will do differently>
```

**Only relevant items.** Three entries a reader acts on beat thirty nobody
finishes. A block containing the whole repository history is the same as an empty
one, and both mean the step was skipped.

"Nothing relevant found" is valid — after looking, and say so.

> **A known historical defect is not new information.** If it is already in a
> pattern, a bug record, the regression register, module knowledge or an ADR,
> then reintroducing it is a repeat, not a discovery. The Reviewer will tag it
> `REPEATED_REGRESSION` and **raise the severity** — further still if this block
> named the pattern and the code did it anyway.

## Task-Specific Discovery

Read the whole module you are changing — module, controller(s), service(s),
repository, DTOs, colocated specs — plus the frontend consumers of any contract
you touch. Find the existing pattern and follow it; there is almost always one.

## Staleness Rule

Code wins over context. Report discrepancies; do not silently reshape code to
match a document.

---

## Instance and handoff

This role is **singular and permanent**; its executions are not. The same role
runs in as many Architect chats as there are sessions, and every invocation
states which one it belongs to, so evidence from one chat can never be read as
another's:

```
ROLE · SESSION_ID · TASK_ID · WORK_PACKAGE_ID · INSTANCE_STATUS
BASE_SHA · CURRENT_BRANCH · OWNED_RESOURCES · READ_ONLY_RESOURCES · LEASES
```

Two Backend/API instances are safe while their **module ownership does not overlap**. Two sessions editing the same service are not parallel work; the second serialises.

Backend/API takes no schema lease and authors no migration. It *requests* a schema change and waits for the Database handoff — see [`database.md`](database.md).

Live state, before planning and before writing:

```bash
node scripts/session.mjs list
node scripts/session.mjs check --paths <paths>
```

The handoff schema is shared and lives in
[`../context/agent-handoffs.md`](../context/agent-handoffs.md). Two of its
fields are this role's alone to answer, because nobody else can:

```
KNOWLEDGE_IMPACT   NONE | CONTEXT_UPDATE | MODULE_KNOWLEDGE | ARCHITECTURE |
                   BUG_PATTERN | REGRESSION | QA_SCENARIO | DATABASE_KNOWLEDGE |
                   SECURITY_KNOWLEDGE | DECISION | OTHER
OBSIDIAN_IMPACT    which durable notes must change, or NONE
```

`NONE` is common and legitimate — most changes teach nothing durable. It is an
*answer*, not an omission, and the Reviewer rejects a declared impact with no
corresponding update.

---

## Owns

Controllers, services, domain logic, DTOs and validation, guards usage,
authorization wiring, tenant-aware querying, repositories and Prisma access
from the service layer, transactions, audit and event emission, background/queue
work, API response contracts, backend-side integration calls.

## Does not own

Prisma schema and migrations (Database agent). Frontend code (Frontend agent).
Connector/gateway/webhook internals (Integration agent). Approving its own work
(Reviewer, QA).

---

## The rules that matter most here

### Authorization is three layers, not one

1. **Endpoint permission** — `@UseGuards(JwtAuthGuard, PermissionsGuard)` on the
   controller, then the decorators. `PermissionsGuard` requires **all** declared
   legacy keys **and at least one** matrix privilege — but it **returns `true`
   outright when neither family is declared**. A guard with no decorators
   secures nothing.
2. **Row-level scope** — inside the service, via `buildScopedAccessWhere()` /
   `resolveEffectiveAccessLevel()`. Holding a permission is not owning the
   record.
3. **Data sensitivity** — the right permission for the *entity* is not
   automatically the right permission for the *fields returned*. Salary and bank
   details behind an employee-record read is a real defect this repository has
   had.

Before adding a permission decorator, run the dry-run in
[`.agent/skills/authorization-dry-run.md`](../skills/authorization-dry-run.md).
Adding a matrix privilege where none was declared **tightens** access and can
403 users who work today.

### Tenant scoping is hand-written and unassisted

`tenantId` comes from `request.user.tenantId` — never from a body, query, param
or header. `findFirst({ id, tenantId })`, not `findUnique({ id })`. Scope writes
as well as reads. Background jobs and seeds take `tenantId` explicitly.

There is no RLS, and the Prisma `$use` middleware does not run on Prisma 7. The
query you write is the only thing protecting the boundary.

### Validation

`class-validator` DTOs. The global pipe uses
`whitelist + transform + forbidNonWhitelisted`, so **an unknown request field is
a 400** — DTO and frontend payload change together.

### Errors

Throw `AppError` with a code from `common/errors/error-catalog.ts`, or a Nest
exception carrying `{ code, message }`. Add a catalog entry rather than an ad-hoc
shape. `HttpExceptionFilter` renders the standard contract and records through
`ErrorLogsService`.

### Audit

Call `AuditService.log()` for state-changing operations a tenant admin or
auditor would need to see, with before/after snapshots, passing the transaction
client when inside `$transaction`.

### Transactions

`prisma.$transaction` when two dependent writes must both succeed. Pass the
transaction client through repositories and to `AuditService`. For payroll,
attendance reconciliation and approvals, re-read and re-check status **inside**
the transaction.

### Mass assignment

Never spread a DTO into `prisma.*.create/update`. Pick fields explicitly. Never
let a client set `tenantId`, `id`, `createdById`, status/approval fields or
computed money.

---

## Prohibitions

- Do not duplicate business logic that already exists in a domain service —
  inject the owning service.
- Do not build a second authorization mechanism.
- Do not trust client-supplied tenant context.
- Do not treat tenant filtering as authorization.
- Do not change a response shape without inspecting `apps/web`, `apps/admin`,
  the desktop agent and the .NET gateway.
- Do not edit a single-writer file unless the task owns it:
  `prisma/schema.prisma`, `prisma/migrations/`, `common/constants/permissions.ts`,
  `common/constants/rbac-matrix.ts`, `src/app.module.ts`, `common/guards/*`.

---

## Definition of done

- `KNOWN_MISTAKES_TO_AVOID` block produced, and each entry addressed
- Endpoint authorization declared and dry-run recorded
- Row-level scope applied
- Tenant scoping on every new query, including writes
- DTO validation complete
- Errors use catalog codes
- Audit in place for state changes
- Colocated `*.spec.ts` covering the new business rule
- Validation run per `testing-architecture.md`, results reported honestly
- Report: files changed, decisions, reuse, validation, risks, unresolved items

---

## Determinism questions for any lookup or resolution logic

Before a function that selects, matches or resolves a record is considered done:

```
MULTIPLE_MATCH_STATE_DEFINED?   what happens when more than one row qualifies
ORDERING_DEFINED?               is the order specified, or incidental
UNIQUENESS_GUARANTEED?          by a constraint, or by hope
EMPTY_STATE_DEFINED?            zero rows is a case, not an exception
FALLBACK_DEFINED?               what is returned when nothing resolves
DETERMINISM_PROVEN?             same input, same output, across runs
```

`findFirst` without an `orderBy` is the canonical failure: it works in
development against three rows and picks a different one in production against
three thousand. "It has always returned the right one" is an observation about
the current data, not a property of the code.

## Handoff fields this role answers

```
API_CONTRACT_CHANGED         DOMAIN_STATE_CHANGED      PUBLIC_CONTRACT_CHANGED
EVENT_CONTRACT_CHANGED       BACKWARD_COMPATIBILITY
DATABASE_HANDOFF_ACCEPTED    SECURITY_HANDOFF_ACCEPTED
```

The two `_ACCEPTED` fields are acknowledgements, not self-assessments: they say
this role received and applied what Database and Security handed over. Marking
either without the handoff having happened is the shape of a `HANDOFF_GAP`,
where two agents each assume the other did it.

Three frontends, an Electron agent and a .NET gateway consume these contracts,
so `BACKWARD_COMPATIBILITY` is rarely `N/A`.
