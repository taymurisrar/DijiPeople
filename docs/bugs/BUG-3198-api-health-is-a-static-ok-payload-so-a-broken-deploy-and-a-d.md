---
ID: BUG-3198
aliases: [BUG-3198]
Title: api/health is a static ok payload, so a broken deploy and a dead database both report healthy
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-728
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: b7ddb808
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-24
---

# BUG-3198 — api/health is a static ok payload, so a broken deploy and a dead database both report healthy

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A static ok health check cannot distinguish a healthy deploy from a dead database — and this session relied on that endpoint to verify a deploy. ITEM-0009 has the ExecPlan.

## Summary

api/health is a static ok payload, so a broken deploy and a dead database both report healthy

Identified by the 2026-09-10 full technical audit as RES-04 (confidence: RES-04=CONFIRMED).

## Expected Behavior

liveness and readiness should be separate. Readiness
  should at minimum execute `SELECT 1` (with its own short timeout) and report
  whether each enabled worker has ticked within a multiple of its poll interval.

## Actual Behavior

the endpoint answers `200 {"status":"ok"}` as long as
  the Node process is alive. It is a liveness probe, and Render is using it as
  the deploy gate and the rotation gate.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-04** (`services/api/src/main.ts`, `services/api/src/config/env.validation.ts`, `render.yaml`):

`render.yaml:35` — `healthCheckPath: /api`
  `services/api/src/main.ts:87-89`:
  ```ts
  expressApp.get('/', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api/health', (_req, res) => res.json(healthPayload()));
  ```
  and the payload — `services/api/src/config/env.validation.ts:227-241`:
  ```ts
  export function getRuntimeHealthPayload(env: NodeJS.ProcessEnv) {
    ...
    return { app: 'dijipeople-api', status: 'ok', environment: ..., commit, ... };
  }
  ```
  `status` is a string literal. Nothing in the handler touches Prisma, and the
  only dynamic field beyond the commit is `outboxWorker.enabled`, which reports
  a *config flag*, not whether the worker is actually ticking.

---


Full finding text: RES-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

three concrete consequences. (1) A deploy whose database is
  unreachable is marked successful and takes traffic. (2) An instance that has
  exhausted its connection pool (RES-01) stays in rotation, because the health
  route never asks for a connection. (3) A worker that stopped ticking — the
  outbox, the report scheduler — is invisible; the memory record
  `merging-main-does-not-guarantee-deploy` already shows the team verifying
  deploys by reading the commit hash off this endpoint, which is exactly the
  signal it *does* carry and the only one.

## Affected Areas

services/api/src/common

## Proposed Resolution

add `GET /api/health/ready` that runs
  `prisma.$queryRaw\`SELECT 1\`` under a 2-second timeout and reports each
  worker's `lastTickAt`, returning 503 when the database is unreachable. Point
  `render.yaml`'s `healthCheckPath` at it. Keep `/api` as the cheap liveness
  probe.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/main.ts`, `services/api/src/config/env.validation.ts`, `render.yaml` (audit id RES-04).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-04=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Commit b7ddb808. `services/api/src/common/health/readiness.ts` runs a database probe under a 3 s timeout and reports ready or not; `GET /api/health/ready` in `main.ts` answers 503 when the probe fails or times out, never leaks the driver message, and shares one in-flight probe between callers. `liveness.ts` serves `GET /api/health/live` from no dependency at all. `readiness.spec.ts` and `liveness.spec.ts` assert these. Verified by running jest on `src/common/health` (all pass; 19 tests across the three suites with the pool spec).

Residuals, stated honestly: `render.yaml` `healthCheckPath` intentionally stays `/api` (liveness-style), so Render still does not gate a deploy or rotation on the database, which avoids a restart loop on a database blip; the ready route is for monitors and operators. Per-worker `lastTickAt` is not reported, so a stalled outbox or scheduler remains invisible. Tracked as ITEM-0242.

## QA Retest

QA-PLATFORM-071 (automated unit scenario). Mutation-proved 2026-11-24: forcing ready true fails 2 of 9 health tests. A live database outage was not exercised.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-04) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]]
- Regression — REG-728 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation) after mutation proof.
