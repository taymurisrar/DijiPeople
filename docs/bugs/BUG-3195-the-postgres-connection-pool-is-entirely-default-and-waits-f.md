---
ID: BUG-3195
aliases: [BUG-3195]
Title: The Postgres connection pool is entirely default and waits forever for a connection
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3195 — The Postgres connection pool is entirely default and waits forever for a connection

> **Architect triage, 2026-09-11 — `FIX_NOW`.** An unbounded default pool that waits forever is a few lines of configuration and is the first thing that breaks under load. Cheapest high-value item in this list.

## Summary

The Postgres connection pool is entirely default and waits forever for a connection

Identified by the 2026-09-10 full technical audit as RES-01 (confidence: RES-01=CONFIRMED (that no pool configuration is passed); LIKELY (on the exact `pg` default values, which I read from the library contract rather than by executing)).

## Expected Behavior

an explicit `max` sized to the Neon plan, a bounded
  `connectionTimeoutMillis` (2–5 s) so pool starvation surfaces as a fast 503
  rather than an unbounded hang, and a `statement_timeout` so no single query
  can hold a connection indefinitely.

## Actual Behavior

the process runs on `pg`'s defaults — `max: 10`
  connections and `connectionTimeoutMillis: 0`, which means "wait indefinitely
  for a free connection". No server-side `statement_timeout` is set either, so a
  single runaway query runs until Postgres or the network kills it.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-01** (`services/api/src/common/prisma/prisma.service.ts`):

`services/api/src/common/prisma/prisma.service.ts:29` —
  ```ts
  adapter: new PrismaPg({ connectionString }),
  ```
  That is the entire pool configuration. `PrismaPg` forwards its options to a
  `node-postgres` `Pool`; nothing here sets `max`, `connectionTimeoutMillis`,
  `idleTimeoutMillis`, `statement_timeout` or `query_timeout`.

  A repository-wide search finds no such settings anywhere:
  ```
  $ grep -rn "connection_limit|pool_timeout|statement_timeout" . --exclude-dir=node_modules
  (no matches)
  ```
  Note also that `connection_limit=` in a `DATABASE_URL` is a **Prisma query
  engine** parameter and is *not* honoured on the driver-adapter path, so even
  setting it in the Render dashboard would have no effect.

---


Full finding text: RES-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

this is the single mechanism by which one slow thing takes the whole
  API down. Ten concurrent requests that each hold a connection for a long time
  — a payroll calculation (RES-02), a 120-second tenant erasure
  (`tenant-control-plane/tenant-erasure.service.ts:230`), an unbatched retention
  delete (RES-13, RES-24) — exhaust the pool. Every subsequent request then
  waits *forever* on connection acquisition rather than failing fast. Requests
  pile up, Node's memory grows with the queued handlers, and the instance
  becomes unresponsive without ever emitting an error the exception filter can
  turn into a 503. Health checks still pass (RES-04), so Render keeps the dead
  instance in rotation.

## Affected Areas

services/api/src/common

## Proposed Resolution

in `PrismaService`'s constructor, pass an explicit pool
  config to `PrismaPg`: `max` (start at 10–15, matched to the Neon compute
  size), `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`, and
  `options: '-c statement_timeout=30000'` (raise per-call for the two long
  transactions that legitimately need it). Make the values env-tunable and
  register them in `packages/config` validation and `render.yaml`.

(Difficulty: LOW; Regression risk: MEDIUM — a `statement_timeout` will start failing the
  long operations that currently succeed slowly. Set it after measuring, and
  exempt `tenant-erasure` and the payroll calculation explicitly.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/common/prisma/prisma.service.ts` (audit id RES-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-01=MEDIUM — a `statement_timeout` will start failing the
  long operations that currently succeed slowly. Set it after measuring, and
  exempt `tenant-erasure` and the payroll calculation explicitly.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-01) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
