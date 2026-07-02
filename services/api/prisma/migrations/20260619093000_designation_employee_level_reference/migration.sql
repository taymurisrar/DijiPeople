ALTER TABLE "Designation"
ADD COLUMN "employeeLevelId" TEXT;

CREATE INDEX "Designation_tenantId_employeeLevelId_idx"
ON "Designation"("tenantId", "employeeLevelId");

ALTER TABLE "Designation"
ADD CONSTRAINT "Designation_employeeLevelId_tenantId_fkey"
FOREIGN KEY ("employeeLevelId", "tenantId")
REFERENCES "EmployeeLevel"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
