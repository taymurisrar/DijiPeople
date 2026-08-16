# 2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`

| | |
|---|---|
| **Task** | TASK-0002 (`KNOWLEDGE`, LARGE) |
| **Branch** | `agent/knowledge-monorepo-app-documentation` |
| **Base SHA** | `78072d2` |
| **QA run** | `docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md` |
| **Product code changed** | **None** |

## What this was

Three of the five applications in the monorepo had never been documented as
applications. `apps/landing` existed in the record system only through the bugs
it had produced; `apps/agent-desktop` was one line in the repository map;
`apps/docs` was asserted to be "effectively unused" with nothing recording what
that meant operationally.

## What was learned that is worth keeping

### The desktop agent is not an attendance agent

The single highest-value correction. Its package description and the repository
map both call it one. It writes to `WorkSession`, `ActivityEvent` and
`DailyProductivitySummary` and **nothing else** — `agent.service.ts` contains no
reference to attendance at all, and `agent.module.ts` imports only `JwtModule`
and `AuditModule`.

It also has **no relationship to the `gateway/` .NET solution**, in either
direction. Two independent products, two ingestion paths, one API. Captured in
[[desktop-api-gateway-relationship]] because getting this wrong means designing
against the wrong contract and the wrong data model.

### Absence claims are the context layer's dominant failure mode

Nine false "this does not exist" claims were found across four context
documents, denying the `attendance-integrations` module, `gateway-auth.guard.ts`,
the `gateway/` solution (1,387 tracked files), the `gateway:*` npm scripts,
`tools/zkteco-poc/`, Playwright, `apps/landing`'s jest config, the `e2e`
workspace and `app-releases`.

This is the **second** recorded instance of the pattern after BUG-0023. It
recurs because nothing breaks when an absence claim becomes false — a broken
link gets noticed, a phantom absence just quietly misleads. Recorded as
[[BUG-0036-integration-patterns-context-denies-four-subsystems-that-exi]] and
used to raise the evidence on [[ITEM-0011]].

**The durable lesson, applied throughout this task's corrections: replace an
enumeration with an instruction to re-derive.** Four documents said landing had
no tests; two listed frontend specs by name and were three times understated.
Counts and lists are timestamps, not facts, in a repository moving this fast.

### Consensus between documents is not evidence

Four separate documents — including `apps/landing/AGENTS.md`, which is
scope-authoritative — agreed that landing had no jest config. All four were
wrong, because one was derived from another rather than from the code. An agent
cross-checking two documents would have been *more* confident and equally wrong.

### The public rate limit is weaker than it looks, in two independent ways

`PublicRateLimitGuard` keys on `request.ip`, but no landing proxy forwards the
client IP, so every visitor shares one bucket
([[BUG-0031-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]]).
Separately, the most expensive public write — `/public/subscribe`, which creates
a Tenant and real Stripe objects — carries no guard at all
([[BUG-0030-public-subscribe-endpoint-has-no-rate-limiting]]).

That is now **three** instances of "a public write path missed the guard" after
BUG-0013. The mechanical check in [[ITEM-0013]] is the fix; applying the guard by
hand a third time is not.

### Where application knowledge belongs

`docs/knowledge/apps/` was the obvious place and is the wrong one — it has no
entry in `DEFAULT_MAPPINGS`, so notes there would be written and never
published, and retrieval would double-count them. An application gets at most
two notes: `product/` for what it is, `architecture/` for how it is built. The
folder table in `docs/knowledge/README.md` now states the mapping so the next
person does not have to derive it.

## Files written

**New knowledge** — `docs/knowledge/product/landing-website.md`,
`product/desktop-agent.md`, `architecture/landing-architecture.md`,
`architecture/desktop-agent-architecture.md`,
`architecture/docs-application.md`, `architecture/monorepo-application-map.md`,
`architecture/desktop-api-gateway-relationship.md`.

**Knowledge updated in place** — `README.md`, `modules/README.md`,
`product/product-areas.md`, `product/dijipeople-platform-overview.md`,
`architecture/system-architecture.md`,
`architecture/integration-architecture.md`, `modules/leads.md`,
`modules/attendance.md`.

**Context corrected** — `.agent/context/integration-patterns.md`,
`system-overview.md`, `repo-map.md`, `testing-architecture.md`,
`frontend-architecture.md`, `deployment-runtime.md`.

**Other documentation corrected** — root `AGENTS.md`,
`apps/landing/AGENTS.md`, `packages/config/AGENTS.md`, `apps/docs/README.md`,
`docs/architecture/frontend.md`, `docs/development/ci.md`,
`docs/development/git-worktrees.md`.

**Records** — BUG-0030 … BUG-0036 created, BUG-0021 and ITEM-0011 updated,
ITEM-0025 … ITEM-0027 created.

## Context-update recommendations not actioned here

- `docs/environment-variables.md` and three `apps/agent-desktop/.env*.example`
  files still name `/api/agent/updates`. Left in place deliberately: changing
  them without deciding the update model would replace a visibly wrong value
  with a differently wrong one. Owned by
  [[BUG-0033-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]].
- `docs/environment-variables.md` describes `apps/landing` as reading
  `NEXT_PUBLIC_LANDING_APP_URL` and `NEXT_PUBLIC_WEB_APP_URL` directly. It reads
  `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_ORIGIN`; the others are consumed
  inside `@repo/config`. Minor, and outside the three-app scope.

## Related

[[monorepo-application-map]] · [[landing-website]] · [[desktop-agent]] ·
[[docs-application]] · [[desktop-api-gateway-relationship]]
</content>
