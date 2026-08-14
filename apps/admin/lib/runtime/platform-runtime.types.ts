export type PlatformModuleKey =
  | "dashboard"
  | "leads"
  | "partners"
  | "partner-inquiries"
  | "customers"
  | "partner-onboarding"
  | "customer-onboarding"
  | "tenants"
  | "contracts"
  | "contract-templates"
  | "signature-requests"
  | "support-cases"
  | "subscriptions"
  | "plans"
  | "invoices"
  | "payments"
  | "commissions"
  | "monitoring-incidents";

export type RuntimeFieldType =
  | "text"
  | "longText"
  | "richText"
  | "email"
  | "phone"
  | "url"
  | "integer"
  | "decimal"
  | "currency"
  | "percentage"
  | "date"
  | "dateTime"
  | "boolean"
  | "option"
  | "multiSelect"
  | "lookup"
  | "userLookup"
  | "teamLookup"
  | "file"
  | "documentEditor"
  | "signature"
  | "json"
  | "timeline"
  | "relatedRecords"
  | "process";

export type RuntimeColumnFormat =
  | "text"
  | "status"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "dateTime"
  | "lookup";
export type RuntimeActionKey =
  | "back"
  | "new"
  | "edit"
  | "save"
  | "save-close"
  | "delete"
  | "bulk-delete"
  | "assign"
  | "bulk-assign"
  | "activate"
  | "deactivate"
  | "approve"
  | "reject"
  | "submit"
  | "send"
  | "resend"
  | "refresh"
  | "export"
  | "duplicate"
  | "convert"
  | "generate-document"
  | "upload-document"
  | "send-signature"
  | "cancel"
  | "close"
  | "reopen"
  | "reset-password"
  | "send-activation"
  | string;

export type RuntimeFilterOperator =
  | "eq"
  | "ne"
  | "contains"
  | "startsWith"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "isNull"
  | "isNotNull";
export type RuntimeSort = { field: string; direction: "asc" | "desc" };
export type RuntimeFilter = {
  id?: string;
  field: string;
  operator: RuntimeFilterOperator;
  value?: unknown;
  values?: unknown[];
};

export type RuntimeViewDefinition = {
  key: string;
  label: string;
  description?: string;
  kind?: "system" | "personal" | "team";
  isSystemDefault?: boolean;
  filters?: RuntimeFilter[];
  sort?: RuntimeSort[];
  roles?: string[];
};

export type RuntimeColumnDefinition = {
  key: string;
  label: string;
  field: string;
  format?: RuntimeColumnFormat;
  currencyField?: string;
  lookupLabelField?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  visible?: boolean;
  pinned?: "left" | "right";
};

export type RuntimeFieldDefinition = {
  key: string;
  label: string;
  type: RuntimeFieldType;
  section: string;
  tab?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  hideOnCreate?: boolean;
  hideWhenEmpty?: boolean;
  options?: Array<{ value: string; label: string }>;
  optionsByFieldValue?: {
    field: string;
    values: Record<string, Array<{ value: string; label: string }>>;
  };
  lookupModule?: PlatformModuleKey;
  lookupPath?: string;
  /**
   * Business presentation metadata: where the human-readable label for this
   * value lives on the record. Schema tells the runtime that `customerAccountId`
   * is a required string; only this says it should read as "Maseer Group".
   * Dot paths are resolved against the loaded record.
   */
  displayValueField?: string;
  /**
   * Link template for the resolved display value. `{field}` placeholders are
   * substituted from the record, e.g. `/customers/{customerAccountId}`.
   */
  displayHref?: string;
  /**
   * How the read-only value should be drawn. `status` renders the shared status
   * pill; `identifier` renders a copyable technical id, which is what the System
   * tab wants and what a business field must never be.
   */
  renderAs?: "status" | "identifier" | "code";
  roles?: string[];
  columnSpan?: 1 | 2 | 3;
  min?: number;
  max?: number;
  maxLength?: number;
  visibleWhen?: {
    field: string;
    equals?: unknown;
    in?: unknown[];
    hasValue?: boolean;
  };
  visibleWhenAny?: Array<{
    field: string;
    equals?: unknown;
    in?: unknown[];
    hasValue?: boolean;
  }>;
  requiredWhen?: { field: string; equals: unknown };
  readOnlyWhen?: { field: string; equals: unknown };
  acceptedFileTypes?: string[];
  maxFileSizeBytes?: number;
};

export type RuntimeFormDefinition = {
  key: "create" | "detail" | "edit";
  tabs?: Array<{ key: string; label: string }>;
  sections: Array<{
    key: string;
    label: string;
    description?: string;
    columns?: 1 | 2 | 3;
    tab?: string;
  }>;
  fields: RuntimeFieldDefinition[];
};

export type RuntimeActionDefinition = {
  key: RuntimeActionKey;
  label: string;
  icon?: string;
  placement?: "primary" | "secondary" | "overflow";
  scope: "list" | "record" | "both";
  permission?: string;
  roles?: string[];
  selection?: "none" | "one" | "many" | "any";
  states?: string[];
  destructive?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  disabledReason?: string;
  href?: string;
};

