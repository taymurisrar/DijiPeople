---
PLAN_ID: PLAN-012
aliases: [PLAN-012]
TITLE: Deployment and Release
AREA: deployment-release
STATUS: CURRENT
MODULES: [scripts, services/api/src/config, services/api/src/modules/app-releases, docs/deployment]
RISK: HIGH
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: PARTIAL
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0026, BUG-0042]
RELATED_REGRESSIONS: [REG-016, REG-018]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-012 — Deployment and Release

## Scope

Release readiness, migration application, configuration validation, deployment smoke checks, and the health surface a release is verified against.

## Risks

- A URL hardcoded rather than configured, producing localhost links in
  production (`BUG-0026`, `REG-016`).
- An environment variable read but never registered in `packages/config`,
  `turbo.json`, `render.yaml` and the docs (`BUG-0042`) — it works locally and
  is absent in production.
- A migration history that does not apply to an empty database, which is exactly
  what a new deployment does.
- Reporting an environment as current because a merge happened.

## Preconditions

A built artifact and access to the target environment's configuration.

## Test Types

`UNIT` and `DEPLOYMENT_SMOKE` run today. `DATABASE` migration verification needs a PostgreSQL instance, which CI provides and this checkout does not.

## Data Requirements

No production data. Smoke checks read public surfaces only.

## Security Cases

Confirm no secret is logged and no configuration endpoint exposes credentials.

## Negative Cases

Missing required variable · unreachable database with a healthy `/api` · a migration that does not apply forward · a release published without a SHA.

## State Transitions

`PLANNED → BUILDING → VALIDATING → READY → DEPLOYING → DEPLOYED → VERIFYING → SUCCESS`, with `FAILED`, `ROLLED_BACK` and `PARTIAL_FAILURE` reachable.

## Integration Cases

Render is the platform. `healthCheckPath: /api` can report healthy while the database is unreachable, so a 200 is not proof the system works.

## Browser Cases

Post-deployment visual confirmation of the landing and login surfaces.

## Regression Links

`REG-016` · `REG-018`
