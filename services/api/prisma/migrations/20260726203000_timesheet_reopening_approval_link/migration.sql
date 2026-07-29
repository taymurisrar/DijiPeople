ALTER TABLE "TimesheetReopeningRequest"
  ADD COLUMN "approvalRequestId" TEXT;

CREATE INDEX "TimesheetReopening_tenant_approval_idx"
  ON "TimesheetReopeningRequest"("tenantId", "approvalRequestId");
