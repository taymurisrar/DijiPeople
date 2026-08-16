# QA Run — Monorepo application documentation audit (TASK-0002)

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `78072d2` |
| **Branch** | `agent/knowledge-monorepo-app-documentation` |
| **Scope** | `apps/docs`, `apps/landing`, `apps/agent-desktop`, and the API surfaces they depend on |
| **Trigger** | `DijiPeople Task: KNOWLEDGE` — document three undocumented applications |
| **Result** | PASS — seven material findings recorded, all triaged, none fixed in this task |

---

## What was tested

This was a **documentation audit**, so "tested" means *verified against source*,
not *executed*. Where a claim could be executed cheaply it was; where it could
not, the record says so rather than implying otherwise. The distinction is
carried into every bug record's **QA Retest** section.

Two things were executed:

- `apps/docs` was **run** (`npm --workspace docs run dev`) and its route
  requested.
- `node scripts/repo-health.mjs`, `validate-framework.mjs`,
  `rebuild-backlog.mjs` and `rebuild-tasks.mjs` were run.

Everything else was verified by reading source at `78072d2`.

## Scenarios

### A — `apps/docs`

| id | Scenario | Result |
|---|---|---|
| A1 | The app is a stock `create-turbo` starter with no product function | **CONFIRMED** — 4 source files; `<title>` is still `Create Next App` |
| A2 | `GET /` renders without error | **PASS** — executed on port 3003, HTTP 200, starter page returned |
| A3 | `next/image` with a leading-slash-less SVG `src` breaks the page | **REFUTED** — hypothesised from `image-loader.js`, then executed. Next bypasses the optimizer for SVG, emitting a plain relative `<img src>` that resolves against `public/`. **Recorded so nobody re-raises it** |
| A4 | It is the only consumer of `@repo/ui` | **CONFIRMED** — searched every `.ts`/`.tsx`/`.json` outside `node_modules`; three hits, all `apps/docs` or `packages/ui` itself |
| A5 | Its port comes from `@repo/config` | **REFUTED** — `DEFAULT_LOCAL_PORTS` has no `docs` key. 3003 is hardcoded in its own `package.json`. `packages/config/AGENTS.md` claimed otherwise |
| A6 | CI covers it | **PARTIAL** — covered by `typecheck` and `build` via Turborepo; **never linted**, as the `lint` job names only web/admin/landing |

### B — `apps/landing`

| id | Scenario | Result |
|---|---|---|
| B1 | Every `app/api/**/route.ts` proxy's upstream exists and is public | **PASS** — four proxies, all upstreams found, none guarded |
| B2 | No proxy makes an authorization or tenant decision locally | **PASS** — all four are pure forwarders |
| B3 | `POST /public/subscribe` is rate limited | **FAILED** → [[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]] |
| B4 | The API can distinguish landing visitors for rate-limit purposes | **FAILED** → [[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]] |
| B5 | BUG-0021 (`/contact` fabricates lead data) is still reproducible | **CONFIRMED unchanged** — all three fabrications present verbatim; API DTO also unchanged. Scope **widened**: `industry` receives a product-area value, and a third fabrication site exists in `billing.service.ts` |
| B6 | BUG-0028 (hardcoded country→currency) is fixed | **PASS** — `detectRegionCurrency`, `europeanCountries`, `resolveDefaultCurrency` all absent; tombstone comment and regression in place |
| B7 | BUG-0026 (loopback URLs) is fixed | **PASS for the reported defect.** Two same-class residues survive that neither guard can see, because neither is a loopback literal: hardcoded production URLs in `app/robots.ts` and `app/layout.tsx` |
| B8 | Billing is a real Stripe integration, not a stub | **CONFIRMED real** — live SDK creates a Customer and a Checkout Session; activation waits on the webhook |
| B9 | Price is trusted from the client | **REFUTED** — re-read and re-validated server-side |
| B10 | Landing has no tests | **REFUTED** — jest config, 2 specs, and a **required** `test-landing` CI job. Four documents claimed otherwise |
| B11 | Error/loading/not-found boundaries exist | **FAILED** — none anywhere in the app. Not filed: the fetch layer is defensive, so exposure is narrow; recorded in [[landing-architecture]] |

### C — `apps/agent-desktop`

