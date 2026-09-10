-- Durable object storage metadata (FILE-01 / INF-05).
--
-- Expand phase only: every column is nullable and no existing column is
-- dropped, narrowed or renamed, so this migration is safe to apply ahead of
-- the application deploy and safe to leave in place if the code is rolled
-- back. Adding a nullable column without a default does not rewrite the
-- table in PostgreSQL, so there is no long lock on Document or Invoice.
--
-- storageProvider records WHICH backend holds the bytes. NULL means the row
-- predates object storage and its bytes were written to the ephemeral
-- container filesystem, which is what makes the reconciliation report able to
-- tell a legacy row from a durable one without guessing.
--
-- scanStatus is the lifecycle hook for malware scanning (FILE-04). No scanner
-- is wired yet, so this stays NULL / SCAN_NOT_CONFIGURED rather than claiming
-- files were checked.

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'QUARANTINED', 'SCAN_FAILED', 'SCAN_NOT_CONFIGURED');

-- AlterTable
ALTER TABLE "ContractTemplateVersion" ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "sourceStorageProvider" TEXT;

-- AlterTable
ALTER TABLE "ContractVersion" ADD COLUMN     "sourceStorageProvider" TEXT;

-- AlterTable
ALTER TABLE "ContractDocument" ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "SignatureEvidence" ADD COLUMN     "signatureStorageProvider" TEXT;

-- AlterTable
ALTER TABLE "SupportCaseAttachment" ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "EmployeeDocumentReference" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "DocumentReference" ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "scanStatus" "FileScanStatus",
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "pdfChecksumSha256" TEXT,
ADD COLUMN     "pdfStorageProvider" TEXT;

-- AlterTable
ALTER TABLE "ScreenCaptureEvent" ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "DataJob" ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "ApplicationRelease" ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "ReportRun" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "storageProvider" TEXT;

