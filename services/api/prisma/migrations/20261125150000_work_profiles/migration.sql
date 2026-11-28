-- DP-MASTER/WP-35.S1 (ADR-0030). Additive: work units, work profiles, immutable profile versions and
-- time-effective employee assignments. No existing table is altered.

-- CreateEnum
CREATE TYPE "WorkUnitKind" AS ENUM ('DURATION', 'COUNT', 'DUTY_COMPLETION', 'CURRENCY');

-- CreateEnum
CREATE TYPE "WorkProfileVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "WorkUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WorkUnitKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProfileVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WorkProfileVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "checksum" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkProfileAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkProfileAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkUnit_tenantId_isActive_idx" ON "WorkUnit"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkUnit_tenantId_key_key" ON "WorkUnit"("tenantId", "key");

-- CreateIndex
CREATE INDEX "WorkProfile_tenantId_isActive_idx" ON "WorkProfile"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProfile_tenantId_key_key" ON "WorkProfile"("tenantId", "key");

-- CreateIndex
CREATE INDEX "WorkProfileVersion_tenantId_profileId_status_idx" ON "WorkProfileVersion"("tenantId", "profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProfileVersion_profileId_version_key" ON "WorkProfileVersion"("profileId", "version");

-- CreateIndex
CREATE INDEX "EmployeeWorkProfileAssignment_tenantId_employeeId_effective_idx" ON "EmployeeWorkProfileAssignment"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeWorkProfileAssignment_tenantId_profileId_idx" ON "EmployeeWorkProfileAssignment"("tenantId", "profileId");

-- AddForeignKey
ALTER TABLE "WorkUnit" ADD CONSTRAINT "WorkUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProfile" ADD CONSTRAINT "WorkProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProfileVersion" ADD CONSTRAINT "WorkProfileVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProfileVersion" ADD CONSTRAINT "WorkProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WorkProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkProfileAssignment" ADD CONSTRAINT "EmployeeWorkProfileAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkProfileAssignment" ADD CONSTRAINT "EmployeeWorkProfileAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkProfileAssignment" ADD CONSTRAINT "EmployeeWorkProfileAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WorkProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

