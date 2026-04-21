import { LeavePoliciesForm } from "../../_components/leave-policies-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  accrualType: "FIXED_ANNUAL" as const,
  annualEntitlement: "0",
  carryForwardAllowed: false,
  carryForwardLimit: "",
  negativeBalanceAllowed: false,
  genderRestriction: "",
  probationRestriction: false,
  requiresDocumentAfterDays: "",
  isActive: true,
};

export default function NewLeavePolicyPage() {
  return (
    <SettingsShell
      description="Create flexible leave policies that define entitlement and restrictions without coupling to payroll or leave requests yet."
      eyebrow="Leave Settings"
      title="Create Leave Policy"
    >
      <LeavePoliciesForm initialValues={initialValues} mode="create" />
    </SettingsShell>
  );
}
