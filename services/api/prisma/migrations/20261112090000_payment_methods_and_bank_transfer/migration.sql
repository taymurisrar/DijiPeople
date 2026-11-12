-- CreateEnum
CREATE TYPE "BillingPaymentMethodKey" AS ENUM ('BANK_TRANSFER', 'STRIPE_CARD', 'SAFEPAY_CARD');

-- CreateEnum
CREATE TYPE "PaymentMethodEnvironment" AS ENUM ('MANUAL', 'SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PaymentMethodApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReceivingAccountStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BankTransferClaimStatus" AS ENUM ('PENDING_VERIFICATION', 'CLARIFICATION_REQUESTED', 'APPROVED', 'REJECTED', 'DUPLICATE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentEvidenceScanStatus" AS ENUM ('QUARANTINED', 'CLEAN', 'REJECTED');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'BANK_TRANSFER';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "bankReference" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionOrder" ADD COLUMN     "bankInvoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "paymentMethodConfigId" TEXT,
ADD COLUMN     "receivingAccountId" TEXT;

-- CreateTable
CREATE TABLE "PaymentMethodConfiguration" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "methodKey" "BillingPaymentMethodKey" NOT NULL,
    "environment" "PaymentMethodEnvironment" NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "PaymentMethodApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PaymentMethodConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReceivingAccount" (
    "id" TEXT NOT NULL,
    "paymentMethodConfigId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountTitleEncrypted" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT,
    "ibanEncrypted" TEXT,
    "raastIdEncrypted" TEXT,
    "maskedAccountTitle" TEXT NOT NULL,
    "maskedAccountNumber" TEXT,
    "maskedIban" TEXT,
    "maskedRaastId" TEXT,
    "paymentInstructions" TEXT,
    "status" "ReceivingAccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "BankReceivingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransferClaim" (
    "id" TEXT NOT NULL,
    "subscriptionOrderId" TEXT,
    "invoiceId" TEXT,
    "paymentMethodConfigId" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "status" "BankTransferClaimStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "claimedAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3),
    "customerReferenceEncrypted" TEXT,
    "customerReferenceHash" TEXT,
    "customerNote" TEXT,
    "clarificationRequest" TEXT,
    "decisionReason" TEXT,
    "bankStatementReferenceHash" TEXT,
    "bankStatementReferenceEncrypted" TEXT,
    "verifiedAmount" DECIMAL(12,2),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransferClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransferEvidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "scanStatus" "PaymentEvidenceScanStatus" NOT NULL DEFAULT 'QUARANTINED',
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransferEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethodConfiguration_marketId_currency_enabled_approv_idx" ON "PaymentMethodConfiguration"("marketId", "currency", "enabled", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodConfiguration_marketId_currency_methodKey_envi_key" ON "PaymentMethodConfiguration"("marketId", "currency", "methodKey", "environment");

-- CreateIndex
CREATE INDEX "BankReceivingAccount_paymentMethodConfigId_status_isActive_idx" ON "BankReceivingAccount"("paymentMethodConfigId", "status", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransferClaim_bankStatementReferenceHash_key" ON "BankTransferClaim"("bankStatementReferenceHash");

-- CreateIndex
CREATE INDEX "BankTransferClaim_status_submittedAt_idx" ON "BankTransferClaim"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "BankTransferClaim_subscriptionOrderId_status_idx" ON "BankTransferClaim"("subscriptionOrderId", "status");

-- CreateIndex
CREATE INDEX "BankTransferClaim_invoiceId_status_idx" ON "BankTransferClaim"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "BankTransferClaim_customerReferenceHash_idx" ON "BankTransferClaim"("customerReferenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransferEvidence_storageKey_key" ON "BankTransferEvidence"("storageKey");

-- CreateIndex
CREATE INDEX "BankTransferEvidence_claimId_scanStatus_idx" ON "BankTransferEvidence"("claimId", "scanStatus");

-- CreateIndex
CREATE INDEX "BankTransferEvidence_checksumSha256_idx" ON "BankTransferEvidence"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bankReference_key" ON "Invoice"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_bankReference_key" ON "SubscriptionOrder"("bankReference");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_paymentMethodConfigId_status_idx" ON "SubscriptionOrder"("paymentMethodConfigId", "status");

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_paymentMethodConfigId_fkey" FOREIGN KEY ("paymentMethodConfigId") REFERENCES "PaymentMethodConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "BankReceivingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodConfiguration" ADD CONSTRAINT "PaymentMethodConfiguration_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReceivingAccount" ADD CONSTRAINT "BankReceivingAccount_paymentMethodConfigId_fkey" FOREIGN KEY ("paymentMethodConfigId") REFERENCES "PaymentMethodConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferClaim" ADD CONSTRAINT "BankTransferClaim_subscriptionOrderId_fkey" FOREIGN KEY ("subscriptionOrderId") REFERENCES "SubscriptionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferClaim" ADD CONSTRAINT "BankTransferClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferClaim" ADD CONSTRAINT "BankTransferClaim_paymentMethodConfigId_fkey" FOREIGN KEY ("paymentMethodConfigId") REFERENCES "PaymentMethodConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferClaim" ADD CONSTRAINT "BankTransferClaim_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "BankReceivingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferEvidence" ADD CONSTRAINT "BankTransferEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "BankTransferClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one active receiving account per method configuration. Prisma cannot
-- express a partial unique index; this is the database-level guard.
CREATE UNIQUE INDEX "BankReceivingAccount_one_active_per_method" ON "BankReceivingAccount" ("paymentMethodConfigId") WHERE "isActive" = true;

-- A claim targets exactly one thing: a first-purchase order or a renewal invoice.
ALTER TABLE "BankTransferClaim" ADD CONSTRAINT "BankTransferClaim_exactly_one_target" CHECK (("subscriptionOrderId" IS NOT NULL) <> ("invoiceId" IS NOT NULL));
