-- Owner email verification, established before payment rather than after it.
--
-- A card proves somebody can pay; it does not prove they typed their own email.
-- The owner address is the one credential that cannot be corrected from inside
-- the workspace — get it wrong and nobody can sign in to fix it. Verifying
-- first means nobody is charged for a workspace they cannot reach, and it makes
-- `paidAt` imply `ownerEmailVerifiedAt`.
--
-- The code is hashed, never stored in plaintext, for the same reason a password
-- is: this column is a credential for the duration of its short life.

-- AlterTable
ALTER TABLE "SubscriptionOrder" ADD COLUMN     "ownerEmailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationCodeHash" TEXT,
ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationSentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0;
