import { generateUniqueNumberCode } from "@/lib/common";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { LeaveTypesForm } from "../../_components/leave-types-form";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";

export default async function NewLeaveTypePage() {
  await requireSettingsPermissions([PERMISSION_KEYS.LEAVE_TYPES_CREATE]);

  const initialValues = {
    name: "",
    code: generateUniqueNumberCode({
      digits: 3,
    }),
    category: "GENERAL",
    isPaid: true,
    requiresApproval: true,
    isActive: true,
  };

  return (
    <SettingsShell
      description="Create reusable leave categories that stay business-friendly and tenant-specific."
      eyebrow="Leave Settings"
      title="Create Leave Type"
    >
      <LeaveTypesForm initialValues={initialValues} mode="create" />
    </SettingsShell>
  );
}
