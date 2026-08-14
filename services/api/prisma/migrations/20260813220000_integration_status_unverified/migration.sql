-- Adds UNVERIFIED to the integration lifecycle.
--
-- Additive only: ALTER TYPE ... ADD VALUE appends a label and rewrites nothing.
-- IF NOT EXISTS keeps the migration re-runnable.

ALTER TYPE "AttendanceIntegrationStatus" ADD VALUE IF NOT EXISTS 'UNVERIFIED' AFTER 'DRAFT';
