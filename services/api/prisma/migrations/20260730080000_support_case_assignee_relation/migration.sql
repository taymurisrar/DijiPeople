-- Support case ownership resolves to a Platform Admin/member account.
UPDATE "SupportCase" AS support_case
SET "assignedToUserId" = NULL
WHERE "assignedToUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "PlatformUser" AS platform_user
    WHERE platform_user."id" = support_case."assignedToUserId"
  );

ALTER TABLE "SupportCase"
ADD CONSTRAINT "SupportCase_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "PlatformUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
