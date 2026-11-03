# DP-QA-048 — `smoke:deployment` cannot sign in: its Starter behavioural probe (and every login-based smoke check) sends no tenant context, so `/auth/login` answers "Company or tenant context is required"

| Field | Value |
|---|---|
| Category | Deployment safeguard / release tooling |
| Severity / Priority | Low / **P3** (the health-based enforcement check, which is the DP-QA-005 gate, works; the optional behavioural proof does not) |
| Status | **Fix available on a branch, not merged** (`agent/smoke-tenant-login`, `f6c1bfbd`; validated against a compiled API) |
| Found | RUN-008 (`4dd29d3a`), tests DPQA-GATE-008 (fails, assertion unchanged) and GATE-006 (passes); `tools/login-variants.mjs` |
| Evidence | `evidence/RUN008-gate-enforced.md`, `evidence/RUN008-measurements.md` (GATE-006/008), `login-variants.mjs` output below |

**Reproduction.** Start the API with `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE`. Run `SMOKE_API_BASE_URL=<api>/api SMOKE_ORIGIN=<tenant web origin> SMOKE_STARTER_LOGIN_EMAIL=<owner of a Starter tenant> SMOKE_STARTER_LOGIN_PASSWORD=<its password> npm run smoke:deployment` from the application worktree.

**Observed.** `ok - plan entitlements are enforced, not merely logged`, then `not ok - a Starter tenant is refused a module its plan does not include: Starter login: expected 2xx, got 401`. The same 401 fails `auth login works`, `authenticated profile works` and all four `major module list endpoint` checks whenever the credentials are those of a tenant user.

**Why.** `POST /api/auth/login` requires tenant context in the body (`tenantSlug`, `tenantCode`, `domain`, `host`) or `tenantId`; the smoke script posts only `{ email, password, rememberMe }` and relies on the `Origin` header, which the API does not read for sign-in. Measured on the isolated stack with the same user:

| Request shape | Status |
|---|---|
| `Origin` only, as the smoke script sends | 401 `AUTH_UNAUTHORIZED` "Company or tenant context is required to sign in." |
| `Origin` + `X-DijiPeople-App: web` | 401, same message |
| `X-DijiPeople-App: web` + `tenantSlug` | 201 |
| `Origin` + app header + `tenantSlug` | 201 |

**Impact.** The one check that proves the guard's behaviour (not just the flag the service reports) cannot run, so a deployment whose `/api/health` says `enforced:true` but whose guard misbehaves would not be caught by `smoke:deployment`. The health check itself is verified (GATE-005/006/007); only the optional behavioural probe and the pre-existing login checks are affected.

**Suggested resolution.** Let the smoke script take `SMOKE_TENANT_SLUG` (it already reads it for the workspace-routing check) and send it as `tenantSlug` in every login body.

| Run | Result |
|---|---|
| RUN-008 (`4dd29d3a`) | **OPEN** — GATE-008 fails with the assertion unchanged; the health-based enforcement check passes (GATE-006) |
| Post-deploy verification 2026-11-03 | **FIX VALIDATED ON A BRANCH** — `scripts/smoke-login.mjs` sends `tenantSlug` (`SMOKE_TENANT_SLUG`, `SMOKE_STARTER_TENANT_SLUG`); against a compiled (`nest build`) API the probe passes on a Starter tenant, fails on a Growth tenant, and a missing slug fails with a message naming the variable; 3 unit tests pass. Not merged; production unchanged |
