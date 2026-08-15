---
ID: ITEM-0009
aliases: [ITEM-0009]
Title: No observability platform exists, so a release cannot be verified from outside
Type: INFRA
Status: TRIAGE_REQUIRED
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api, apps/web, apps/admin]
Source: DEPLOYMENT
OwnerAgent: release-devops
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0009 — No observability platform exists, so a release cannot be verified from outside

## Summary

There is no Sentry, Datadog, OpenTelemetry, Prometheus or log-shipping
dependency anywhere in this repository. What exists is `/api/health`, a second
health endpoint under billing, and Render's own console.

## Why It Matters

After a deployment, Release/DevOps should be able to verify: deployed SHA, API
health, frontend availability, database health, integration failures,
application errors and release-related error spikes. It can verify roughly two
of those.

Worse, Render's `healthCheckPath: /api` **can report healthy while the database
is unreachable** — so the one automated signal that does exist can be green
during an outage. Every release report has to state that limitation, which is
honest but does not fix it.

## Evidence

Verified at `main` `ad8f77f`: no `@sentry`, `datadog`, `opentelemetry` or
`prom-client` dependency in the root, API or app `package.json` files.
`.agent/agents/release-devops.md`, "Observability expectations": *"Current
capability: almost none."*
`.agent/context/deployment-runtime.md` records the health-check caveat.

## Proposed Approach

Smallest useful step first, and **not** an observability platform build — the
Release/DevOps role explicitly forbids taking that on inside a release task.
Ordered by value per unit of work:

1. Expose the deployed SHA from the API (tracked separately as [[ITEM-0010]]).
2. Make the health check actually touch the database, so green means something.
3. Then, and only then, consider error aggregation — with an ADR, because it is
   a dependency added to four deployables.

## Acceptance Criteria

A release report can state, from outside the system, which SHA is serving and
whether the database is reachable — without opening the Render console.

## Dependencies

None. [[ITEM-0010]] is the first step of this item and is tracked separately
because it is independently valuable and much smaller.

## Related Items

[[ITEM-0010]] · architecture [[deployment-architecture|Deployment Architecture]] ·
`docs/deployment/smoke-tests.md` · `docs/development/agent-tooling-matrix.md`,
where the gap is recorded as a capability.

## History

- 2026-08-15 — imported from the standing observability gap recorded in the
  Release/DevOps role and the deployment-runtime context.
