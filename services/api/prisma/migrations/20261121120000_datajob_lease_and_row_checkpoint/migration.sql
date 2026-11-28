-- Data-job recovery (SESSION-0136). Additive only.
-- claimedBy / leaseExpiresAt: a PROCESSING job whose lease has lapsed belongs to a
-- dead process. IN_PROGRESS: set on a chunk of import rows before any is applied,
-- so after a crash the lowest-numbered IN_PROGRESS row is the only unknown one.
-- AlterEnum
ALTER TYPE "DataRowStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "DataJob" ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DataJob_status_leaseExpiresAt_idx" ON "DataJob"("status", "leaseExpiresAt");

