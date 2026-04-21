-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "taskBlueprints" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeOnboarding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT,
    "employeeId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeOnboardingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTemplate_tenantId_name_key" ON "OnboardingTemplate"("tenantId", "name");
CREATE INDEX "OnboardingTemplate_tenantId_idx" ON "OnboardingTemplate"("tenantId");
CREATE INDEX "OnboardingTemplate_tenantId_isDefault_isActive_idx" ON "OnboardingTemplate"("tenantId", "isDefault", "isActive");

-- CreateIndex
CREATE INDEX "EmployeeOnboarding_tenantId_idx" ON "EmployeeOnboarding"("tenantId");
CREATE INDEX "EmployeeOnboarding_tenantId_status_idx" ON "EmployeeOnboarding"("tenantId", "status");
CREATE INDEX "EmployeeOnboarding_tenantId_candidateId_idx" ON "EmployeeOnboarding"("tenantId", "candidateId");
CREATE INDEX "EmployeeOnboarding_tenantId_employeeId_idx" ON "EmployeeOnboarding"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "OnboardingTask_tenantId_idx" ON "OnboardingTask"("tenantId");
CREATE INDEX "OnboardingTask_tenantId_status_idx" ON "OnboardingTask"("tenantId", "status");
CREATE INDEX "OnboardingTask_tenantId_employeeOnboardingId_idx" ON "OnboardingTask"("tenantId", "employeeOnboardingId");
CREATE INDEX "OnboardingTask_tenantId_assignedUserId_status_idx" ON "OnboardingTask"("tenantId", "assignedUserId", "status");

-- AddForeignKey
ALTER TABLE "OnboardingTemplate"
ADD CONSTRAINT "OnboardingTemplate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeOnboarding"
ADD CONSTRAINT "EmployeeOnboarding_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeOnboarding"
ADD CONSTRAINT "EmployeeOnboarding_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeOnboarding"
ADD CONSTRAINT "EmployeeOnboarding_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeOnboarding"
ADD CONSTRAINT "EmployeeOnboarding_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OnboardingTask"
ADD CONSTRAINT "OnboardingTask_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnboardingTask"
ADD CONSTRAINT "OnboardingTask_employeeOnboardingId_fkey"
FOREIGN KEY ("employeeOnboardingId") REFERENCES "EmployeeOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnboardingTask"
ADD CONSTRAINT "OnboardingTask_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
