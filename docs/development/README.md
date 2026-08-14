# Development

How to work in the DijiPeople monorepo.

| Document | Scope |
|---|---|
| [`parallel-work.md`](parallel-work.md) | When work may run in parallel and when it must not |
| [`git-worktrees.md`](git-worktrees.md) | Branch naming, worktrees, review and integration |
| [`skills-assessment.md`](skills-assessment.md) | Recurring patterns worth automating as Skills |

Behavioural rules for AI agents: [`../../AGENTS.md`](../../AGENTS.md).
Planning contract: [`../../PLANS.md`](../../PLANS.md).
Agent roles: [`../../.agent/agents/`](../../.agent/agents/).

---

## Prerequisites

- Node **22.x**, npm **11.x** (enforced by `engines` in the root `package.json`)
- PostgreSQL reachable via `DATABASE_URL`
- .NET SDK, only if working on `gateway/` or `tools/zkteco-poc/worker`

```bash
npm install     # from the repository root — npm workspaces
```

---

## Running locally

Default ports come from `packages/config/index.js`:

| App | Port | Command |
|---|---|---|
| `apps/landing` | 3000 | `npm run dev:landing` |
| `apps/web` | 3001 | `npm run dev:web` |
| `apps/admin` | 3002 | `npm run dev:admin` |
| `apps/docs` | 3003 | `npm --workspace docs run dev` |
| `services/api` | 4000 (`/api`) | `npm run dev:api` |

`npm run dev` runs everything through Turborepo.

Environment examples live in `.env.example` / `.env.development.example` at the
root and per app. See [`../environment-variables.md`](../environment-variables.md).

---

## Command reference

These commands exist. **Do not invent others.**

### Repository root

```bash
npm run lint                  # turbo run lint
npm run typecheck             # turbo run check-types  (alias: check-types)
npm run build                 # turbo run build --concurrency=1
npm run test:runtime-schema    # node --test packages/config/platform-runtime-schema.test.js
npm run generate:runtime-schema
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:status
npm run smoke:deployment
npm run gateway:build         # dotnet build gateway/DijiPeople.Gateway.sln -c Release
npm run gateway:test          # dotnet test  gateway/DijiPeople.Gateway.sln -c Release
```

### API

```bash
npm --workspace api run test          # jest, colocated *.spec.ts
npm --workspace api run test:e2e      # test/*.e2e-spec.ts
npm --workspace api run test:cov
npm --workspace api run check-types
npm --workspace api run lint
npm --workspace api run format
npm --workspace api run prisma:migrate:dev     # LOCAL database only
npm --workspace api run prisma:migrate:deploy
npm --workspace api run prisma:studio
```

### Frontends

```bash
npm --workspace web   run test
npm --workspace web   run check-types
npm --workspace web   run lint
npm --workspace admin run test
npm --workspace admin run check-types
npm --workspace landing run check-types
```

### Seeds

```bash
npm run seed:config       # production-safe system configuration
npm run seed:verify       # asserts the configuration seed
npm run seed:admin        # platform super admin from env vars
npm run seed:platform-workflows
npm run seed:demo         # demo tenant data — NOT for production
npm run seed:demo:reset
npm run seed:demo:reseed
npm run seed:payroll-flow
npm run seed:all          # admin → config → platform-workflows → demo
```

See [`../seed-architecture.md`](../seed-architecture.md).

### Release

```bash
npm run release:api    # migrate:deploy → seed:config → seed:verify → seed:admin
npm run release:web
npm run release:admin
```

---

## CI

`.github/workflows/ci.yml` runs eight required jobs — framework validation,
typecheck, lint, four test suites and the build — aggregated into a single
`CI required gate` status, plus two non-gating known baselines. Full detail in
[`ci.md`](ci.md); branch-protection settings in
[`branch-protection.md`](branch-protection.md).

Consequences you must act on:

- **CI runs on push, not locally.** Run the relevant validation yourself before
  pushing; nothing runs it for you until then.
- **A local pass is not a CI pass** — different Node build, filesystem and cache.
  Where CI is available, its verdict gates the merge.
- **Two checks are deliberately non-gating** known baselines. Green means no new
  regression in the gated set, not that everything is clean.
- **Never bypass a red required gate.** Classify the failure first — see the
  failure-classification table in [`ci.md`](ci.md).

---

## Deployment

- API → **Render**, configured by [`../../render.yaml`](../../render.yaml)
  (`preDeployCommand: npm --workspace api run release`)
- Next.js apps → **Vercel**
- Database → **Neon PostgreSQL**

Checklist: [`../../DEPLOYMENT_CHECKLIST.md`](../../DEPLOYMENT_CHECKLIST.md).
Environment matrix: [`../environment-variables.md`](../environment-variables.md)
and [`../deployment-env-checklist.md`](../deployment-env-checklist.md).

Post-deploy smoke: `npm run smoke:deployment`.
