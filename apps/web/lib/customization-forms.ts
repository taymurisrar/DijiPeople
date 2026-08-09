import { apiRequestJson } from "@/lib/server-api";
import type { VisibilityRule } from "@/lib/runtime/visibility.resolver";

export type RuntimeFormLayoutField = {
  columnKey: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  isVisible?: boolean;
  columnSpan?: 1 | 2 | 3 | 4;
  sequence?: number;
};

export type RuntimeFormLayoutSection = {
  id: string;
  label: string;
  description?: string;
  columns?: number;
  labelVisible?: boolean;
  isVisible?: boolean;
  sequence?: number;
  /*
   * Audience rules authored in the form designer. `isVisible` is an
   * unconditional switch; these narrow the section to a set of people. Both
   * adapters that build runtime metadata from this layout pass them straight
   * to the shared rule engine.
   */
  visibilityRules?: VisibilityRule[];
  fields: RuntimeFormLayoutField[];
  components?: RuntimeFormLayoutComponent[];
};

export type RuntimeFormLayoutComponent = {
  id: string;
  componentType: "widget";
  widgetId: string;
  widgetType: string;
  label?: string;
  columnSpan?: 1 | 2 | 3 | 4;
  height?: number;
  isInitiallyCollapsed?: boolean;
  placementConfig?: Record<string, unknown>;
  sequence?: number;
};

export type RuntimeFormLayout = {
  columns?: 1 | 2 | 3 | 4;
  tabs: Array<{
    id: string;
    label: string;
    columns?: 1 | 2 | 3 | 4;
    sequence?: number;
    /* See RuntimeFormLayoutSection.visibilityRules. */
    visibilityRules?: VisibilityRule[];
    sections: RuntimeFormLayoutSection[];
  }>;
};

export type RuntimeCustomizationForm = {
  id: string;
  tableKey: string;
  formKey: string;
  name: string;
  type: "main" | "quick" | "create" | "edit";
  isDefault: boolean;
  isActive: boolean;
  layoutJson: RuntimeFormLayout;
};

type PublishedCustomizationResponse = {
  published: boolean;
  snapshotJson?: {
    tables?: Array<{ id: string; tableKey: string }>;
    modules?: Array<{ id: string; tableKey: string }>;
    forms?: Array<{
      id: string;
      tableId: string;
      formKey: string;
      name: string;
      type: "main" | "quick" | "create" | "edit";
      isDefault?: boolean;
      isActive?: boolean;
      layoutJson?: RuntimeFormLayout;
    }>;
  } | null;
};

export async function getDefaultForm(
  tableKey: string,
  formType: RuntimeCustomizationForm["type"] = "main",
) {
  const forms = await getTableForms(tableKey);
  return (
    forms.find((form) => form.type === formType && form.isDefault) ??
    forms.find((form) => form.type === formType) ??
    forms.find((form) => form.isDefault) ??
    forms[0] ??
    null
  );
}

export async function resolveFormLayout(tableKey: string, formKey?: string) {
  const forms = await getTableForms(tableKey);
  const form =
    forms.find((item) => item.formKey === formKey) ??
    forms.find((item) => item.isDefault) ??
    forms[0] ??
    null;

  return form?.layoutJson ?? null;
}

export async function getTableForms(tableKey: string) {
  const published = await apiRequestJson<PublishedCustomizationResponse>(
    "/runtime-metadata/published",
  ).catch(() => null);

  if (!published?.published || !published.snapshotJson) return [];
  const tables =
    published.snapshotJson.tables ?? published.snapshotJson.modules ?? [];
  const table = tables.find(
    (item) => item.tableKey === tableKey,
  );
  if (!table) return [];

  return (published.snapshotJson.forms ?? [])
    .filter((form) => form.tableId === table.id && form.isActive !== false)
    .map((form) => ({
      id: form.id,
      tableKey,
      formKey: form.formKey,
      name: form.name,
      type: form.type,
      isDefault: Boolean(form.isDefault),
      isActive: form.isActive !== false,
      layoutJson: normalizeLayout(form.layoutJson),
    }));
}

function normalizeLayout(layout?: RuntimeFormLayout) {
  return layout?.tabs?.length ? layout : { tabs: [] };
}
