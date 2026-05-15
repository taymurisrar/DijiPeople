"use client";

import {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
} from "../types";
import { RoleDesignerPage } from "./role-designer";

export function RoleDetailClient({
  initialRole,
  assignedUsers,
  matrixCatalog,
  roles,
}: {
  initialRole: AccessRoleRecord;
  assignedUsers: AccessUserRecord[];
  matrixCatalog: RoleMatrixCatalog;
  roles: AccessRoleRecord[];
}) {
  return (
    <RoleDesignerPage
      assignedUsers={assignedUsers}
      initialRole={initialRole}
      matrixCatalog={matrixCatalog}
      roles={roles}
    />
  );
}
