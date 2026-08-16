-- BUG-0036 — make heartbeat ingestion idempotent.
--
-- The desktop agent re-sends a whole batch when a send fails. The server created
-- every ActivityEvent unconditionally and *incremented* running totals, so a
-- replayed batch permanently inflated WorkSession.totalActiveSeconds and
-- DailyProductivitySummary — the figures utilizationPercent is derived from.
--
-- WHY A NEW NULLABLE COLUMN RATHER THAN A UNIQUE INDEX ON THE EXISTING ONES.
-- The natural key is (tenantId, sessionId, occurredAt). A unique index over
-- those columns cannot be created on a live database, because rows written
-- before this migration already contain the duplicates the bug produced: the
-- index build would fail, and the only way to make it succeed would be to delete
-- production telemetry first.
--
-- So the constraint is placed on a column that no historical row has. PostgreSQL
-- treats NULLs as distinct in a unique index, so every pre-existing row is
-- exempt and the index builds unconditionally, while every new write is governed
-- from the moment this lands. Nothing is deleted and no history is rewritten.
--
-- The already-inflated historical totals are NOT corrected here. Recomputing
-- them means deciding what to do with sessions whose events were partly pruned
-- by telemetry retention, and that is a decision with an owner, not a side
-- effect of a schema change. It is recorded on the bug.
ALTER TABLE "ActivityEvent" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "ActivityEvent_dedupeKey_key" ON "ActivityEvent" ("dedupeKey");