| id | Scenario | Result |
|---|---|---|
| C1 | Electron hardening is correct | **MOSTLY PASS** — `contextIsolation: true`, `nodeIntegration: false`, `webSecurity` default true, no remote content, no `shell.openExternal`, CSP on all three windows. **`sandbox: false`** on all three, mitigated but unjustified |
| C2 | Tokens are stored safely | **PASS** — refresh token in the OS credential vault via `keytar`; access token memory-only; password never persisted |
| C3 | A renderer can forge a `deviceId` | **REFUTED** — overridden by the main process |
| C4 | The app can assert a tenant | **REFUTED** — it never holds or sends a `tenantId`. Tenant isolation is correct by construction |
| C5 | Privacy denials are server-overridable | **REFUTED** — `allowScreenshots`/`allowClipboard`/`allowKeylogging` hardcoded `false` at both type and runtime level |
| C6 | Every desktop API call has a serving route | **FAILED on one** — the `electron-updater` feed → [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] |
| C7 | Agent auth endpoints are rate limited | **FAILED** → [[BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]]. Also confirmed **no global guard exists** (`APP_GUARD`/`useGlobalGuards`: zero matches) |
| C8 | Logout revokes the refresh token | **FAILED** → [[BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token]] |
| C9 | Heartbeat ingestion is idempotent | **FAILED** → [[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] |
| C10 | `.env` or `release/` are committed | **REFUTED** — both gitignored; only `.env*.example` tracked. **A subagent claimed otherwise and was wrong**; verified with `git ls-files` and `git check-ignore` |
| C11 | The installer is signed | **FAILED** — `signAndEditExecutable: false` → [[ITEM-0026]] |
| C12 | `release-app.yml` can publish this app | **FAILED** — offers it as a choice, but `packageCommand`/`artifactDirectory` are `null` and no `--artifact` is passed |
| C13 | Tests exist on either side | **FAILED** — none in the app, none in the `agent` API module, none in `services/api/test/` → [[ITEM-0028]] |

### D — Documentation drift (Phase 13 mechanical verification)

| id | Scenario | Result |
|---|---|---|
| D1 | Context documents' absence claims hold | **FAILED** → [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi]]. Nine false claims across four files |
| D2 | The CI required-job count in the docs matches `ci.yml` | **FAILED** — three documents said "eight"; the gate's `needs` list has **ten**. `ci.md` said "nine" and omitted `test-landing` |
| D3 | The workspace list is accurate | **FAILED** — two context files omitted the `e2e` workspace |
| D4 | Schema/module counts are accurate | **FAILED** — measured 65 modules, 12,211 lines, 292 models, 264 enums, 194 migrations. Both `AGENTS.md` and `system-overview.md` were stale; replaced with an instruction to re-derive rather than a new number to go stale |
| D5 | Every path referenced by the new knowledge notes exists | **PASS** — every backticked repo path in the seven new notes resolved |
| D6 | The frontend deployment target is genuinely unknown | **REFUTED, late.** The repository is silent, but PR #19's own checks report `Vercel – diji-people-landing`, `– diji-people-web` and `– diji-people-admin` deploying on push. `apps/docs` has no Vercel project. Recorded as confirmed-from-CI, not from the repository — the build configuration still cannot be read from a clean clone |

## Findings

Seven material findings, all recorded and all triaged. Four are `HIGH`.

| Finding | Record | Disposition |
|---|---|---|
| `/public/subscribe` unthrottled | BUG-0031 | `PLAN_REQUIRED` |
| Landing proxies collapse the rate-limit key | BUG-0032 | `PLAN_REQUIRED` |
| Agent login unthrottled + cross-tenant enumeration | BUG-0033 | `FIX_NOW` |
| Agent auto-update feed does not exist | BUG-0034 | `PLAN_REQUIRED` |
| Agent logout never revokes | BUG-0035 | `FIX_NOW` |
| Heartbeat double-counts on retry | BUG-0036 | `PLAN_REQUIRED` |
| Context documents deny nine things that exist | BUG-0037 | `FIX_NOW` — **fixed in this task** |

Plus three backlog items: [[ITEM-0026]] (unsigned installer), [[ITEM-0027]] (no
backoff or give-up), [[ITEM-0028]] (no `AGENTS.md`, no tests).

[[BUG-0021-landing-contact-form-fabricates-lead-data]] was **updated, not
re-filed** — it is still open and its scope is now known to be wider.

## Limitations — what this run did not do

Stated plainly, because the bug records depend on it:

- **No request was executed against a running API.** BUG-0031, BUG-0032,
  BUG-0033, BUG-0035 and BUG-0036 are established by reading source. Each
  record's mechanism is unambiguous, but none was observed failing.
- **BUG-0032's two-client reproduction needs two distinct public IPs**, which
  this environment did not have.
- **The desktop agent was not built or run.** No packaging, no installer, no
  Electron runtime. `keytar`'s native rebuild for Electron 39 is unverified.
- **No network request was made to the production host**, so a rewrite serving
  `/api/agent/updates` outside this repository is not excluded — though nothing
  in `render.yaml` provides one.
- **`BROWSER_E2E = NOT_ATTEMPTED`.** The Playwright workspace exists and covers
  landing, but running it needs a seeded database and three servers, and no
  behaviour changed in this task.

## Validation

```
node scripts/repo-health.mjs          PASS  (pre and post)
node scripts/validate-framework.mjs   PASS
node scripts/rebuild-backlog.mjs      clean — 0 awaiting triage
node scripts/rebuild-tasks.mjs        clean
npm --workspace docs run dev          served GET / → 200
```

No product code was changed, so no test suite was re-run. The `KNOWLEDGE`
routing rule permits exactly one code-adjacent action — correcting verified
documentation drift — and that is all that was done.

## Related

[[monorepo-application-map]] · [[landing-website]] · [[landing-architecture]] ·
[[desktop-agent]] · [[desktop-agent-architecture]] ·
[[desktop-api-gateway-relationship]] · [[docs-application]]
