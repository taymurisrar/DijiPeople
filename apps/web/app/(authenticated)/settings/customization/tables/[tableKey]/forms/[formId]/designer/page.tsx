import { notFound } from "next/navigation";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../../../_lib/require-settings-permission";
import { FormDesignerWorkspace } from "../../../../../_components/form-designer-workspace";
import type {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
} from "../../../../../types";

type FormDesignerRouteProps = {
  params: Promise<{ tableKey: string; formId: string }>;
};

export default async function CustomizationFormDesignerRoute({
  params,
}: FormDesignerRouteProps) {
  const { formId, tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
    "customization.forms.read",
  ]);

  const [table, columns, forms] = await Promise.all([
    apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
    apiRequestJson<CustomizationColumn[]>(
      `/customization/tables/${tableKey}/columns`,
    ),
    apiRequestJson<CustomizationForm[]>(
      `/customization/tables/${tableKey}/forms`,
    ),
  ]);
  const form = forms.find(
    (item) => item.id === formId || item.formKey === formId,
  );
  if (!form) notFound();

  return (
    <SettingsShell
      description="Design tabs, sections, fields, and form-specific field behavior."
      eyebrow="Form designer"
      title={`${table.displayName} - ${form.name}`}
    >
      <FormDesignerWorkspace columns={columns} form={form} table={table} />
    </SettingsShell>
  );
}
