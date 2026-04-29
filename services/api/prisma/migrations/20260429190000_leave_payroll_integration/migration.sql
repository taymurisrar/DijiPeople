-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "totalAllocated" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalUsed" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalRemaining" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveConsumptionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "days" DECIMAL(8,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveConsumptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_tenantId_employeeId_leaveTypeId_key" ON "LeaveBalance"("tenantId", "employeeId", "leaveTypeId");
CREATE INDEX "LeaveBalance_tenantId_employeeId_idx" ON "LeaveBalance"("tenantId", "employeeId");
CREATE INDEX "LeaveBalance_tenantId_leaveTypeId_idx" ON "LeaveBalance"("tenantId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveConsumptionRecord_tenantId_leaveRequestId_key" ON "LeaveConsumptionRecord"("tenantId", "leaveRequestId");
CREATE INDEX "LeaveConsumptionRecord_tenantId_employeeId_idx" ON "LeaveConsumptionRecord"("tenantId", "employeeId");
CREATE INDEX "LeaveConsumptionRecord_tenantId_leaveTypeId_idx" ON "LeaveConsumptionRecord"("tenantId", "leaveTypeId");

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveConsumptionRecord" ADD CONSTRAINT "LeaveConsumptionRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveConsumptionRecord" ADD CONSTRAINT "LeaveConsumptionRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveConsumptionRecord" ADD CONSTRAINT "LeaveConsumptionRecord_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveConsumptionRecord" ADD CONSTRAINT "LeaveConsumptionRecord_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
