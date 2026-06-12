import { apiRequestJson } from "@/lib/server-api";
import { buildEmployeeMetadataBundle } from "@/lib/runtime/modules/employee-metadata.adapter";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { TableDetailShell } from "../../_components/table-detail-shell";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
  CustomizationTable,
  CustomizationView,
} from "../../types";

type TableDetailPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableDetailPage({
  params,
}: TableDetailPageProps) {
  const { tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
  ]);

  const [table, columns, views, forms, lookupTables, packages] = await Promise.all([
    apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
    apiRequestJson<CustomizationColumn[]>(
      `/customization/tables/${tableKey}/columns`,
    ),
    apiRequestJson<CustomizationView[]>(
      `/customization/tables/${tableKey}/views`,
    ),
    apiRequestJson<CustomizationForm[]>(
      `/customization/tables/${tableKey}/forms`,
    ),
    apiRequestJson<CustomizationTable[]>("/customization/tables"),
    apiRequestJson<CustomizationPackage[]>("/customization/packages"),
  ]);
  const resolvedForms = mergeRuntimeForms(tableKey, forms);
  const resolvedViews = mergeRuntimeViews(tableKey, views);

  return (
    <SettingsShell
      description={`Configure metadata for ${table.pluralDisplayName}, including fields, saved views, form layouts, and module-level settings.`}
      eyebrow="Customization"
      title={table.pluralDisplayName}
    >
      <TableDetailShell
        columns={columns}
        forms={resolvedForms}
        lookupTables={lookupTables}
        packages={packages}
        table={table}
        views={resolvedViews}
      />
    </SettingsShell>
  );
}

function mergeRuntimeForms(
  tableKey: string,
  forms: readonly CustomizationForm[],
): CustomizationForm[] {
  if (tableKey !== "employees") return [...forms];

  const byKey = new Map(forms.map((form) => [form.formKey, form]));
  const runtimeForms = buildEmployeeMetadataBundle().forms.map((form) => {
    const formKey = form.logicalName.replace(/^employees\./, "");
    return {
      id: form.id,
      formKey,
      name: form.displayName.trim() || form.logicalName,
      description: form.description ?? null,
      type: form.logicalName.includes("minimal") ? "quick" : "main",
      isDefault: form.logicalName === "employee.main.full",
      isActive: form.lifecycleState !== "retired",
      isSystem: form.layer === "system",
      isCustom: form.layer !== "system",
      layoutJson: {
        tabs: (form.tabs ?? [])
          .filter((tab) => tab.type === "fields")
          .map((tab) => ({
            id: tab.tabKey,
            label: tab.label,
            sequence: tab.order,
            sections: form.sections
              .filter((section) => section.tabKey === tab.tabKey)
              .map((section) => ({
                id: section.id,
                label: section.label,
                columns: layoutColumns(section.layout),
                sequence: section.order,
                fields: section.fields.map((field) => ({
                  columnKey: field.fieldLogicalName,
                  label: field.label,
                  required: field.requirementLevel === "required",
                  readOnly: field.isReadonly,
                  isVisible: field.isVisible,
                  sequence: field.order,
                })),
              })),
          })),
      },
    } satisfies CustomizationForm;
  });

  for (const form of runtimeForms) {
    if (!byKey.has(form.formKey)) byKey.set(form.formKey, form);
  }

  return Array.from(byKey.values());
}

function mergeRuntimeViews(
  tableKey: string,
  views: readonly CustomizationView[],
): CustomizationView[] {
  if (tableKey !== "employees") return [...views];

  const byKey = new Map(views.map((view) => [view.viewKey, view]));
  const runtimeViews = buildEmployeeMetadataBundle().views.map((view) => {
    const viewKey = view.logicalName.replace(/^employees\./, "");
    return {
      id: view.id,
      viewKey,
      name: view.displayName,
      description: view.description ?? null,
      type: view.layer === "system" ? "system" : "custom",
      isDefault: Boolean(view.isDefault),
      isHidden: view.lifecycleState === "retired",
      columnsJson: {
        columns: view.columns
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((column) => ({
            columnKey: column.fieldLogicalName,
            sortOrder: column.order,
          })),
      },
      filtersJson: view.filters,
      sortingJson: view.defaultSort,
      visibilityScope: "tenant",
    } satisfies CustomizationView;
  });

  for (const view of runtimeViews) {
    if (!byKey.has(view.viewKey)) byKey.set(view.viewKey, view);
  }

  return Array.from(byKey.values());
}

function layoutColumns(layout: string | undefined) {
  if (layout === "single-column") return 1;
  if (layout === "three-column") return 3;
  if (layout === "four-column") return 4;
  return 2;
}
