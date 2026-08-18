# CI metrics

> **Generated — do not edit by hand.**
> `node scripts/ci-metrics.mjs collect --branch develop`
>
> Window: the last 19 completed runs of `.github/workflows/ci.yml` on `develop`.

## Run level

| Metric | Value |
|---|---|
| Median total duration | 8m54s |
| p95 total duration | 28m33s |
| Unexpected cancellation rate | 0% |
| SHAs that ran the full pipeline more than once | 15 |
| Cache hit rate | NOT_OBSERVABLE — not exposed by the Actions REST API (ITEM-0055) |

### Run outcome classes

| Class | Count | Meaning |
|---|---|---|
| `PASS` | 16 | Every required job succeeded. |
| `SUPERSEDED_GATE_PASSED` | 3 | Cancelled by a newer push, but the gate had already passed. **Expected** — still valid evidence. |

## Job level

Sorted by median duration — the top rows are where wall-clock actually goes.

| Job | Runs | Median | p95 | Queue (median) | Failure rate | Flaky |
|---|---:|---:|---:|---:|---:|---|
| Browser e2e | 19 | 8m01s | 12m57s | 2s | 0% | no |
| Database e2e (report only — NOT a gate) | 19 | 4m38s | 25m56s | 2s | 0% | no |
| Build | 19 | 4m22s | 5m15s | 2s | 0% | no |
| Lint (check only) | 19 | 3m28s | 5m40s | 2s | 0% | no |
| Typecheck | 19 | 2m43s | 3m51s | 2s | 0% | no |
| Database migration gate | 19 | 2m27s | 2m43s | 2s | 0% | no |
| API tests | 19 | 1m37s | 5m00s | 2s | 0% | no |
| Web tests | 19 | 54s | 3m20s | 2s | 0% | no |
| Landing tests | 19 | 54s | 1m35s | 2s | 0% | no |
| Admin tests | 19 | 52s | 1m15s | 2s | 0% | no |
| Runtime schema tests | 19 | 51s | 1m18s | 2s | 0% | no |
| Framework validation | 19 | 16s | 47s | 2s | 0% | no |
| CI required gate | 19 | 3s | 4s | 2s | 0% | no |

## Regression triggers

No previous baseline existed, so duration comparisons are not available yet.

| Trigger | Detail |
|---|---|
| `DUPLICATE_RUN_STORM` | 15 SHA(s) ran the full pipeline more than once: f2957aed×2 (develop + agent/landing-legal-surface), e9cad209×2 (develop + agent/consent-legal-knowledge), 2d6cf1a3×2 (develop + agent/database-e2e-determinism), beae0bc9×2 (develop + agent/database-e2e-determinism), 41b23c66×2 (develop + agent/commercial-platform-completion) |

Each firing trigger is the Architect's to triage, exactly like a QA finding: `FIX_NOW`, `PLAN_REQUIRED`, `DEFER`, `PRODUCT_DECISION`, `BLOCKED_EXTERNAL` or `ACCEPTED_RISK`. See [`.agent/context/ci-operations.md`](../../../.agent/context/ci-operations.md).

