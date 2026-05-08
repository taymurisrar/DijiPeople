import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { LeavePolicyAssignmentsManager } from "../../../_components/leave-policy-assignments-manager";
import { LeavePoliciesForm } from "../../../_components/leave-policies-form";
import { LeavePolicyRulesManager } from "../../../_components/leave-policy-rules-manager";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import {
  LeavePolicyAssignmentRecord,
  LeavePolicyRecord,
  LeavePolicyRuleRecord,
  LeaveTypeRecord,
} from "../../../types";

type EditLeavePolicyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLeavePolicyPage({
  params,
}: EditLeavePolicyPageProps) {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.LEAVE_POLICIES_UPDATE,
  ]);

  const { id } = await params;

  const canReadAssignments = hasAnySettingsPermission(user, [
    PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_READ,
  ]);
  const canManageAssignments = hasAnySettingsPermission(user, [
    PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_CREATE,
    PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_UPDATE,
    PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_DELETE,
  ]);

  const [policy, leavePolicies, leaveTypes, rules, assignments] =
    await Promise.all([
    apiRequestJson<LeavePolicyRecord>(`/leave-policies/${id}`),
    apiRequestJson<LeavePolicyRecord[]>("/leave-policies"),
    apiRequestJson<LeaveTypeRecord[]>("/leave-types"),
    apiRequestJson<LeavePolicyRuleRecord[]>(`/leave-policies/${id}/rules`),
    canReadAssignments
      ? apiRequestJson<LeavePolicyAssignmentRecord[]>(
          "/leave-policies/assignments",
        )
      : Promise.resolve([]),
  ]);

  return (
    <SettingsShell
      description="Adjust leave policy rules while keeping the platform ready for future assignments, requests, and approval chains."
      eyebrow="Leave Settings"
      title={`Edit ${policy.name}`}
    >
      <div className="grid gap-6">
        <LeavePoliciesForm
          initialValues={{
            name: policy.name,
            isActive: policy.isActive,
          }}
          leavePolicyId={policy.id}
          mode="edit"
        />

        <LeavePolicyRulesManager
          leavePolicyId={policy.id}
          leaveTypes={leaveTypes}
          rules={rules}
        />

        {canReadAssignments ? (
          <LeavePolicyAssignmentsManager
            assignments={assignments}
            canManage={canManageAssignments}
            currentPolicyId={policy.id}
            leavePolicies={leavePolicies}
          />
        ) : null}
      </div>
    </SettingsShell>
  );
}
