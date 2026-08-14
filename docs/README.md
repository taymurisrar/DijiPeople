# DijiPeople Documentation

Index of repository documentation, and the boundary between what lives here and
what lives in Obsidian.

---

## Authority: what wins when documents disagree

1. **The source code.** Always. Documentation can be stale; code that runs
   cannot.
2. **`services/api/prisma/schema.prisma` and `prisma/migrations/`** for anything
   about data shape.
3. **`docs/architecture/`** for design contracts. Within it,
   [`settings-and-branding.md`](architecture/settings-and-branding.md) is
   explicitly canonical for settings, branding, the User/Employee boundary,
   work-configuration records and attendance schedule resolution — it overrides
   other documents where they differ.
4. **`docs/decisions/`** (ADRs) for why something is the way it is.
5. **Obsidian** for product intent, business rules and history. It never
   overrides code.

If you find a document that contradicts the code, **fix the document in the same
change** — do not leave it for later, and do not quietly work around it.

---

## What is here

### `architecture/`
Implementation-facing architecture. How the system is actually built.

| Document | Scope |
|---|---|
| [`README.md`](architecture/README.md) | Index of the architecture set |
| [`tenancy.md`](architecture/tenancy.md) | Multi-tenancy model and isolation mechanism |
| [`authentication.md`](architecture/authentication.md) | JWT, sessions, auth clients, cookies |
| [`rbac.md`](architecture/rbac.md) | The two permission systems and row-level scoping |
| [`audit-events.md`](architecture/audit-events.md) | Audit logs, platform events, notifications, error logs |
| [`backend.md`](architecture/backend.md) | NestJS structure, module conventions, request lifecycle |
| [`frontend.md`](architecture/frontend.md) | Next.js apps, module runtime, settings runtime |
| [`database.md`](architecture/database.md) | Prisma conventions, migrations, seeds |
| [`module-runtime-overhaul.md`](architecture/module-runtime-overhaul.md) | Metadata-driven module runtime (pre-existing, authoritative) |
| [`settings-and-branding.md`](architecture/settings-and-branding.md) | Settings and branding contract (pre-existing, **canonical**) |
| [`tenant-settings-attendance-runtime.md`](architecture/tenant-settings-attendance-runtime.md) | Settings/attendance runtime companion (pre-existing) |

### `decisions/`
Architecture Decision Records. One decision per file, numbered, immutable once
accepted — superseded rather than rewritten. See
[`decisions/README.md`](decisions/README.md).

### `features/`
Implementation-facing notes for individual features: what shipped, which
modules and models it touches, which permissions it introduced. Not requirements
— those live in Obsidian. See [`features/README.md`](features/README.md).

### `development/`
How to work in this repository.

| Document | Scope |
|---|---|
| [`README.md`](development/README.md) | Index and command reference |
| [`parallel-work.md`](development/parallel-work.md) | Parallel vs sequential task rules |
| [`git-worktrees.md`](development/git-worktrees.md) | Branch and worktree workflow |
| [`skills-assessment.md`](development/skills-assessment.md) | Recommended automation Skills and why |

### Existing top-level documents (pre-existing, kept)

- [`seed-architecture.md`](seed-architecture.md) — seed commands and ordering
- [`seed-architecture-findings.md`](seed-architecture-findings.md)
- [`environment-variables.md`](environment-variables.md)
- [`deployment-env-checklist.md`](deployment-env-checklist.md)
- [`platform-admin-runtime-and-workflows.md`](platform-admin-runtime-and-workflows.md)
- [`timesheet-payroll-demo-flow.md`](timesheet-payroll-demo-flow.md)
- [`billing/stripe-billing.md`](billing/stripe-billing.md), [`billing/uat-checklist.md`](billing/uat-checklist.md)

### `obsidian-bootstrap/`
**Not documentation.** A starter vault structure to be copied into an Obsidian
vault outside this repository. See
[`obsidian-bootstrap/README.md`](obsidian-bootstrap/README.md). Nothing in the
application reads it.

---

## Knowledge boundaries

| Where | Holds | Does not hold |
|---|---|---|
| **Repository code** | The actual system. Schemas, migrations, executable configuration, tests. | — |
| **`docs/`** | Implementation-facing technical documentation. Architecture as built, ADRs, feature implementation notes, development workflow. | Business requirements, meeting notes, client feedback, speculative design |
| **`AGENTS.md` (root + nested)** | How coding agents must behave in this repository. | Product knowledge, plans |
| **`PLANS.md`** | How substantial changes must be planned. | The plans themselves |
| **`.agent/agents/`** | Agent role definitions. | Repository conventions (those are in `AGENTS.md`) |
| **Git** | The authoritative change history. | — |
| **Obsidian** | Product knowledge, business requirements, architectural *reasoning*, decisions in narrative form, meeting notes, client feedback, implementation history. | Copies of source code, schema dumps, anything that goes stale silently |

**Do not turn Obsidian into a duplicate copy of the source code.** Link to
files and modules by path; do not paste them.

---

## How agents should use these documents

1. **Before planning** — read `architecture/` for the areas in scope, plus any
   relevant ADR in `decisions/`. Read
   [`architecture/tenancy.md`](architecture/tenancy.md) and
   [`architecture/rbac.md`](architecture/rbac.md) before any backend change.
2. **Before implementing** — read the root [`AGENTS.md`](../AGENTS.md) and every
   nested `AGENTS.md` covering directories you will touch.
3. **Verify against code.** These documents are a map, not the territory. If a
   document and the code disagree, the code is right and the document is a bug.
4. **When you change architecture** — update the relevant `architecture/`
   document in the same change, and add an ADR in `decisions/` if the change
   involved a real choice between alternatives.
5. **Do not create a new document where an existing one should be extended.**
   Duplicated documentation rots faster than code.
6. **Keep repository docs implementation-focused.** Requirements, rationale and
   history belong in Obsidian.
