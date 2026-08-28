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
  /**
   * Makes the cell open the record it names.
   *
   * `field` holds the label — `customerAccount.companyName` — which is what a
   * person reads and not what addresses the record, so the id is named
   * separately. Without this a list showed the customer's name as text and the
   * only way to reach that customer was to go and search for them.
   */
  link?: { route: string; idField: string };
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  visible?: boolean;
  pinned?: "left" | "right";
  /**
   * The column that says which row this is. It cannot be hidden.
   *
   * Saved table preferences are reapplied over the definition, and
   * `mergeVisibleColumns` deliberately honours a column an operator turned off
   * — "never offered" and "deliberately hidden" are different states and it can
   * tell them apart.
   *
   * The identity column is the exception. With `Tenant` hidden, the tenant list
   * led with `Customer`, every row was addressed by somebody else's name, and
   * the screen stopped being a list of tenants at all. That is not a preference
   * anyone holds on purpose, and recovering from it through the column picker
   * requires already knowing which column is missing.
   *
   * So this one is forced visible however the saved state was written, and the
   * picker will not offer to turn it off. Everything else stays the operator's
   * to arrange.
   */
  essential?: boolean;
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
   * Submit the chosen option's label rather than its id.
   *
   * BUG-1578. `CustomerAccount.country` is a plain string column holding a
   * country *name* — twelve of thirteen production rows held one, and every
   * reader assumed it. The admin form declared it a lookup, so it submitted the
   * lookup's id, and a generated agreement rendered
   * `ec7dbbe3-1179-4465-990f-06427a4ab59f` as a counterparty's registered
   * address.
   *
   * Set this only where the stored column is the display value. It makes the
   * option's value and label the same string, so selection, matching and
   * submission all speak the language the column is written in.
   */
  submitsLabel?: boolean;
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
  /**
   * What the API will actually accept for this module.
   *
   * The command bar used to be written per module by hand, so a read-only
   * module's record page carried a single Back button while a writable one
   * carried six — and nothing said which was deliberate. These three flags let
   * `define()` build the same default command bar everywhere and still refuse
   * to offer an Edit that `PlatformRuntimeService.update` would reject with a
   * 400. They are a fact about the API, not a preference: see
   * `MODULE_CAPABILITIES` in the registry and the spec that re-derives them
   * from the service source.
   */
  capabilities: RuntimeModuleCapabilities;
  /**
   * The record header status group — Owner, Status and Sub-status, drawn
   * together at the top right of a record the way Dynamics 365 draws them.
   *
   * Each slot names a field on the record. A slot with no field is omitted
   * rather than faked: not every platform entity is user-owned, and inventing
   * an owner out of `publishedById` would present an audit stamp as an
   * assignment.
   */
  recordHeader?: RuntimeRecordHeaderDefinition;
};

export type RuntimeModuleCapabilities = {
  create: boolean;
  update: boolean;
  delete: boolean;
  /*
   * Whether *many* records may be deleted at once.
   *
   * Separate from `delete` because the two are different risks. Deleting one
   * lead is a deliberate act on a record somebody is looking at; deleting an
   * unbounded selection destroys commercial attribution — which partner
   * referred whom — for records nobody reviewed. BUG-0018 asked whether bulk
   * lead delete should exist and the answer was no, while single delete stays.
   *
   * Defaults to `delete` when unset, so every other module is unchanged.
   */
  bulkDelete?: boolean;
};

export type RuntimeRecordHeaderSlot = {
  /** Field holding the stored value — `assignedToUserId`, `status`, … */
  field: string;
  label: string;
  /**
   * Where the human-readable value lives when the stored one is an id.
   * `assignedToUser` resolves through the same name candidates the runtime
   * lookups use, so the header shows a person rather than a UUID.
   */
  displayValueField?: string;
  /** Owner slot only — the allowlisted lookup the picker reads. */
  lookupPath?: string;
  /**
   * The optionset. Taken from the module's record form where it declares one,
   * so the header and the form name a value the same way, and from the
   * generated Prisma enum otherwise.
   */
  options?: Array<{ value: string; label: string }>;
  /**
   * Editable slots write through a named API route, never a blind PATCH.
   * `assign` and `change-status` are governed operations the service
   * implements for a specific set of modules; every other slot stays
   * read-only here and is changed through the form, where field validation
   * and the ordinary save path apply.
   */
  write?: "assign" | "change-status";
  /** Sub-status slot only — options narrowed by the current status value. */
  optionsByStatus?: Record<string, Array<{ value: string; label: string }>>;
  /**
   * Why this slot cannot be edited from the header, shown as the control's
   * title. Present only on slots that are deliberately read-only.
   */
  readOnlyReason?: string;
};

export type RuntimeRecordHeaderDefinition = {
  owner?: RuntimeRecordHeaderSlot;
  status?: RuntimeRecordHeaderSlot;
  subStatus?: RuntimeRecordHeaderSlot;
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
    /**
     * The sub-status recorded alongside the transition. Separate from
     * `reason`: the reason is prose written for whoever reads the record
     * later, the sub-status is the value the header optionset holds, and
     * `PlatformRuntimeService.changeStatus` stores them in different places.
     */
    subStatus?: string,
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
