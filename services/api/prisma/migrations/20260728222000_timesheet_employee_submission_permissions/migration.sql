-- Employees must be able to submit and withdraw their own timesheets.
-- Keep persisted system roles aligned with SYSTEM_ROLE_MISC_PERMISSIONS.
INSERT INTO "RolePermission" (
  "id",
  "tenantId",
  "roleId",
  "permissionId",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  role."tenantId",
  role."id",
  permission."id",
  NOW(),
  NOW()
FROM "Role" AS role
INNER JOIN "Permission" AS permission
  ON permission."tenantId" = role."tenantId"
WHERE role."key" = 'employee'
  AND role."isActive" = TRUE
  AND permission."key" IN ('timesheets.submit', 'timesheets.withdraw')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
