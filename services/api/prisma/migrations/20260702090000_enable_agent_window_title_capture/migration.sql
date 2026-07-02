ALTER TABLE "AgentTrackingSettings"
ALTER COLUMN "captureWindowTitle" SET DEFAULT true;

UPDATE "AgentTrackingSettings"
SET "captureWindowTitle" = true
WHERE "enabled" = true
  AND "captureActiveApp" = true
  AND "captureWindowTitle" = false;
