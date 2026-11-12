-- Where payers send a payment receipt (email / WhatsApp). Public by design.
ALTER TABLE "BankReceivingAccount" ADD COLUMN "receiptContactEmail" TEXT,
ADD COLUMN "receiptContactPhone" TEXT;
