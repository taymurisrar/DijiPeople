# Agent Context Layer

How specialist agents learn DijiPeople without rediscovering it every session.

Each document describes one layer of the system, grounded in real source paths,
and states what a specialist must verify before changing that layer.

---

## Documents

| File | Primary readers |
|---|---|
| [`system-overview.md`](system-overview.md) | Everyone |
| [`repo-map.md`](repo-map.md) | Everyone |
| [`backend-architecture.md`](backend-architecture.md) | Backend/API, Architect |
| [`api-contracts.md`](api-contracts.md) | Backend/API, Frontend, Integration |
| [`frontend-architecture.md`](frontend-architecture.md) | Frontend, UI/UX |
| [`runtime-module-system.md`](runtime-module-system.md) | Frontend, UI/UX, Architect |
| [`ui-design-system.md`](ui-design-system.md) | Frontend, UI/UX |
| [`tenant-context.md`](tenant-context.md) | **Everyone touching data** |
| [`auth-rbac.md`](auth-rbac.md) | Backend/API, Reviewer, QA |
| [`database-prisma.md`](database-prisma.md) | Database, Backend/API |
| [`audit-events.md`](audit-events.md) | Backend/API, Integration |
| [`integration-patterns.md`](integration-patterns.md) | Integration |
| [`testing-architecture.md`](testing-architecture.md) | **QA, everyone running validation** |
| [`deployment-runtime.md`](deployment-runtime.md) | Database, Integration, Architect |

---

## The staleness contract

Every document carries:

```
> **Last verified:** YYYY-MM-DD
> **Verified against commit:** <sha>
> **Key source files:** <paths>
```

**These documents describe the repository. They are never authority over it.**

When an agent finds a discrepancy:

1. **Do not ignore it.**
2. **Follow the code** — it is current implementation truth.
3. If the correction belongs to the task in hand, fix the document and refresh
   its verification metadata.
4. Otherwise record a context-update recommendation in the final report.
5. **Never reshape code to match a document.**

Do not update context for trivial implementation details. Update it when a
statement has become *false*, not when it has become slightly incomplete.

---

## CURRENT vs TARGET

Every document separates:

- **CURRENT** — what the repository does today, with paths
- **TARGET** — what new work should do

These genuinely differ in places. The clearest example: `AGENTS.md` states that
endpoints should declare both permission families. Measured across the
controllers at this baseline, **10 declare both, 51 declare only the legacy
family, 1 declares only the matrix, and 26 declare neither** while still
mounting the guard. "Both families" is TARGET. Treating it as CURRENT would make
an agent misread the codebase — and misjudge which endpoints are actually
protected.

---

## Why this layer exists

Without it, every session rediscovers the same facts — that the Prisma `$use`
middleware does not run, that `PermissionsGuard` returns `true` when nothing is
declared, that spec files escape the API typecheck — usually by tripping over
them. These documents were written by reading the source, and they exist so the
next agent starts where the last one finished.
