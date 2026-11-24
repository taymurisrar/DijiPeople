# DP-MASTER performance and cost budgets (WP-01.S2)

Measured 2026-11-25 on the owner's workstation (Windows, Node 22.23.4, private Postgres 18)
and from GitHub Actions run history. Budgets are proposals set at roughly 1.3-1.5x the
measurement so a regression is visible; they are not service-level promises.

| Measure | Measured | Budget (fail above) | Source |
|---|---|---|---|
| CI exact-SHA wall time (all required jobs) | 17-21 min over 4 runs | 25 min | `gh run list` |
| API unit suite | 526 suites / 9,137 tests, 170 s | 240 s | `jest` full run |
| Desktop agent unit suite | 9 suites / 136 tests, 17 s | 30 s | `jest --config jest.config.js` |
| Fresh `migrate deploy` (246 migrations) | 32 s (while jest ran) | 60 s | `prisma migrate deploy` |
| `seed:demo` | 20 s | 40 s | `ts-node prisma/seed-demo.ts` |
| Full database e2e suite | see program-state G3 evidence | CI timeout 30 min | `jest --config test/jest-e2e.json` |
| Access-revocation sweep | batch 200 employees per 5 min tick | one query + 3 writes per revoked user | WP-08.S0b design |
| Workflow condition evaluation | O(conditions), no I/O | no database access | `workflow-conditions.ts` |

## Not measured (stated, not guessed)

- API request latency and throughput (T-SCALE, 250 employees) need a running API under load;
  no number is claimed. Required before any R4+ release claim.
- Web typecheck and `next build` wall time: typecheck passed; build time not recorded.
- Neon/Render production cost and quota effects: out of scope; no PROD access used.

## Cost rules for the program

- No new paid infrastructure. Background work reuses the in-process workers and the existing
  outbox; no new queue or service.
- Each push cancels the in-flight CI run (~20 min): batch commits, validate locally first
  (framework validation, data-model check, derived facts, dashboards, backlog check).
