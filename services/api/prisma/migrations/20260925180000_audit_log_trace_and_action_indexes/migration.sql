-- TASK-0032 (EXECPLAN-0051). Additive indexes only.
--   * AuditLog(action, createdAt): the operations dashboard counts sign-ins across
--     every tenant by action and time; the existing indexes all lead with tenantId.
--   * AuditLog(traceId), PlatformAuditLog(traceId): monitoring shows the audit rows
--     a failing request wrote, looked up by trace id alone.
-- Plain CREATE INDEX takes a write lock for the build; see the TASK-0032 production
-- deployment notes for the audit table size check before release.

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_traceId_idx" ON "AuditLog"("traceId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_traceId_idx" ON "PlatformAuditLog"("traceId");

