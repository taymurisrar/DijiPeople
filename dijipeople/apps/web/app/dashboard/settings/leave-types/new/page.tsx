import { LeaveTypesForm } from "../../_components/leave-types-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  code: "",
  category: "",
  isPaid: true,
  requiresApproval: true,
  isActive: true,
};

export default function NewLeaveTypePage() {
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
