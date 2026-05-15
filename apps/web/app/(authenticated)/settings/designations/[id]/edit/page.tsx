import { apiRequestJson } from "@/lib/server-api";
import { DesignationsForm } from "../../../_components/designations-form";
import { SettingsShell } from "../../../_components/settings-shell";
import { DesignationRecord } from "../../../types";

type EditDesignationPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDesignationPage({
  params,
}: EditDesignationPageProps) {
  const { id } = await params;
  const designation = await apiRequestJson<DesignationRecord>(
    `/designations/${id}`,
  );

  return (
    <SettingsShell
      description="Maintain designation titles and levels in one place so later reporting and approvals can depend on stable master data."
      eyebrow="Organization Settings"
      title={`Edit ${designation.name}`}
    >
      <DesignationsForm
        designationId={designation.id}
        initialValues={{
          name: designation.name,
          level: designation.level || "",
          description: designation.description || "",
          isActive: designation.isActive,
        }}
        mode="edit"
      />
    </SettingsShell>
  );
}
