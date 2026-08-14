# Architecture Decision Index

Decision narratives for DijiPeople.

> **Settled ADRs live in the repository**, at `docs/decisions/`, next to the code
> they govern and versioned with it. This vault holds the *narrative* — the
> discussion, the options explored, the client conversation, the trade-offs
> weighed — and decisions still being formed.
>
> Once a decision is settled, write the ADR into `docs/decisions/` and link to
> it from here.

---

## Repository ADRs

| ADR | Title | Status |
|---|---|---|
| ADR-0001 | AI-assisted engineering workflow (`docs/decisions/ADR-0001-ai-agent-workflow.md`) | Accepted — 2026-08-14 |

---

## Decisions embedded in the code but never formally recorded

These are real decisions with real consequences. They predate the ADR practice
and are worth back-filling as ADRs when someone has the context to write them
accurately.

| Decision | Where it shows up | Why it matters |
|---|---|---|
| Modular monolith over microservices | 68 modules in one NestJS deployable | Sets the boundary style for every new domain |
| Shared database, shared schema, `tenantId` discriminator | `schema.prisma`, every service | Isolation depends on query discipline, with no database backstop |
| No PostgreSQL row-level security | Absence in migrations | The largest standing security risk |
| Metadata-driven module runtime | `apps/web/lib/runtime/`, `platform-runtime` | Makes tenant customization possible; forbids a second CRUD path |
| Two coexisting permission systems | `permissions.ts` + `rbac-matrix.ts` | Every endpoint must declare both |
| Elevated tenant roles bypass the permission guard | `elevated-tenant-roles.ts` | Adding a key there grants everything |
| Per-client JWT identity and session tables | `auth.config.ts`, three refresh-token models | Prevents cross-app token replay |
| Prisma driver adapter (`@prisma/adapter-pg`) with `engineType = "client"` | `PrismaService` | Contributed to `$use` being unavailable |
| One `schema.prisma` rather than multi-file | `services/api/prisma/` | Worst merge surface in the repository |
| No CI | Absence of `.github/` | Validation is a human/agent responsibility |
| In-process queues rather than a broker | `notifications/`, attendance reconciliation queue | No Redis/BullMQ dependency exists |

---

## Decisions currently open

- **Tenant isolation enforcement.** Keep convention-only, adopt PostgreSQL RLS,
  or implement a Prisma **client extension** to replace the dead `$use`
  middleware? The `$use` API no longer exists in Prisma 7, so the current
  business-unit scoping middleware does not run at all.
- **Permission system consolidation.** Merge the string-key system into the
  entity/privilege matrix, or keep both and add an invariant test asserting
  every endpoint declares both?
- **Schema file splitting.** Prisma supports multi-file schemas. Worth doing for
  285 models?
- **CI.** Introduce it, and what should it gate — lint, typecheck, unit tests,
  e2e, migration status?
- **Async job broker.** Do in-process queues remain adequate?

Each of these should become an ADR when decided — including if the decision is
"leave it as is", with the reasoning.

---

## Writing an ADR

Template: `99 - Templates/ADR.md`.

Numbering is sequential and never reused. An accepted ADR is not rewritten when
the decision changes — write a new one that supersedes it and mark the old one
`Superseded by ADR-XXXX`.

The **Agent Rules** section is what makes an ADR operational: state plainly what
an AI agent must or must not do as a result.

## Related

[[DijiPeople]] · [[Architecture Index]] · [[Engineering Rules]]
