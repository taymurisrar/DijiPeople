import { apiRequestJson } from "@/lib/server-api";

export type RuntimeFormLayoutField = {
  columnKey: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  isVisible?: boolean;
};

export type RuntimeFormLayoutSection = {
  id: string;
  label: string;
  description?: string;
  columns?: number;
  fields: RuntimeFormLayoutField[];
};

export type RuntimeFormLayout = {
  tabs: Array<{
    id: string;
    label: string;
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

async function getTableForms(tableKey: string) {
  const published = await apiRequestJson<PublishedCustomizationResponse>(
    "/customization/published",
  ).catch(() => null);

  if (!published?.published || !published.snapshotJson) return [];
  const table = published.snapshotJson.tables?.find(
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
