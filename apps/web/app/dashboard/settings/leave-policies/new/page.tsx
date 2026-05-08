import { PERMISSION_KEYS } from "@/lib/security-keys";
import { LeavePoliciesForm } from "../../_components/leave-policies-form";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";

const initialValues = {
  name: "",
  isActive: true,
};

export default async function NewLeavePolicyPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.LEAVE_POLICIES_CREATE]);

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
