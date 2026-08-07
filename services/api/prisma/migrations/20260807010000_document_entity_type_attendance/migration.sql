-- Attendance records reuse the generic document module, which links by
-- entityType + entityId, so no new foreign key column is required.
ALTER TYPE "DocumentEntityType" ADD VALUE IF NOT EXISTS 'ATTENDANCE';
