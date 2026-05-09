ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

UPDATE "Employee" AS employee
SET "ownerUserId" = COALESCE(
  employee."createdById",
  tenant."ownerUserId",
  fallback_user.id
)
FROM "Tenant" AS tenant
LEFT JOIN LATERAL (
  SELECT app_user.id
  FROM "User" AS app_user
  WHERE app_user."tenantId" = tenant.id
  ORDER BY app_user."createdAt" ASC, app_user.id ASC
  LIMIT 1
) AS fallback_user ON TRUE
WHERE employee."tenantId" = tenant.id
  AND employee."ownerUserId" IS NULL;

CREATE INDEX IF NOT EXISTS "Employee_ownerUserId_idx" ON "Employee"("ownerUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Employee_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "Employee"
      ADD CONSTRAINT "Employee_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
