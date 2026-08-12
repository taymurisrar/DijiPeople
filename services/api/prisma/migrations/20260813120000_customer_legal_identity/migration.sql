-- Customers sign agreements as a legal entity, so they carry the same
-- registration and tax identifiers partners already do.
ALTER TABLE "CustomerAccount"
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "taxId" TEXT;
