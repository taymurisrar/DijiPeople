# AGENTS.md — `packages/config` (`@repo/config`)

Scope-specific rules for the shared runtime configuration package. Read the root
[`AGENTS.md`](../../AGENTS.md) first.

---

## What this package is

`@repo/config` is **plain CommonJS JavaScript with hand-written `.d.ts` files
and no build step.** It is consumed by `services/api` (a TypeScript NestJS app)
and by all three Next.js apps. That is why it is JS: it must be importable from
everywhere without compilation.

```
index.js / index.d.ts                    ports, origins, CORS, env validation
platform-runtime-schema.js / .d.ts       platform runtime field contract
platform-runtime-schema.generated.json   GENERATED — do not hand-edit
platform-runtime-views.js / .d.ts        platform runtime view definitions
system-widget-registry.js                dashboard widget registry
*.test.js                                node:test suites
```

Rules:

- **Keep it JavaScript.** Do not convert files to TypeScript or add a build
  step; that would break `services/api`'s runtime import path.
- Keep `.d.ts` files in sync with the `.js` by hand. A missing type is a silent
  `any` in three apps.
- Everything here is imported at process start by `main.ts`
  (`validateDeploymentEnv`) — it must have **no side effects beyond pure
  computation** and no dependencies outside Node built-ins.

---

## Ports, origins and environment

`index.js` is the single source of truth for local ports and app URLs:

- `DEFAULT_LOCAL_PORTS` — landing 3000, web 3001, admin 3002, api 4000.
  **There is no `docs` key**, and none in `PRODUCTION_APP_URLS` either, so
  `apps/docs` is the one application whose port (3003) is hardcoded in its own
  `package.json` rather than resolved from here. This line previously listed
  "docs 3003" as a member; corrected 2026-08-16 at `78072d2`.
- `PRODUCTION_APP_URLS`, `APP_PORT_ENV_KEYS`, `APP_URL_ENV_KEYS`
- `getAppPort`, `getAppOrigin`, `getApiBaseUrl`, `getAllowedCorsOrigins`,
  `getAppStage`, `isProductionLike`, `getLocalArchitecture`
- `validateDeploymentEnv(env, { app })` — called at boot by the API and used by
  the apps; a missing required variable fails startup deliberately.

**Never hardcode a localhost URL or a port number anywhere in the monorepo.**
Import from here.

### Adding an environment variable

A new variable is not "added" until all of these are done:

1. Read it here (or in the API's `src/config/env.validation.ts` if it is
   API-only) — never `process.env.FOO` scattered through feature code.
2. Add it to `validateDeploymentEnv` if it is required, so a missing value fails
   fast instead of failing mysteriously at request time.
3. Add it to `turbo.json` `globalEnv`, or Turborepo will cache across differing
   values.
4. Add it to `render.yaml` (API) and note it for Vercel (Next apps).
5. Document it in [`docs/environment-variables.md`](../../docs/environment-variables.md)
   and, if deployment-relevant, [`DEPLOYMENT_CHECKLIST.md`](../../DEPLOYMENT_CHECKLIST.md).
6. Add it to the relevant `.env.example` files.

Client-visible values **must** be `NEXT_PUBLIC_*` and must contain nothing
secret.

---

## Platform runtime schema

`platform-runtime-schema.generated.json` is produced by:

```bash
npm run generate:runtime-schema      # scripts/generate-platform-runtime-schema.mjs
```

It is derived from the Prisma schema and the platform runtime module registry.

- **Never hand-edit the generated JSON.** Change the source (Prisma models or the
  platform runtime module definitions) and regenerate.
- After regenerating, run:
  ```bash
  npm run test:runtime-schema
  ```
  It asserts that every registered platform runtime module's fields exist in
  Prisma, and that sensitive and system-managed fields are neither writable nor
  exportable. **A field that becomes writable or exportable here is a data
  exposure change** — treat a diff in that direction as requiring explicit
  review, not a mechanical regeneration.
- A Prisma model change that touches a platform-runtime-exposed model requires
  regeneration in the same change, or the admin app and the API drift.

---

## Testing

```bash
npm run test:runtime-schema   # node --test packages/config/platform-runtime-schema.test.js
```

Other suites here run the same way:

```bash
node --test packages/config/platform-runtime-views.test.js
node --test packages/config/system-widget-registry.test.js
node --test packages/config/widget-runtime-contract.test.js
```

These use `node:test` (no jest). Keep new tests in that style — the package has
no test framework dependency and should not gain one.
