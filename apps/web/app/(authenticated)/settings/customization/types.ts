import type { VisibilityRule } from "@/lib/runtime/visibility.resolver";

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

export type CustomizationComponentType =
  | "module"
  | "field"
  | "form"
  | "view"
  | "choiceList"
  | "relationship"
  | "relatedList"
  | "actionBar"
  | "action"
  | "widget"
  | "rule"
  | "automation"
  | "guidedProcess"
  | "documentMetadata"
  | "timelineConfig";

export type CustomizationPackageType = "default" | "custom";

export type CustomizationPackageState = "draft" | "published" | "archived";

export type CustomizationPublisher = {
  id?: string;
  publisherId: string;
  displayName: string;
  shortName?: string;
  prefix: string;
  isDefault?: boolean;
  isPrefixLocked?: boolean;
};

export type CustomizationPackage = {
  id: string;
  packageKey: string;
  displayName: string;
  description?: string | null;
  type: CustomizationPackageType | "managed" | "unmanaged" | "patch";
  state: CustomizationPackageState;
  publisher?: CustomizationPublisher;
  publisherId: string;
  publisherName: string;
  prefix: string;
  version: string;
  isDefault: boolean;
  isManaged: boolean;
  isReadOnly: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  deleteDisabledReason?: string | null;
  componentsCount: number;
  draftComponentsCount?: number;
  publishedComponentsCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CustomizationPackageComponent = {
  id: string;
  packageId: string;
  componentType:
    | CustomizationComponentType
    | "table"
    | "column"
    | "optionSet"
    | "lookup"
    | "actionBar";
  objectId?: string;
  objectKey?: string;
  logicalName: string;
  displayName: string;
  moduleKey?: string | null;
  moduleDisplayName?: string | null;
  moduleLogicalName?: string | null;
  tableKey?: string | null;
  tableDisplayName?: string | null;
  isSystem: boolean;
  isCustom: boolean;
  isManaged?: boolean;
  source?: "System" | "Custom";
  layerAction?: "Create" | "Modify" | "Reference" | "Remove";
  state?: "Draft" | "Published";
  version?: string;
  updatedAt?: string;
  dependencies?: readonly string[];
};

export type CustomizationPackageDetail = CustomizationPackage & {
  components: CustomizationPackageComponent[];
  diagnostics?: {
    valid: boolean;
    issues: CustomizationDependencyIssue[];
    draftComponentsCount: number;
    publishedComponentsCount: number;
    unsupportedComponentTypes: string[];
    missingHandlers: string[];
    permissionIssues: string[];
  };
};

export type CustomizationPackageCandidate = {
  objectId: string;
  objectKey: string;
  displayName: string;
  componentType:
    | "table"
    | "column"
    | "form"
    | "view"
    | "optionSet"
    | "lookup"
    | "actionBar";
  moduleKey: string | null;
  moduleDisplayName: string | null;
  isSystem: boolean;
  isCustom: boolean;
  dependencies: string[];
  alreadyInPackage: boolean;
};

export type CustomizationPackageExport = {
  manifest: {
    packageId: string;
    packageKey: string;
    displayName: string;
    version: string;
    publisher: CustomizationPublisher;
    exportedAt: string;
    formatVersion: "1.0";
  };
  modules: unknown[];
  components: unknown[];
  dependencies: unknown[];
};

export type CustomizationPackageImportPreview = {
  valid: boolean;
  applySupported: boolean;
  packageName: string;
  version: string;
  publisher: unknown;
  modulesCount: number;
  componentsCount: number;
  dependenciesCount: number;
  message: string;
};

export type CustomizationPublishDraftComponent = {
  id: string;
  componentId: string;
  objectId: string;
  componentName: string;
  componentType: string;
  module: string;
  packageId: string;
  packageKey?: string;
  packageName: string;
  layerAction: "create" | "modify" | "remove" | "reference";
  lifecycleState: "draft" | "published" | "deprecated" | "archived";
  modifiedOn: string;
  issues: string[];
};

export type CustomizationDependencyIssue = {
  severity: "error" | "warning" | "info";
  componentId?: string | null;
  componentType?: string | null;
  message: string;
  blocking: boolean;
};

export type CustomizationPublishValidationResult = {
  valid: boolean;
  issues: CustomizationDependencyIssue[];
};

export type DefaultSolutionComponentType =
  | "table"
  | "column"
  | "form"
  | "view"
  | "optionSet"
  | "lookup";

export type DefaultSolutionComponent = {
  id: string;
  componentType: DefaultSolutionComponentType;
  objectId: string;
  objectKey: string;
  tableKey: string | null;
  tableDisplayName: string | null;
  moduleKey: string | null;
  moduleLabel: string | null;
  displayName: string;
  logicalName: string;
  isSystem: boolean;
  isCustom: boolean;
  isManaged: boolean;
  isActive: boolean;
  isVisibleInCustomization: boolean;
  isValidForFormDesigner: boolean;
  isValidForViewDesigner: boolean;
  updatedAt: string;
};

export type DefaultSolution = {
  id: string;
  solutionKey: string;
  displayName: string;
  description: string | null;
  isDefault: boolean;
  isManaged: boolean;
  isSystem: boolean;
  updatedAt: string;
  components: DefaultSolutionComponent[];
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
  ownershipType?: string | null;
  displayOrder?: number;
  isCustomizable: boolean;
  isVisibleInCustomization?: boolean;
  isValidForAdvancedFind?: boolean;
  isValidForFormDesigner?: boolean;
  isValidForViewDesigner?: boolean;
  isEnabled: boolean;
  isActive: boolean;
  isSystem?: boolean;
  isCustom?: boolean;
  isCustomTable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  fieldsCount?: number;
  formsCount?: number;
  viewsCount?: number;
  choiceListsCount?: number;
  relationshipsCount?: number;
  actionBarsCount?: number;
  source?: "System" | "Custom";
  packageName?: string | null;
  lifecycleState?: "draft" | "published" | "deprecated" | "archived";
};

export type CustomizationColumn = {
  id: string | null;
  tableId: string;
  columnKey: string;
  systemName: string;
  displayName: string;
  description?: string | null;
  dataType: string;
  fieldType: string;
  isSystem: boolean;
  isCustom?: boolean;
  isActive?: boolean;
  isRequired: boolean;
  isSearchable: boolean;
  isFilterable?: boolean;
  isSortable: boolean;
  isVisible: boolean;
  isVisibleInCustomization?: boolean;
  isValidForFormDesigner?: boolean;
  isValidForViewDesigner?: boolean;
  /*
   * The column that names a record of this module. A lookup pointing at the
   * module shows this column's value. At most one column per module sets it.
   */
  isPrimaryName?: boolean;
  isReadOnly: boolean;
  lifecycleState?: "draft" | "published" | "deprecated" | "archived";
  maxLength: number | null;
  minValue?: number | string | null;
  maxValue?: number | string | null;
  defaultValue: string | null;
  lookupTargetTableKey: string | null;
  optionSetJson?: {
    options?: Array<string | { label?: string; value?: string }>;
  } | null;
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
  lifecycleState?: "draft" | "published" | "deprecated" | "archived";
};

export type CustomizationForm = {
  id: string;
  formKey: string;
  name: string;
  description: string | null;
  type: "main" | "minimal" | "quick" | "card" | "lookup" | "create" | "edit";
  isDefault: boolean;
  isActive: boolean;
  isSystem?: boolean;
  isCustom?: boolean;
  layoutJson?: FormLayoutJson;
  lifecycleState?: "draft" | "published" | "deprecated" | "archived";
};

export type FormLayoutField = {
  columnKey: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  isVisible?: boolean;
  columnSpan?: 1 | 2 | 3 | 4;
  sequence?: number;
};

export type FormLayoutSection = {
  id: string;
  label: string;
  description?: string;
  columns?: number;
  columnSpan?: 1 | 2 | 3 | 4;
  labelVisible?: boolean;
  isVisible?: boolean;
  sequence?: number;
  /*
   * Audience rules, evaluated by the same engine that gates commands and
   * navigation. `isVisible` above is an unconditional on/off for everyone;
   * these decide who among those who can reach the form actually sees this
   * section. Both adapters that turn this layout into runtime metadata carry
   * the rules through, so a rule saved here reaches the renderer.
   */
  visibilityRules?: VisibilityRule[];
  fields: FormLayoutField[];
  components?: FormLayoutComponent[];
};

export type FormLayoutComponent = {
  id: string;
  componentType: "widget";
  widgetId: string;
  widgetType: "timeline" | "reporting_hierarchy" | string;
  label?: string;
  columnSpan?: 1 | 2 | 3 | 4;
  height?: number;
  isInitiallyCollapsed?: boolean;
  placementConfig?: Record<string, unknown>;
  sequence?: number;
};

export type FormLayoutTab = {
  id: string;
  label: string;
  tabType?: "fields" | "related_module";
  columns?: 1 | 2 | 3 | 4;
  sequence?: number;
  /* See FormLayoutSection.visibilityRules — same engine, same guarantees. */
  visibilityRules?: VisibilityRule[];
  sections: FormLayoutSection[];
  relationshipId?: string;
  relatedModuleKey?: string;
};

export type FormLayoutJson = {
  columns?: 1 | 2 | 3 | 4;
  tabs: FormLayoutTab[];
};
