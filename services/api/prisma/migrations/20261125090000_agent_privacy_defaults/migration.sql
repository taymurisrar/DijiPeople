-- DP-MASTER/WP-17.S2 (OD-DLP-DEFAULTS, approved for ALL tenants, 2026-11-24; D16).
--
-- Window-title capture becomes opt-in and DLP content capture requires a recorded
-- acknowledgement. Existing tenants are changed too, so the previous values are
-- written to the AuditLog first (beforeSnapshot) - that row is both the audit
-- record and the rollback source. Data only: no column is dropped or retyped.
--
-- Rollback (restores each tenant's previous values; run manually if ever needed):
--   UPDATE "AgentTrackingSettings" s
--      SET "captureWindowTitle" = (a."beforeSnapshot"->>'captureWindowTitle')::boolean,
--          "dlpConsentRequired" = (a."beforeSnapshot"->>'dlpConsentRequired')::boolean
--     FROM "AuditLog" a
--    WHERE a.action = 'AGENT_PRIVACY_DEFAULTS_APPLIED' AND a."entityId" = s.id;
--   ALTER TABLE "AgentTrackingSettings" ALTER COLUMN "captureWindowTitle" SET DEFAULT true;
--   ALTER TABLE "AgentTrackingSettings" ALTER COLUMN "dlpConsentRequired" SET DEFAULT false;
-- The per-tenant switches stay available in Platform Admin after this runs.

INSERT INTO "AuditLog" ("id", "tenantId", "action", "entityType", "entityId", "sourceModule", "beforeSnapshot", "afterSnapshot", "createdAt")
SELECT gen_random_uuid()::text, s."tenantId", 'AGENT_PRIVACY_DEFAULTS_APPLIED', 'AgentTrackingSettings', s."id",
       'agent-privacy-migration',
       jsonb_build_object('captureWindowTitle', s."captureWindowTitle", 'dlpConsentRequired', s."dlpConsentRequired"),
       jsonb_build_object('captureWindowTitle', false, 'dlpConsentRequired', true),
       now()
FROM "AgentTrackingSettings" s
WHERE s."captureWindowTitle" = true OR s."dlpConsentRequired" = false;

UPDATE "AgentTrackingSettings"
   SET "captureWindowTitle" = false, "dlpConsentRequired" = true
 WHERE "captureWindowTitle" = true OR "dlpConsentRequired" = false;

ALTER TABLE "AgentTrackingSettings" ALTER COLUMN "captureWindowTitle" SET DEFAULT false;
ALTER TABLE "AgentTrackingSettings" ALTER COLUMN "dlpConsentRequired" SET DEFAULT true;
