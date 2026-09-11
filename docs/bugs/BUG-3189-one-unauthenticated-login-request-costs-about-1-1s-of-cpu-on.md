---
ID: BUG-3189
aliases: [BUG-3189]
Title: One unauthenticated login request costs about 1.1s of CPU on a single-instance API
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3189 — One unauthenticated login request costs about 1.1s of CPU on a single-instance API

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** 1.1 seconds of CPU per unauthenticated login on a single instance is a denial-of-service primitive. The fix is a cost parameter and a shape change, and getting it wrong locks everyone out.

## Summary

One unauthenticated login request costs about 1.1s of CPU on a single-instance API

Identified by the 2026-09-10 full technical audit as RATE-05 (confidence: RATE-05=CONFIRMED *(measured)*).

## Expected Behavior

The cost of an unauthenticated request is bounded well below the cost of
  making it, or the hashing runs off the request thread.

## Actual Behavior

The whole platform is served by one Node process on a `starter` instance.
  Each unauthenticated `POST /api/auth/login` or `POST /api/agent/auth/login` consumes ≥1 s of that
  process's CPU — considerably more than 1 s on a shared 0.5-vCPU container. The only control is
  20 requests per 10 minutes per `(IP, path)`, and that key is forgeable (RATE-01).

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RATE-05** (`services/api/src/modules/auth/auth.service.ts`, `modules/agent/agent.service.ts`):

  `services/api/package.json:73` — `"bcryptjs": "^3.0.3"` — the **pure-JavaScript** implementation,
  not native `bcrypt`. It runs on the Node process's own CPU.

  Cost factor 12 is used for every credential hash and therefore every comparison against one:
  `auth.service.ts:524` and `user-invitations.service.ts:239` — `bcrypt.hash(password, 12)`.

  Measured on this machine (`node -e` against the installed `bcryptjs`, primary checkout):
  ```
  hash12ms 1174   cmp12ms 1133   cmp10ms 453
  ```
  **1.13 seconds of CPU per cost-12 comparison** on a modern developer laptop.

  The cost is paid even for addresses that do not exist —
  `agent.service.ts:192-198`:
  ```ts
  if (!user) {
    if (candidates.length === 0) {
      await bcrypt.compare(dto.password, TIMING_EQUALISATION_HASH);
    }
  ```
  and it is paid *per candidate* when one address exists in several tenants —
  `agent.service.ts:175-190`:
  ```ts
  const candidates = await this.prisma.user.findMany({ where: { email }, ... });
  for (const candidate of candidates) {
    if (await bcrypt.compare(dto.password, candidate.passwordHash)) { user = candidate; break; }
  ```
  with no cap on `candidates.length`.

  `render.yaml:5` — `plan: starter`. `render.yaml:48-51` states the consequence directly:
  > *"a Render disk pins this service to a **SINGLE INSTANCE** … `starter` runs one instance."*

---


Full finding text: RATE-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Concrete arithmetic: 600 requests inside a 10-minute window ≈ 600 CPU-seconds against
  a 600-second wall clock on one core — the API is at 100 % and every tenant's every request
  queues behind it. 600 requests needs 30 source addresses under the current limit, or **zero**
  extra addresses if RATE-01 holds. This is a single-laptop denial of service against the entire
  platform.

## Affected Areas

services/api/src/modules/auth

## Proposed Resolution

Three changes, in order of value:
  1. Replace `bcryptjs` with the native `bcrypt` binding (or `@node-rs/bcrypt`), which runs on
     libuv's threadpool and is ~10× faster — CPU per comparison drops to ~100 ms and it stops
     blocking the event loop.
  2. Cap the agent-login candidate loop at 5 comparisons
     (`agent.service.ts:175`, add `take: 5`), so one address present in many tenants cannot
     multiply the cost.
  3. Add an **endpoint-class concurrency limiter**: at most **4 concurrent bcrypt comparisons
     process-wide**, queued, with a 2-second queue timeout returning `503`. Four, because that is
     roughly the point at which a 0.5-vCPU container is saturated and everything beyond it is
     queueing anyway — better to shed it explicitly than to stall the event loop.

(Difficulty: MEDIUM (native `bcrypt` needs a build step in the Render image; `@node-rs/bcrypt`
  ships prebuilt binaries and avoids that); Regression risk: MEDIUM — existing hashes are format-compatible across implementations, but
  verify against a production hash before shipping.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/auth/auth.service.ts`, `modules/agent/agent.service.ts` (audit id RATE-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RATE-05=MEDIUM — existing hashes are format-compatible across implementations, but
  verify against a production hash before shipping.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RATE-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RATE-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
