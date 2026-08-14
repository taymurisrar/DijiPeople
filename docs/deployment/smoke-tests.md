# Deployment Smoke Tests

Run after every deployment, before declaring success. Scenarios are chosen
**before** deploying, not improvised afterwards.

> **Do not perform destructive mutations against production.** No safe
> production test-tenant mechanism currently exists, so production smoke testing
> is read-only. Mutation scenarios run in non-production only.

## Automated

```bash
SMOKE_API_BASE_URL="https://<api-host>/api" \
SMOKE_LOGIN_EMAIL="<smoke user>" \
SMOKE_LOGIN_PASSWORD="<secret>" \
SMOKE_ORIGIN="https://<web-host>" \
npm run smoke:deployment
```

`scripts/smoke-deployment.mjs` falls back to `http://127.0.0.1:4000/api` when
`SMOKE_API_BASE_URL` is unset — **verify the target before trusting a pass.** A
green local run proves nothing about production.

## Scenarios

| ID | Scenario | Type | Expected | Prod-safe |
|---|---|---|---|---|
| S1 | `GET /api` | health | 200 with `app, status, environment, version` | yes |
| S2 | API process started | startup | Boot gates passed; no `assertAuthEnvironment` failure in logs | yes |
| S3 | Database connectivity | dependency | An authenticated read returns data — **not** the health endpoint, which does not test the DB | yes |
| S4 | Login | auth | Valid credentials return tokens; cookies carry the right domain | yes |
| S5 | Session rejection | auth | A tampered or expired token is refused | yes |
| S6 | Landing loads | frontend | 200, renders | yes |
| S7 | Web authenticated shell | frontend | Loads; navigation renders; feature availability resolves | yes |
| S8 | Admin loads | frontend | Loads for a platform user | yes |
| S9 | Tenant context | multi-tenancy | A tenant user sees only their tenant's data | yes |
| S10 | Feature availability | config | `/tenant-settings/features/availability` returns enabled keys | yes |
| S11 | Critical read | API | Employee list returns for an authorized role | yes |
| S12 | CORS | config | Browser request from the web origin succeeds with credentials | yes |
| S13 | Critical mutation | API | Create/update round-trips | **non-prod only** |
| S14 | Email delivery | integration | A transactional email is delivered | **non-prod only** |
| S15 | Migration state | database | `npm run prisma:migrate:status` shows nothing pending | yes |

S3 exists because S1 cannot fail: the health endpoint returns a hardcoded `ok`
and tests no dependency. **Never treat S1 alone as proof of a healthy system.**

## On failure

Stop release progression and classify:

| Class | Signal |
|---|---|
| `APP_FAILURE` | Process crashes, 5xx on healthy input |
| `CONFIG_FAILURE` | Wrong URL, CORS rejection, missing variable |
| `DEPENDENCY_FAILURE` | Database or SMTP unreachable |
| `MIGRATION_FAILURE` | `preDeployCommand` failed, or schema drift |
| `INTEGRATION_FAILURE` | Stripe, gateway or device path broken |

Then decide rollback versus forward fix using the rollback class, and record the
outcome in the release record and a deployment QA run.
