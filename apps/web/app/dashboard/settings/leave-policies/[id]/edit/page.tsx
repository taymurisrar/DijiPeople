import { apiRequestJson } from "@/lib/server-api";
import { LeavePoliciesForm } from "../../../_components/leave-policies-form";
import { SettingsShell } from "../../../_components/settings-shell";
import { LeavePolicyRecord } from "../../../types";

type EditLeavePolicyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLeavePolicyPage({
  params,
}: EditLeavePolicyPageProps) {
  const { id } = await params;
  const policy = await apiRequestJson<LeavePolicyRecord>(`/leave-policies/${id}`);

  return (
    <SettingsShell
      description="Adjust leave policy rules while keeping the platform ready for future assignments, requests, and approval chains."
      eyebrow="Leave Settings"
      title={`Edit ${policy.name}`}
    >
      <LeavePoliciesForm
        initialValues={{
          name: policy.name,
          accrualType: policy.accrualType,
          annualEntitlement: policy.annualEntitlement,
          carryForwardAllowed: policy.carryForwardAllowed,
          carryForwardLimit: policy.carryForwardLimit || "",
          negativeBalanceAllowed: policy.negativeBalanceAllowed,
          genderRestriction: policy.genderRestriction || "",
          probationRestriction: Boolean(policy.probationRestriction),
          requiresDocumentAfterDays:
            policy.requiresDocumentAfterDays?.toString() || "",
          isActive: policy.isActive,
        }}
        leavePolicyId={policy.id}
        mode="edit"
      />
    </SettingsShell>
  );
}
