import { notFound } from "next/navigation";
import { apiRequestJson } from "@/lib/server-api";
import { getAudienceOptions } from "@/lib/runtime/audience-options.server";
import { SettingsShell } from "../../../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../../../_lib/require-settings-permission";
import { FormDesignerWorkspace } from "../../../../../_components/form-designer-workspace";
import { mergeRuntimeForms } from "../../../../../_lib/runtime-customization-metadata";
import type {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
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

  const [table, columns, forms, packages, audiences] = await Promise.all([
    apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
    apiRequestJson<CustomizationColumn[]>(
      `/customization/tables/${tableKey}/columns`,
    ),
    apiRequestJson<CustomizationForm[]>(
      `/customization/tables/${tableKey}/forms`,
    ),
    apiRequestJson<CustomizationPackage[]>("/customization/packages").catch(
      () => [] as CustomizationPackage[],
    ),
    getAudienceOptions(),
  ]);
  /*
   * Resolved through the same merge the module list uses.
   *
   * Some forms are defined in application code and have no row until a tenant
   * customizes them, so looking only at the API response made the designer 404
   * on exactly the forms the list had just shown. Saving one still creates its
   * customization layer — the API builds the row from the effective system
   * form when none exists.
   */
  const form = mergeRuntimeForms(tableKey, forms).find(
    (item) => item.id === formId || item.formKey === formId,
  );
  if (!form) notFound();

  return (
    /*
     * The designer runs without the settings header and settings sidebar.
     *
     * Both duplicated what the designer already shows — its own toolbar carries
     * Back, Save and the form name — while taking roughly a third of the width
     * the canvas needs to resemble the form it is editing.
     */
    <SettingsShell
      description="Design tabs, sections, fields, and form-specific field behavior."
      eyebrow="Form designer"
      showHeader={false}
      showSidebar={false}
      title={`${table.displayName} - ${form.name}`}
    >
      <FormDesignerWorkspace
        audiences={audiences}
        columns={columns}
        form={form}
        packages={packages}
        table={table}
      />
    </SettingsShell>
  );
}
