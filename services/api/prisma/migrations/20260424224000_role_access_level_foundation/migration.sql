-- Role access level foundation

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleAccessLevel') THEN
    CREATE TYPE "RoleAccessLevel" AS ENUM (
      'USER',
      'BUSINESS_UNIT',
      'PARENT_BU',
      'ORGANIZATION',
      'TENANT'
    );
  END IF;
END
$$;

ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "accessLevel" "RoleAccessLevel" NOT NULL DEFAULT 'USER';

UPDATE "Role" SET "accessLevel" = 'TENANT' WHERE "key" = 'system-admin';
UPDATE "Role" SET "accessLevel" = 'ORGANIZATION' WHERE "key" = 'hr';
UPDATE "Role" SET "accessLevel" = 'BUSINESS_UNIT' WHERE "key" = 'recruiter';
UPDATE "Role" SET "accessLevel" = 'PARENT_BU' WHERE "key" = 'manager';
UPDATE "Role" SET "accessLevel" = 'USER' WHERE "key" = 'employee';

CREATE INDEX IF NOT EXISTS "Role_tenantId_accessLevel_idx" ON "Role"("tenantId", "accessLevel");
