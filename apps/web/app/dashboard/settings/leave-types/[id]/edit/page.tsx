import { apiRequestJson } from "@/lib/server-api";
import { LeaveTypesForm } from "../../../_components/leave-types-form";
import { SettingsShell } from "../../../_components/settings-shell";
import { LeaveTypeRecord } from "../../../types";

type EditLeaveTypePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLeaveTypePage({
  params,
}: EditLeaveTypePageProps) {
  const { id } = await params;
  const leaveType = await apiRequestJson<LeaveTypeRecord>(`/leave-types/${id}`);

  return (
    <SettingsShell
      description="Update leave type behavior without hardcoding workflow logic into the platform."
      eyebrow="Leave Settings"
      title={`Edit ${leaveType.name}`}
    >
      <LeaveTypesForm
        initialValues={{
          name: leaveType.name,
          code: leaveType.code,
          category: leaveType.category,
          isPaid: leaveType.isPaid,
          requiresApproval: leaveType.requiresApproval,
          isActive: leaveType.isActive,
        }}
        leaveTypeId={leaveType.id}
        mode="edit"
      />
    </SettingsShell>
  );
}