export type RuntimeStatusDefinition = {
  value: string;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  terminal?: boolean;
};
export type RuntimeProcessDefinition = {
  key: string;
  stages: Array<{
    key: string;
    label: string;
    requiredFields?: string[];
    permissions?: string[];
    ownerField?: string;
    enteredAtField?: string;
    blockedWhen?: { field: string; equals: unknown };
  }>;
  terminalOutcomes?: Array<{
    key: string;
    label: string;
    tone?: "neutral" | "success" | "danger";
  }>;
  branches?: Array<{
    from: string;
    to: string;
    when: { field: string; equals: unknown };
  }>;
};

export type PlatformModuleDefinition = {
  key: PlatformModuleKey;
  entityType: string;
  displayName: string;
  pluralDisplayName: string;
  description: string;
  icon: string;
  routeBase: string;
  navigationGroup:
    | "workspace"
    | "customers"
    | "partners"
    | "agreements"
    | "revenue"
    | "support"
    | "system";
  apiBase: string;
  views: RuntimeViewDefinition[];
  defaultView: string;
  columns: RuntimeColumnDefinition[];
  defaultSort: RuntimeSort[];
  searchableFields: string[];
  filterableFields: string[];
  forms: RuntimeFormDefinition[];
  actions: RuntimeActionDefinition[];
  statuses?: RuntimeStatusDefinition[];
  process?: RuntimeProcessDefinition;
  relatedRecords?: Array<{
    key: string;
    label: string;
    tab?: string;
    description?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    createHref?: string;
    module?: PlatformModuleKey;
    foreignKey: string;
    columns?: RuntimeColumnDefinition[];
  }>;
  permissions: {
    read: string;
    create?: string;
    update?: string;
    delete?: string;
    assign?: string;
    approve?: string;
    export?: string;
  };
  fieldAccess?: Record<string, { readRoles?: string[]; writeRoles?: string[] }>;
  emptyState: { title: string; description: string; actionLabel?: string };
  importExport?: { import?: boolean; export?: boolean; formats?: string[] };
  dashboard?: { widgetKeys: string[] };
};

export type RuntimeQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  viewKey?: string;
  filters?: RuntimeFilter[];
  sort?: RuntimeSort[];
  selectedColumns?: string[];
  signal?: AbortSignal;
};
export type RuntimePageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
};
export type RuntimeRecord = Record<string, unknown> & { id: string };
export type RuntimeListResponse<T extends RuntimeRecord = RuntimeRecord> = {
  items: T[];
  meta: RuntimePageMeta;
  permissions?: string[];
  availableActions?: string[];
  filterMetadata?: Record<string, unknown>;
  sortMetadata?: Record<string, unknown>;
};
export type RuntimeRecordResponse<T extends RuntimeRecord = RuntimeRecord> = {
  item: T;
  permissions?: string[];
  availableActions?: string[];
  version?: number;
};
export type RuntimeActionResult<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ field?: string; message: string }>;
};

export interface ModuleRuntimeAdapter<T extends RuntimeRecord = RuntimeRecord> {
  getModuleDefinition(): Promise<PlatformModuleDefinition>;
  getViews(): Promise<RuntimeViewDefinition[]>;
  getView(viewKey: string): Promise<RuntimeViewDefinition>;
  getRecords(query: RuntimeQuery): Promise<RuntimeListResponse<T>>;
  getRecord(id: string): Promise<RuntimeRecordResponse<T>>;
  createRecord(
    values: Record<string, unknown>,
  ): Promise<RuntimeRecordResponse<T>>;
  updateRecord(
    id: string,
    values: Record<string, unknown>,
    version?: number,
  ): Promise<RuntimeRecordResponse<T>>;
  deleteRecord(id: string): Promise<RuntimeActionResult>;
  bulkDelete(ids: string[]): Promise<RuntimeActionResult>;
  assign(id: string, ownerId: string | null): Promise<RuntimeActionResult>;
  bulkAssign(
    ids: string[],
    ownerId: string | null,
  ): Promise<RuntimeActionResult>;
  changeStatus(
    id: string,
    status: string,
    reason?: string,
  ): Promise<RuntimeActionResult>;
  executeAction(
    actionKey: string,
    input: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
  getFormDefinition(
    mode: "create" | "detail" | "edit",
  ): Promise<RuntimeFormDefinition>;
  getRelatedRecords(
    id: string,
    relationshipKey: string,
    query?: RuntimeQuery,
  ): Promise<RuntimeListResponse>;
  getTimeline(id: string, query?: RuntimeQuery): Promise<RuntimeListResponse>;
  addTimelineActivity(
    id: string,
    activity: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
  getBusinessProcess(id: string): Promise<RuntimeActionResult>;
  updateBusinessProcessStage(
    id: string,
    stage: string,
    input?: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
  validateRecord(
    values: Record<string, unknown>,
    mode: "create" | "edit",
    id?: string,
  ): Promise<RuntimeActionResult>;
  exportRecords(query: RuntimeQuery, format?: string): Promise<Blob>;
}
