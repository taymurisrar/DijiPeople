-- CreateEnum
CREATE TYPE "EmployeeEmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'NOTICE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "EmployeeMaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "EmployeeGender",
    "maritalStatus" "EmployeeMaritalStatus",
    "employmentStatus" "EmployeeEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "departmentId" TEXT,
    "designationId" TEXT,
    "managerEmployeeId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocumentReference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER,
    "storageKey" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeDocumentReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_employmentStatus_idx" ON "Employee"("tenantId", "employmentStatus");

-- CreateIndex
CREATE INDEX "Employee_tenantId_lastName_firstName_idx" ON "Employee"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_tenantId_managerEmployeeId_idx" ON "Employee"("tenantId", "managerEmployeeId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_hireDate_idx" ON "Employee"("tenantId", "hireDate");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_employeeCode_key" ON "Employee"("tenantId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_email_key" ON "Employee"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmergencyContact_tenantId_idx" ON "EmergencyContact"("tenantId");

-- CreateIndex
CREATE INDEX "EmergencyContact_employeeId_idx" ON "EmergencyContact"("employeeId");

-- CreateIndex
CREATE INDEX "EmergencyContact_tenantId_employeeId_idx" ON "EmergencyContact"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocumentReference_tenantId_idx" ON "EmployeeDocumentReference"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeDocumentReference_employeeId_idx" ON "EmployeeDocumentReference"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocumentReference_tenantId_employeeId_idx" ON "EmployeeDocumentReference"("tenantId", "employeeId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentReference" ADD CONSTRAINT "EmployeeDocumentReference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentReference" ADD CONSTRAINT "EmployeeDocumentReference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
