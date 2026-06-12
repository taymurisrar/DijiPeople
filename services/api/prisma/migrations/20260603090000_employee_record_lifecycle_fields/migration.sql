ALTER TABLE "Employee"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "subStatus" TEXT NOT NULL DEFAULT 'OPEN';

CREATE INDEX "Employee_tenantId_status_idx" ON "Employee"("tenantId", "status");
CREATE INDEX "Employee_tenantId_subStatus_idx" ON "Employee"("tenantId", "subStatus");
