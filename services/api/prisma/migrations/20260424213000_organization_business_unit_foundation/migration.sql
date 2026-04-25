-- Organization + Business Unit foundation

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BusinessUnit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentBusinessUnitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- Required unique indexes must exist before composite foreign keys can reference them.
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_id_tenantId_key" ON "Organization"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_tenantId_name_key" ON "Organization"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Organization_tenantId_idx" ON "Organization"("tenantId");
CREATE INDEX IF NOT EXISTS "Organization_tenantId_parentOrganizationId_idx" ON "Organization"("tenantId", "parentOrganizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessUnit_id_tenantId_key" ON "BusinessUnit"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessUnit_tenantId_organizationId_name_key" ON "BusinessUnit"("tenantId", "organizationId", "name");
CREATE INDEX IF NOT EXISTS "BusinessUnit_tenantId_idx" ON "BusinessUnit"("tenantId");
CREATE INDEX IF NOT EXISTS "BusinessUnit_tenantId_organizationId_idx" ON "BusinessUnit"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "BusinessUnit_tenantId_parentBusinessUnitId_idx" ON "BusinessUnit"("tenantId", "parentBusinessUnitId");

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_parentOrganizationId_tenantId_fkey"
  FOREIGN KEY ("parentOrganizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessUnit"
  ADD CONSTRAINT "BusinessUnit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessUnit"
  ADD CONSTRAINT "BusinessUnit_organizationId_tenantId_fkey"
  FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessUnit"
  ADD CONSTRAINT "BusinessUnit_parentBusinessUnitId_tenantId_fkey"
  FOREIGN KEY ("parentBusinessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill defaults so every tenant has at least one organization and one business unit.
INSERT INTO "Organization" ("id", "tenantId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Default Organization', NOW(), NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "Organization" o WHERE o."tenantId" = t."id"
);

INSERT INTO "BusinessUnit" ("id", "tenantId", "name", "organizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, root_org."tenantId", 'Default Business Unit', root_org."id", NOW(), NOW()
FROM (
  SELECT DISTINCT ON (o."tenantId")
    o."tenantId",
    o."id"
  FROM "Organization" o
  ORDER BY o."tenantId", o."createdAt" ASC, o."name" ASC
) AS root_org
WHERE NOT EXISTS (
  SELECT 1 FROM "BusinessUnit" bu WHERE bu."tenantId" = root_org."tenantId"
);

UPDATE "User" u
SET "businessUnitId" = root_bu."id"
FROM (
  SELECT DISTINCT ON (bu."tenantId")
    bu."tenantId",
    bu."id"
  FROM "BusinessUnit" bu
  ORDER BY bu."tenantId", bu."createdAt" ASC, bu."name" ASC
) AS root_bu
WHERE u."tenantId" = root_bu."tenantId"
  AND u."businessUnitId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "businessUnitId" IS NULL) THEN
    RAISE EXCEPTION 'Unable to backfill User.businessUnitId for all users.';
  END IF;
END
$$;

ALTER TABLE "User"
  ALTER COLUMN "businessUnitId" SET NOT NULL;

ALTER TABLE "User"
  ADD CONSTRAINT "User_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "User_businessUnitId_idx" ON "User"("businessUnitId");

-- Guard against circular parent chains in Organization hierarchy.
CREATE OR REPLACE FUNCTION "check_organization_cycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_cycle INTEGER;
BEGIN
  IF NEW."parentOrganizationId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."parentOrganizationId" = NEW."id" THEN
    RAISE EXCEPTION 'Organization cannot be its own parent.';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT o."id", o."parentOrganizationId"
    FROM "Organization" o
    WHERE o."id" = NEW."parentOrganizationId"
      AND o."tenantId" = NEW."tenantId"

    UNION ALL

    SELECT p."id", p."parentOrganizationId"
    FROM "Organization" p
    INNER JOIN ancestors a ON a."parentOrganizationId" = p."id"
    WHERE p."tenantId" = NEW."tenantId"
  )
  SELECT 1 INTO has_cycle
  FROM ancestors
  WHERE "id" = NEW."id"
  LIMIT 1;

  IF has_cycle = 1 THEN
    RAISE EXCEPTION 'Circular organization hierarchy is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "organization_cycle_guard" ON "Organization";
CREATE TRIGGER "organization_cycle_guard"
BEFORE INSERT OR UPDATE OF "parentOrganizationId", "tenantId"
ON "Organization"
FOR EACH ROW
EXECUTE FUNCTION "check_organization_cycle"();

-- Guard against circular parent chains in BusinessUnit hierarchy.
CREATE OR REPLACE FUNCTION "check_business_unit_cycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_cycle INTEGER;
BEGIN
  IF NEW."parentBusinessUnitId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."parentBusinessUnitId" = NEW."id" THEN
    RAISE EXCEPTION 'Business unit cannot be its own parent.';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT bu."id", bu."parentBusinessUnitId"
    FROM "BusinessUnit" bu
    WHERE bu."id" = NEW."parentBusinessUnitId"
      AND bu."tenantId" = NEW."tenantId"

    UNION ALL

    SELECT p."id", p."parentBusinessUnitId"
    FROM "BusinessUnit" p
    INNER JOIN ancestors a ON a."parentBusinessUnitId" = p."id"
    WHERE p."tenantId" = NEW."tenantId"
  )
  SELECT 1 INTO has_cycle
  FROM ancestors
  WHERE "id" = NEW."id"
  LIMIT 1;

  IF has_cycle = 1 THEN
    RAISE EXCEPTION 'Circular business unit hierarchy is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "business_unit_cycle_guard" ON "BusinessUnit";
CREATE TRIGGER "business_unit_cycle_guard"
BEFORE INSERT OR UPDATE OF "parentBusinessUnitId", "tenantId"
ON "BusinessUnit"
FOR EACH ROW
EXECUTE FUNCTION "check_business_unit_cycle"();
