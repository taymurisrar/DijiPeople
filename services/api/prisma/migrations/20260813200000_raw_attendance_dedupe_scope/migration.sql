-- Raw attendance deduplication: scope uniqueness by source identity.
--
-- Slice 1 keyed uniqueness on (tenantId, captureSource, eventFingerprint). That
-- silently assumes every connector folds device identity into its hash. The
-- ZKTeco adapter does (the device serial is part of the hash), but nothing
-- enforced it. A connector that hashed only user + timestamp + punch fields
-- would make two devices' legitimate simultaneous punches collide, and the
-- second would be discarded as a duplicate — silent attendance data loss.
--
-- `dedupeScopeKey` is derived server-side by the ingestion service, so source
-- identity always participates in the constraint regardless of what the
-- connector chose to hash.

DROP INDEX IF EXISTS "RawAttendanceEvent_tenantId_captureSource_eventFingerprint_key";

-- Added with a temporary default so the column can be NOT NULL even where rows
-- already exist; the ingestion service always supplies it explicitly afterwards.
ALTER TABLE "RawAttendanceEvent"
  ADD COLUMN "dedupeScopeKey" TEXT NOT NULL DEFAULT 'tenant';

UPDATE "RawAttendanceEvent"
SET "dedupeScopeKey" = CASE
  WHEN "deviceId" IS NOT NULL THEN 'device:' || "deviceId"
  WHEN "integrationId" IS NOT NULL THEN 'integration:' || "integrationId"
  ELSE 'tenant'
END;

ALTER TABLE "RawAttendanceEvent" ALTER COLUMN "dedupeScopeKey" DROP DEFAULT;

CREATE UNIQUE INDEX "RawAttendanceEvent_tenantId_dedupeScopeKey_eventFingerprint_key"
  ON "RawAttendanceEvent" ("tenantId", "dedupeScopeKey", "eventFingerprint");
