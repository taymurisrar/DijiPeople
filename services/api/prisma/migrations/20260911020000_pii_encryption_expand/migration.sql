-- OBS-24 / EXECPLAN-0032 expand phase.
--
-- Adds AES-256-GCM ciphertext columns (SecretEncryptionService, `enc:v1:...`)
-- alongside every plaintext bank-account/IBAN/SWIFT/tax-id/CNIC column, plus a
-- deterministic cnicHmac for the uniqueness check `cnic` currently carries
-- (non-deterministic encryption cannot back a unique constraint).
--
-- Purely additive: every new column is nullable, no existing column is
-- touched, no row is rewritten. The application dual-writes both shapes from
-- this point forward; a backfill script populates the *Enc columns for rows
-- written before this migration. Do NOT drop the plaintext columns or the
-- old @@unique([tenantId, cnic]) here — that is a separate contract-phase
-- migration (20260911020100_pii_encryption_contract, not applied by this
-- change) that runs only after the backfill is verified complete in
-- production.
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "cnicEnc" TEXT,
ADD COLUMN     "cnicHmac" TEXT,
ADD COLUMN     "taxIdentifierEnc" TEXT;

-- AlterTable
ALTER TABLE "EmployeeBankAccount" ADD COLUMN     "accountNumberEnc" TEXT,
ADD COLUMN     "ibanEnc" TEXT,
ADD COLUMN     "swiftOrRoutingCodeEnc" TEXT;

-- AlterTable
ALTER TABLE "EmployerBankAccount" ADD COLUMN     "accountNumberEnc" TEXT,
ADD COLUMN     "ibanEnc" TEXT;

-- AlterTable
ALTER TABLE "EmployeeTaxProfile" ADD COLUMN     "taxIdentificationNumberEnc" TEXT;

-- AlterTable
ALTER TABLE "EmployeeCompensation" ADD COLUMN     "bankAccountNumberEnc" TEXT,
ADD COLUMN     "bankIbanEnc" TEXT,
ADD COLUMN     "bankRoutingNumberEnc" TEXT,
ADD COLUMN     "taxIdentifierEnc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_cnicHmac_key" ON "Employee"("tenantId", "cnicHmac");

