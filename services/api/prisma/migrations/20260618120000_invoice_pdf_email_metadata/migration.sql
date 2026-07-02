ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "generatedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailedTo" TEXT,
ADD COLUMN IF NOT EXISTS "emailStatus" TEXT,
ADD COLUMN IF NOT EXISTS "pdfStorageKey" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_generatedAt_idx" ON "Invoice"("generatedAt");
CREATE INDEX IF NOT EXISTS "Invoice_emailedAt_idx" ON "Invoice"("emailedAt");
