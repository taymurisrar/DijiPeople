import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { ApprovalMatricesManager } from "../_components/approval-matrices-manager";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import {
  ApprovalMatrixRecord,
  LeavePolicyRecord,
  LeaveTypeRecord,
  RoleRecord,
  UserOptionRecord,
} from "../types";

const managePermissions = [
  PERMISSION_KEYS.APPROVAL_MATRICES_CREATE,
  PERMISSION_KEYS.APPROVAL_MATRICES_UPDATE,
  PERMISSION_KEYS.APPROVAL_MATRICES_DELETE,
];

export default async function ApprovalMatricesPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.APPROVAL_MATRICES_READ,
  ]);

  const [approvalMatrices, leaveTypes, leavePolicies, roles, users] =
    await Promise.all([
      apiRequestJson<ApprovalMatrixRecord[]>("/approval-matrices"),
      apiRequestJson<LeaveTypeRecord[]>("/leave-types"),
      apiRequestJson<LeavePolicyRecord[]>("/leave-policies"),
      apiRequestJson<RoleRecord[]>("/roles").catch(() => []),
      apiRequestJson<UserOptionRecord[]>("/users").catch(() => []),
    ]);

  return (
    <SettingsShell
      description="Approval matrices route approvals for leave requests, timesheets, claims, trips, resources, payroll, and future workflows. Leave filters appear only when the module is leave."
      eyebrow="Leave Settings"
      title="Approval Matrices"
    >
      <ApprovalMatricesManager
        approvalMatrices={approvalMatrices}
        canManage={hasAnySettingsPermission(user, managePermissions)}
        leavePolicies={leavePolicies}
        leaveTypes={leaveTypes}
        roles={roles}
        users={users}
      />
    </SettingsShell>
  );
}
