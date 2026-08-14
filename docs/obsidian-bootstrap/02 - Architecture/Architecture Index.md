# Architecture Index

Architectural **reasoning** for DijiPeople.

> The architectural **description** — how the system is actually built — lives
> in the repository under `docs/architecture/`, next to the code it describes.
> This vault holds the *why*, the trade-offs, the history and the open
> questions. Do not duplicate the repository documents here; link to them.

---

## Repository architecture documents

| Document | Covers |
|---|---|
| `docs/architecture/README.md` | Index and reading order |
| `docs/architecture/tenancy.md` | Multi-tenancy model and isolation |
| `docs/architecture/authentication.md` | JWT, sessions, auth clients |
| `docs/architecture/rbac.md` | The two permission systems and row scoping |
| `docs/architecture/audit-events.md` | Audit, events, notifications, error logs |
| `docs/architecture/backend.md` | NestJS structure and request lifecycle |
| `docs/architecture/frontend.md` | Next.js apps and the module runtime |
| `docs/architecture/database.md` | Prisma conventions, migrations, seeds |
| `docs/architecture/settings-and-branding.md` | **Canonical** settings/branding contract |
| `docs/architecture/module-runtime-overhaul.md` | The metadata-driven module runtime |
| `docs/platform-admin-runtime-and-workflows.md` | Platform admin runtime |

---

## The shape, at a glance

```
apps/landing (3000) ─┐
apps/web     (3001) ─┼──▶ services/api (4000, /api) ──▶ PostgreSQL (Prisma 7)
apps/admin   (3002) ─┤                │
agent-desktop       ─┘                ├──▶ Stripe
                                      ├──▶ SMTP / email providers
gateway (.NET, on-prem) ──────────────┘    attendance devices
```

npm workspaces + Turborepo. Vercel (apps), Render (API), Neon (database).

---

## Decisions that shape everything

### Modular monolith, not microservices
68 cohesive modules in one deployable. Cross-module needs are met by injecting
the owning module's service.
*Trade-off:* one process, one deploy, one blast radius — chosen for velocity and
transactional simplicity at this stage.
`TODO: Confirm product/business rule.` — Whether there is a scale threshold at
which this is expected to change.

### Shared database, shared schema, `tenantId` discriminator
One database, one Prisma schema, a `tenantId` column on tenant-owned models.
*Trade-off:* simple and cheap; **isolation depends entirely on query
discipline**. There is no row-level security. See `docs/architecture/tenancy.md`.
This is the single largest standing risk in the system. → [[Architecture Decision Index]]

### Metadata-driven module runtime
Screens are declared, not hand-written; a shared runtime renders lists, records,
forms, commands, views and related records from metadata.
*Why:* it is what makes per-tenant customization possible without per-tenant
code. *Cost:* a steeper learning curve, and a strong rule that nobody builds a
second CRUD path beside it.

### Configurable RBAC with entity privileges and access levels
Roles hold `(entity, privilege, accessLevel)` grants —
`NONE < OWN < TEAM < BUSINESS_UNIT < ORGANIZATION < TENANT`.
*Reality:* a second, older string-permission system runs alongside it and both
are enforced. Consolidating them is unresolved.

### Per-client JWT identity
Separate secrets, TTLs, cookies and session tables for `web`, `admin` and
`agent-desktop`, with `aud`/`appClientId` binding.
*Why:* a stolen tenant-app token cannot be replayed against platform admin, and
the desktop agent can hold a long-lived session without weakening the web
session.

---

## Known architectural risks

Documented in the repository, restated here because they are decisions the team
is currently living with rather than bugs to file:

1. **Tenant isolation is convention-only.** No RLS, no automatic middleware.
2. **The Prisma `$use` business-unit middleware does not run** on Prisma 7 —
   it reads as active defence-in-depth and is not.
3. **Two permission systems** coexist; drift between them is possible.
4. **`hasElevatedTenantRole` bypasses the permission guard entirely.**
5. **One ~11,800-line `schema.prisma`** — the worst merge surface in the repo.
6. **No CI.** Nothing runs lint, typecheck or tests automatically.
7. **`apps/web/lib/security-keys.ts` duplicates API permission keys** with no
   generator.

Each deserves its own decision note. → `05 - Decisions/`

---

## Open architectural questions

- `TODO: Confirm product/business rule.` — Should tenant isolation move to
  PostgreSQL row-level security, or to a Prisma client extension replacing the
  dead `$use` middleware?
- Should the two permission systems be consolidated, and in which direction?
- Should `schema.prisma` be split (Prisma supports multi-file schemas) to reduce
  conflict surface?
- Should CI be introduced, and what should it gate?
- Is an async job broker (Redis/BullMQ) needed, or do in-process queues suffice?
  The dependency is not present today.

## Related

[[DijiPeople]] · [[Product Overview]] · [[Module Index]] ·
[[Architecture Decision Index]] · [[Engineering Rules]]
