-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnic" TEXT,
ADD COLUMN     "confirmationDate" TIMESTAMP(3),
ADD COLUMN     "country" TEXT,
ADD COLUMN     "emergencyContactAlternatePhone" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "profileImageDocumentId" TEXT,
ADD COLUMN     "stateProvince" TEXT;

-- CreateTable
CREATE TABLE "EmployeeEducation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "degreeTitle" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "gradeOrCgpa" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeEducation_tenantId_idx" ON "EmployeeEducation"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeEducation_tenantId_employeeId_idx" ON "EmployeeEducation"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeEducation_tenantId_employeeId_endDate_idx" ON "EmployeeEducation"("tenantId", "employeeId", "endDate");

-- CreateIndex
CREATE INDEX "EmployeeHistory_tenantId_idx" ON "EmployeeHistory"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeHistory_tenantId_employeeId_eventDate_idx" ON "EmployeeHistory"("tenantId", "employeeId", "eventDate");

-- CreateIndex
CREATE INDEX "EmployeeHistory_tenantId_eventType_eventDate_idx" ON "EmployeeHistory"("tenantId", "eventType", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_profileImageDocumentId_key" ON "Employee"("profileImageDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_cnic_key" ON "Employee"("tenantId", "cnic");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_profileImageDocumentId_fkey" FOREIGN KEY ("profileImageDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEducation" ADD CONSTRAINT "EmployeeEducation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEducation" ADD CONSTRAINT "EmployeeEducation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHistory" ADD CONSTRAINT "EmployeeHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHistory" ADD CONSTRAINT "EmployeeHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

