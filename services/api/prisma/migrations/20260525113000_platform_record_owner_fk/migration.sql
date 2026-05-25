-- Move platform CRM record ownership from tenant users to platform users.
-- Existing tenant-user owner values are cleared when they do not map to an
-- active platform user, preventing invalid foreign keys during deployment.

ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_assignedToUserId_fkey";
ALTER TABLE "CustomerAccount" DROP CONSTRAINT IF EXISTS "CustomerAccount_assignedToUserId_fkey";
ALTER TABLE "CustomerAccount" DROP CONSTRAINT IF EXISTS "CustomerAccount_accountManagerUserId_fkey";

UPDATE "Lead"
SET "assignedToUserId" = NULL
WHERE "assignedToUserId" IS NOT NULL
  AND "assignedToUserId" NOT IN (
    SELECT "id" FROM "PlatformUser"
    WHERE "role" IN ('SUPER_ADMIN', 'MEMBER')
      AND "status" = 'ACTIVE'
  );

UPDATE "CustomerAccount"
SET "assignedToUserId" = NULL
WHERE "assignedToUserId" IS NOT NULL
  AND "assignedToUserId" NOT IN (
    SELECT "id" FROM "PlatformUser"
    WHERE "role" IN ('SUPER_ADMIN', 'MEMBER')
      AND "status" = 'ACTIVE'
  );

UPDATE "CustomerAccount"
SET "accountManagerUserId" = NULL
WHERE "accountManagerUserId" IS NOT NULL
  AND "accountManagerUserId" NOT IN (
    SELECT "id" FROM "PlatformUser"
    WHERE "role" IN ('SUPER_ADMIN', 'MEMBER')
      AND "status" = 'ACTIVE'
  );

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "PlatformUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "PlatformUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_accountManagerUserId_fkey"
FOREIGN KEY ("accountManagerUserId") REFERENCES "PlatformUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
