-- Brute-force protection for sign-in, plus the timestamp password expiry needs.
-- Existing rows start unlocked with no failures recorded.
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Existing passwords are treated as set now rather than as infinitely old, so
-- enabling expiry later does not lock every user out at once.
UPDATE "User" SET "passwordChangedAt" = CURRENT_TIMESTAMP WHERE "passwordChangedAt" IS NULL;
