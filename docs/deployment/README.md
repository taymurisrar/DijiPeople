# Deployment

How DijiPeople is built, validated, released and rolled back.

Architecture of record: [`.agent/context/deployment-runtime.md`](../../.agent/context/deployment-runtime.md).
Owning agent: [`.agent/agents/release-devops.md`](../../.agent/agents/release-devops.md).

| Document | Purpose |
|---|---|
| [`environments.md`](environments.md) | What environments exist, and what is configured where |
| [`readiness-checklist.md`](readiness-checklist.md) | The gates, and the readiness levels |
| [`deployment-runbook.md`](deployment-runbook.md) | Executing a release |
| [`rollback-runbook.md`](rollback-runbook.md) | Undoing one, by change class |
| [`smoke-tests.md`](smoke-tests.md) | Post-deploy verification scenarios |
| [`incident-response.md`](incident-response.md) | When a deploy goes wrong |
| `release-history/` | One record per deployment |

---

## Readiness levels

| Level | Meaning |
|---|---|
| **BLOCKED** | Cannot proceed — a build fails, a required secret is missing, or a gate cannot be evaluated |
| **NOT_READY** | Known failures: QA FAIL, unresolved CRITICAL/HIGH, broken build |
| **READY_WITH_RISKS** | Deployable with explicitly stated, accepted risks |
| **READY_FOR_STAGING** | All gates pass for a non-production target |
| **READY_FOR_PRODUCTION** | Every condition in the checklist holds |

`npm run build` succeeding is **one** of eleven conditions, not readiness.

## Deployment state machine

```
PLANNED → BUILDING → VALIDATING → READY → DEPLOYING → DEPLOYED → VERIFYING
   → SUCCESS | FAILED | ROLLED_BACK | PARTIAL_FAILURE
```

Release records document the transitions actually taken, including failures.

---

## What must be enabled before autonomous production deployment

This repository has **no established autonomous production deployment policy**.
Release/DevOps prepares and validates, but does not deploy production on its own.
Enabling that requires, at minimum:

1. **CI** — nothing currently validates a commit before it reaches a target
   (`docs/development/ci-recommendation.md`).
2. **Deployment credentials** available to the agent environment, with a written
   policy stating which environments an agent may deploy to.
3. **A readiness probe** that verifies dependencies — the current health check
   returns a hardcoded `ok` and cannot detect a failed deployment.
4. **Deployed-SHA visibility**, so a release record can be verified against the
   running system.
5. **Committed frontend deployment configuration** — web, admin and landing are
   not currently reproducible from a clean clone.
6. **A staging environment** to promote through.

Until those exist, production deployment is a human action following
[`deployment-runbook.md`](deployment-runbook.md).
