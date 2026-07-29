import { buildEmployeeMetadataBundle } from "@/lib/runtime/modules/employee-metadata.adapter";
import type { CustomizationForm, CustomizationView } from "../types";

export function mergeRuntimeForms(
  tableKey: string,
  forms: readonly CustomizationForm[],
): CustomizationForm[] {
  if (tableKey !== "employees") return [...forms];

  const byKey = new Map(forms.map((form) => [form.formKey, form]));
  for (const form of buildEmployeeMetadataBundle().forms) {
    const formKey = form.logicalName.replace(/^employees\./, "");
    const resolved = {
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
    if (!byKey.has(formKey)) byKey.set(formKey, resolved);
  }

  return Array.from(byKey.values());
}

export function mergeRuntimeViews(
  tableKey: string,
  views: readonly CustomizationView[],
): CustomizationView[] {
  if (tableKey !== "employees") return [...views];

  const byKey = new Map(views.map((view) => [view.viewKey, view]));
  for (const view of buildEmployeeMetadataBundle().views) {
    const viewKey = view.logicalName.replace(/^employees\./, "");
    const resolved = {
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
    if (!byKey.has(viewKey)) byKey.set(viewKey, resolved);
  }

  return Array.from(byKey.values());
}

function layoutColumns(layout: string | undefined) {
  if (layout === "single-column") return 1;
  if (layout === "three-column") return 3;
  if (layout === "four-column") return 4;
  return 2;
}
