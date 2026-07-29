-- AlterEnum
ALTER TYPE "PayrollJournalEntryStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "PayrollJournalEntryStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

-- AlterTable
ALTER TABLE "PayrollPaymentLine" ADD COLUMN IF NOT EXISTS "retryOfPaymentLineId" TEXT;

-- AlterTable
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "postedBy" TEXT;
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "reversedBy" TEXT;
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollPaymentLine_tenantId_retryOfPaymentLineId_idx" ON "PayrollPaymentLine"("tenantId", "retryOfPaymentLineId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PayrollPaymentLine_retryOfPaymentLineId_fkey'
  ) THEN
    ALTER TABLE "PayrollPaymentLine"
      ADD CONSTRAINT "PayrollPaymentLine_retryOfPaymentLineId_fkey"
      FOREIGN KEY ("retryOfPaymentLineId") REFERENCES "PayrollPaymentLine"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
