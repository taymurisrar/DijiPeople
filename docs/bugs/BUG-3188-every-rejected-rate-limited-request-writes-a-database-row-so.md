---
ID: BUG-3188
aliases: [BUG-3188]
Title: Every rejected rate-limited request writes a database row, so throttling costs more than serving
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3188 — Every rejected rate-limited request writes a database row, so throttling costs more than serving

## Summary

Every rejected rate-limited request writes a database row, so throttling costs more than serving

Identified by the 2026-09-10 full technical audit as RATE-04 (confidence: RATE-04=CONFIRMED).

## Expected Behavior

Rejections that carry no diagnostic value — `429`, `401` on an expired
  token, `404` on an unmatched route, `400` from schema validation on an unauthenticated
  endpoint — are counted, not stored per-occurrence.

## Actual Behavior

Hitting the rate limit is more expensive for the server than not hitting
  it: a `429` costs a `$transaction` with a `findUnique`, an `update` and an `insert`, where the
  allowed request that preceded it may have cost a single indexed read. The same is true of every
  `401` from an expired session, every `404` on an unmatched route, and every `400` from the
  validation pipe.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RATE-04** (`services/api/src/common/filters/http-exception.filter.ts`, `modules/error-logs/error-logs.service.ts`):

  `http-exception.filter.ts:118-124` — persistence is unconditional on status code:
  ```ts
  if (normalized.statusCode >= 500) { this.logger.error(...); } else { this.logger.warn(...); }
  await this.errorLogsService.persist({ ... });
  ```

  `error-logs.service.ts:76-78` — enabled by default:
  ```ts
  const config = getErrorFrameworkConfig(this.configService);
  if (!config.enabled || config.storage !== 'database') return;
  ```
  `common/errors/error-config.ts:20-25` — `enabled` defaults `true`, `storage` defaults
  `'database'`, `retentionDays` defaults `90`.

  `error-logs.service.ts:112-167` — the incident is deduped by fingerprint, but the **occurrence
  is not**:
  ```ts
  await this.prisma.$transaction(async (tx) => {
    const existing = await tx.errorLog.findUnique({ where: { fingerprint } });
    ...
    await tx.errorLogOccurrence.upsert({
      where: { traceId: data.traceId },
      update: {},
      create: { incidentId: incident.id, traceId: data.traceId, diagnosticJson: ... },
    });
  });
  ```
  `traceId` is unique per request, so `upsert` is always an insert. One new row, carrying a full
  JSON diagnostic blob, **per rejected request**.

  `http-exception.filter.ts:293` — `429` is itself mapped into the catalog
  (`if (statusCode === 429) return 'RATE_LIMIT_EXCEEDED';`) and therefore goes down the same
  persistence path.

  `error-logs.service.ts:286-290` — the retention sweep deletes `errorLog` rows older than the
  cutoff; there is no cap on rows accumulated *within* the 90-day window.

---


Full finding text: RATE-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Unbounded, unauthenticated write amplification against the production Neon database.
  An attacker aiming at `GET /api/public/tenants/resolve?slug=<random>` (unthrottled, RATE-09)
  writes one row per request at line rate for 90 days of retention; at 100 req/s that is 8.6M
  occurrence rows per day, each with a JSON blob. This costs storage, it costs Neon compute, and
  it buries genuine incidents — which is precisely the failure BUG-1754 already recorded once at a
  scale of 1 588 rows.

## Affected Areas

services/api/src/common

## Proposed Resolution

In `ErrorLogsService.persist`, add a suppression set checked before the
  transaction: skip `errorLogOccurrence` creation (keeping the incident counter increment) when
  `statusCode` is `429`, or when `unmatchedRoute` is true, or when `errorCode` is
  `AUTH_UNAUTHORIZED` on a `@Public()` route. Additionally, cap occurrences per incident — after
  the first 100 occurrences of a fingerprint within a window, increment `occurrenceCount` only.
  Make `PublicRateLimitGuard`'s `429` bypass the filter entirely by writing the response directly
  rather than throwing.

(Difficulty: LOW; Regression risk: LOW — `occurrenceCount` still records the volume.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/common/filters/http-exception.filter.ts`, `modules/error-logs/error-logs.service.ts` (audit id RATE-04).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RATE-04=LOW — `occurrenceCount` still records the volume.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RATE-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RATE-04) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
