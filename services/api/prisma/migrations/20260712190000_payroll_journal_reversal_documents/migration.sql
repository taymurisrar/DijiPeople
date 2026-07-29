-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayrollJournalEntryType') THEN
    CREATE TYPE "PayrollJournalEntryType" AS ENUM ('ORIGINAL', 'REVERSAL', 'ADJUSTMENT');
  END IF;
END $$;

-- Drop one-journal-per-run constraints so original, reversal, and adjustment journals can coexist.
ALTER TABLE "PayrollJournalEntry" DROP CONSTRAINT IF EXISTS "PayrollJournalEntry_tenantId_payrollRunId_key";
ALTER TABLE "PayrollJournalEntry" DROP CONSTRAINT IF EXISTS "PayrollJournalEntry_payrollRunId_tenantId_key";

-- AlterTable
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "journalType" "PayrollJournalEntryType" NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "originalJournalId" TEXT;
ALTER TABLE "PayrollJournalEntry" ADD COLUMN IF NOT EXISTS "reversalJournalId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollJournalEntry_tenantId_payrollRunId_idx" ON "PayrollJournalEntry"("tenantId", "payrollRunId");
CREATE INDEX IF NOT EXISTS "PayrollJournalEntry_tenantId_journalType_idx" ON "PayrollJournalEntry"("tenantId", "journalType");
CREATE INDEX IF NOT EXISTS "PayrollJournalEntry_tenantId_originalJournalId_idx" ON "PayrollJournalEntry"("tenantId", "originalJournalId");
CREATE INDEX IF NOT EXISTS "PayrollJournalEntry_tenantId_reversalJournalId_idx" ON "PayrollJournalEntry"("tenantId", "reversalJournalId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayrollJournalEntry_originalJournalId_fkey'
  ) THEN
    ALTER TABLE "PayrollJournalEntry"
      ADD CONSTRAINT "PayrollJournalEntry_originalJournalId_fkey"
      FOREIGN KEY ("originalJournalId") REFERENCES "PayrollJournalEntry"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayrollJournalEntry_reversalJournalId_fkey'
  ) THEN
    ALTER TABLE "PayrollJournalEntry"
      ADD CONSTRAINT "PayrollJournalEntry_reversalJournalId_fkey"
      FOREIGN KEY ("reversalJournalId") REFERENCES "PayrollJournalEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
