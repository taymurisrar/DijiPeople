-- CreateIndex
-- The data-job worker polls every 5 s for QUEUED rows without naming a tenant;
-- every existing DataJob index leads with tenantId, so it could not be used.
-- Measured on 200k rows: 22.9 ms -> 0.05 ms (see docs/engineering/audits/2026-11-21-reliability-cost-audit).
CREATE INDEX "DataJob_status_createdAt_idx" ON "DataJob"("status", "createdAt");
