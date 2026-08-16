# QA Run — Production URL integrity (BUG-0026)

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `344a832` |
| **Branch** | `agent/production-url-integrity` |
| **Scope** | Cross-app URL resolution across `packages/config`, `apps/landing`, `apps/web`, `apps/admin`, `services/api` |
| **Trigger** | User report: the public "Login" button routed to localhost in production |
| **Result** | PASS — with one finding fixed during the run and one deferred |

---

## What was tested

The reported symptom, its root cause, and the whole defect class it belongs to
— not only the one link that was reported.

## Scenarios

### A — Root cause confirmation (pre-fix, at `344a832`)

| id | Scenario | Result |
|---|---|---|
| A1 | `site-shell.tsx` resolves the login href at module scope, ending in a loopback literal | **CONFIRMED** — `apps/landing/app/_components/site-shell.tsx:13-16` |
| A2 | `NEXT_PUBLIC_APP_PORTAL_URL`, the second fallback, is defined somewhere | **REFUTED** — appears at exactly one site in the repository: the fallback chain itself. Not in `turbo.json` `globalEnv`, not in any `.env*.example`, not in `docs/environment-variables.md`. Always `undefined` |
| A3 | `validateDeploymentEnv` requires the cross-app URLs for a frontend | **REFUTED** — `packages/config/index.js:187-189` required only `NEXT_PUBLIC_API_BASE_URL` |
| A4 | `getAppOrigin` would have thrown had it been used | **CONFIRMED** — `packages/config/index.js:105-121` throws in production-like environments. All seven call sites bypassed it |
| A5 | The class is broader than the reported link | **CONFIRMED** — six further sites, including `services/api/src/common/config/tenant-url.config.ts:59`, which builds **customer activation and invitation email links** |
| A6 | The new regression suite fails against unfixed code | **CONFIRMED** — 10 of 13 fail when `packages/config/index.js` is restored to `origin/main` |

### B — Fix verification (post-fix)

| id | Scenario | Result |
|---|---|---|
| B1 | Production build of `landing` **without** `NEXT_PUBLIC_WEB_APP_URL` fails | **PASS** — exit 1: *"NEXT_PUBLIC_WEB_APP_URL or … must be configured in production — the landing deployment emits links to the web app and would otherwise fall back to http://localhost:3001."* |
| B2 | Production build of `landing` **with** the full config succeeds | **PASS** |
| B3 | The built artifact carries the real URL | **PASS** — `https://app.dijipeople.com/login` present in `.next/server` output |
| B4 | No loopback href survives in the built artifact | **PASS** — the only remaining `localhost:3001` in the bundle is the `buildWorkspaceUrl` code-path fallback, not an emitted href. Recorded as ITEM-0017 |
| B5 | Loopback, malformed and non-HTTP values are rejected in production | **PASS** — `npm run test:app-urls`, 14/14 |
| B6 | A frontend configured with only `NEXT_PUBLIC_API_BASE_URL` (no `API_ORIGIN`) builds | **PASS** — after the fix described under Findings |
| B7 | Local `npm run build` and CI, which set neither `APP_ENV` nor `VERCEL`, still build | **PASS** — full `npm run build` green, 6/6 tasks |
| B8 | The API mailer path refuses a loopback fallback in production | **PASS** — `services/api/src/common/config/tenant-url.config.spec.ts` |
| B9 | A reintroduced loopback literal is caught | **PASS** — probe file added, `check:no-hardcoded-urls` exits 1; removed, exits 0 |

### C — Local validation

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — 8/8 workspaces |
| `npm run build` | **PASS** — 6/6 tasks |
| `npx eslint` (web, admin, landing) | **PASS** — 0 errors (24 pre-existing warnings, unchanged) |
| `npm --workspace api run test` (CI's exclusion pattern) | **PASS** — 147 suites, 1017 passed, 1 skipped |
| `npm --workspace web run test` | **PASS** — 17 suites, 391 tests |
| `npm --workspace admin run test` | **PASS** — 9 suites, 71 tests |
| `npm run test:app-urls` | **PASS** — 14 |
| `npm run test:platform-domains` | **PASS** — 13 |
| `npm run test:runtime-schema` | **PASS** — 3 |
| `npm run test:release-cli` | **PASS** — 19 |
| `npm run check:no-hardcoded-urls` | **PASS** |

`BROWSER_E2E = NOT_RUN` — the reported symptom is a build-time inlining defect,
and B1–B4 verify it against real build artifacts, which is stronger evidence
than a browser assertion against a dev server would be.

`PRODUCTION_BEHAVIOUR = NOT_OBSERVED` — no deployment was made from this branch.
B1–B4 verify the build; the deployed result must be re-checked after release.

---

## Findings

### F1 — `resolveAppUrls` demanded `API_ORIGIN` from frontends — **FIXED**

Severity LOW (introduced and fixed within this run; never on `main`).

The first implementation of `resolveAppUrls` called `getAppOrigin("api", env)`,
which requires `API_ORIGIN`. A browser-facing deployment configures
`NEXT_PUBLIC_API_BASE_URL` and has no reason to set `API_ORIGIN`, so a
correctly-configured landing build failed with *"API_ORIGIN must be configured
in production"*.

Caught by scenario B2 — running the real build, not by the unit tests that
existed at that point, all of which passed. The API origin is now derived from
the resolved base URL. Covered by a named regression test.

### F2 — `buildWorkspaceUrl` retains an internal loopback fallback — **DEFERRED**

Severity LOW. `packages/config/platform-domains.js:337`. Unreachable from
production code: both call sites now pass a `developmentOrigin` resolved through
`getAppOrigin`. Deferred rather than fixed because the guard would sit in
hostname resolution — the code that decides which tenant a request belongs to,
and the subject of BUG-0017 — and because `resolvePlatformEnvironment` treats
bare `NODE_ENV=production` as production, which the CI build job sets.

Recorded as ITEM-0017 with the reasoning and acceptance criteria.

---

## Finding classification

| Finding | Disposition | Record |
|---|---|---|
| Reported defect (login → localhost) | `FIXED` | BUG-0026, REG-016 |
| F1 — `API_ORIGIN` over-requirement | `FIXED` | REG-016 (named test) |
| F2 — `buildWorkspaceUrl` fallback | `DEFERRED` | ITEM-0017 |

## Follow-up required

**Before the next production deploy of any frontend**, confirm the canonical app
URLs are set in each Vercel/Render project. The stricter validation means a
deployment missing one now **fails its build** rather than shipping a dead link
— which is the intended behaviour, but it will surface as a failed deploy rather
than a silent one. See `docs/environment-variables.md`.
