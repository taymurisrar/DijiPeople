export type CustomizationSummary = {
  existingSystemTablesOnly: boolean;
  customTablesEnabled: boolean;
  systemTables: number;
  tableOverrides: number;
  configuredTables: number;
  tenantColumns: number;
  views: number;
  tenantForms: number;
  publishSnapshots: number;
};

export type CustomizationPublishHistoryItem = {
  id: string;
  version: number;
  status: "draft" | "published" | "failed";
  publishedByUserId: string | null;
  publishedByName: string | null;
  publishedByEmail: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type CustomizationPublishValidationError = {
  scope: "table" | "column" | "view" | "form";
  tableKey?: string;
  entityKey?: string;
  message: string;
};

export type CustomizationTable = {
  id: string | null;
  tableKey: string;
  moduleKey: string;
  systemName: string;
  displayName: string;
  pluralName: string;
  pluralDisplayName: string;
  description: string | null;
  icon: string | null;
  isCustomizable: boolean;
  isEnabled: boolean;
  isActive: boolean;
  isCustomTable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomizationColumn = {
  id: string | null;
  tableId: string;
  columnKey: string;
  systemName: string;
  displayName: string;
  dataType: string;
  fieldType: string;
  isSystem: boolean;
  isRequired: boolean;
  isSearchable: boolean;
  isSortable: boolean;
  isVisible: boolean;
  isReadOnly: boolean;
  maxLength: number | null;
  minValue?: number | string | null;
  maxValue?: number | string | null;
  defaultValue: string | null;
  lookupTargetTableKey: string | null;
  optionSetJson?: { options?: Array<string | { label?: string; value?: string }> } | null;
  validationJson?: Record<string, unknown> | null;
  sortOrder: number;
};

export type CustomizationView = {
  id: string;
  tableId?: string;
  viewKey: string;
  name: string;
  description: string | null;
  type: "system" | "custom";
  isDefault: boolean;
  isHidden: boolean;
  columnsJson?: unknown;
  filtersJson?: unknown;
  sortingJson?: unknown;
  visibilityScope: "tenant" | "role" | "user";
};

export type CustomizationForm = {
  id: string;
  formKey: string;
  name: string;
  description: string | null;
  type: "main" | "quick" | "create" | "edit";
  isDefault: boolean;
  isActive: boolean;
  layoutJson?: FormLayoutJson;
};

export type FormLayoutField = {
  columnKey: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  isVisible?: boolean;
};

export type FormLayoutSection = {
  id: string;
  label: string;
  description?: string;
  columns?: number;
  fields: FormLayoutField[];
};

export type FormLayoutTab = {
  id: string;
  label: string;
  sections: FormLayoutSection[];
};

export type FormLayoutJson = {
  tabs: FormLayoutTab[];
};
