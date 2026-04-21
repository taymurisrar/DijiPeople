-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "isDraftProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sourceCandidateId" TEXT,
ADD COLUMN "sourceApplicationId" TEXT,
ADD COLUMN "sourceJobOpeningId" TEXT;

-- CreateIndex
CREATE INDEX "Employee_tenantId_isDraftProfile_idx" ON "Employee"("tenantId", "isDraftProfile");

-- CreateIndex
CREATE INDEX "Employee_tenantId_sourceCandidateId_idx" ON "Employee"("tenantId", "sourceCandidateId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_sourceApplicationId_idx" ON "Employee"("tenantId", "sourceApplicationId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_sourceJobOpeningId_idx" ON "Employee"("tenantId", "sourceJobOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_sourceApplicationId_key" ON "Employee"("sourceApplicationId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sourceJobOpeningId_fkey" FOREIGN KEY ("sourceJobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
