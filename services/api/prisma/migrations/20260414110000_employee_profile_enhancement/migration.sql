-- CreateEnum
CREATE TYPE "EmployeeType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "EmployeeWorkMode" AS ENUM ('OFFICE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "EmployeeContractType" AS ENUM ('PERMANENT', 'FIXED_TERM', 'FREELANCE', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'STOPPED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHECK', 'OTHER');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "contractType" "EmployeeContractType",
ADD COLUMN     "employeeType" "EmployeeType",
ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "officialJoiningLocationId" TEXT,
ADD COLUMN     "probationEndDate" TIMESTAMP(3),
ADD COLUMN     "taxIdentifier" TEXT,
ADD COLUMN     "workMode" "EmployeeWorkMode";

-- AlterTable
ALTER TABLE "EmployeeCompensation" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankAccountTitle" TEXT,
ADD COLUMN     "bankIban" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankRoutingNumber" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMode" "PaymentMode",
ADD COLUMN     "payrollGroup" TEXT,
ADD COLUMN     "payrollStatus" "PayrollStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "taxIdentifier" TEXT;

-- CreateTable
CREATE TABLE "EmployeePreviousEmployment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "department" TEXT,
    "employmentType" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "finalSalary" DECIMAL(12,2),
    "reasonForLeaving" TEXT,
    "referenceName" TEXT,
    "referenceContact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeePreviousEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeePreviousEmployment_tenantId_idx" ON "EmployeePreviousEmployment"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeePreviousEmployment_tenantId_employeeId_idx" ON "EmployeePreviousEmployment"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeePreviousEmployment_tenantId_employeeId_endDate_idx" ON "EmployeePreviousEmployment"("tenantId", "employeeId", "endDate");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_officialJoiningLocationId_fkey" FOREIGN KEY ("officialJoiningLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePreviousEmployment" ADD CONSTRAINT "EmployeePreviousEmployment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePreviousEmployment" ADD CONSTRAINT "EmployeePreviousEmployment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
