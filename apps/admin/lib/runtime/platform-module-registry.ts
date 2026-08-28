import type {
  PlatformModuleDefinition,
  PlatformModuleKey,
  RuntimeActionDefinition,
  RuntimeColumnDefinition,
  RuntimeFieldDefinition,
  RuntimeModuleCapabilities,
  RuntimeRecordHeaderSlot,
  RuntimeStatusDefinition,
  RuntimeViewDefinition,
} from "./platform-runtime.types";
import {
  AGREEMENT_CATEGORY_OPTIONS,
  getRuntimeSchema,
  listRuntimeViewKeys,
  runtimeViewLabel,
  validateRuntimeDefinition,
} from "@repo/config";
import { PLATFORM_CURRENCY_OPTIONS } from "@/lib/reference-data/platform-reference-data";

const PLATFORM_OPERATORS = ["PLATFORM_OWNER", "PLATFORM_ADMIN", "SUPER_ADMIN"];
const ALL_PLATFORM_ROLES = [
  ...PLATFORM_OPERATORS,
  "PLATFORM_OPERATIONS",
  "MEMBER",
  "PRESALES_MANAGER",
  "PRESALES_USER",
  "PARTNER_MANAGER",
  "CONTRACT_MANAGER",
  "LEGAL_REVIEWER",
  "FINANCE_MANAGER",
  "BILLING_USER",
  "SUPPORT_MANAGER",
  "SUPPORT_AGENT",
  "MONITORING_OPERATOR",
  "READ_ONLY_AUDITOR",
];

const INDUSTRY_VALUES = [
  "Healthcare",
  "IT / Software",
  "Recruitment",
  "Staffing",
  "Professional Services",
  "Real Estate",
  "Construction",
  "Education",
  "Retail",
  "Hospitality",
  "Manufacturing",
  "Financial Services",
  "Government",
  "Nonprofit",
  "Other",
];
const COMPANY_SIZE_VALUES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5000+",
];
const LEAD_SUB_STATUS_VALUES: Record<string, string[]> = {
  NEW: [
    "Awaiting response",
    "Demo requested",
    "Needs triage",
    "New website inquiry",
    "New manual entry",
  ],
  CONTACTED: [
    "Awaiting response",
    "Discovery scheduled",
    "Discovery done",
    "Demo scheduled",
    "Pricing discussion",
    "Follow-up required",
  ],
  QUALIFIED: [
    "Commercial review",
    "Proposal required",
    "Proposal sent",
    "Ready for customer conversion",
    "Follow-up later",
  ],
  UNQUALIFIED: [
    "Not a fit",
    "Duplicate",
    "No budget",
    "Invalid contact",
    "Outside target market",
  ],
  CONVERTED: ["Converted to customer"],
  CLOSED_LOST: [
    "No budget",
    "Lost to competitor",
    "No decision",
    "Timeline not aligned",
    "Follow-up later",
  ],
  ARCHIVED: ["Archived"],
};

/**
 * The standard commands, addressed by name.
 *
 * These were previously reached positionally — `STANDARD_LIST_ACTIONS[3]` for
 * Assign — across seventeen module definitions. Inserting one command into
 * either array silently re-pointed every one of those references at a
 * different button, which is not a mistake a type checker can catch. They are
 * named now, and the arrays below are assembled from the names.
 */
const ACTION = {
  new: {
    key: "new",
    label: "New",
    icon: "new",
    placement: "primary",
    scope: "list",
    selection: "none",
  },
  refresh: {
    key: "refresh",
    label: "Refresh",
    icon: "refresh",
    placement: "secondary",
    scope: "list",
    selection: "none",
  },
  export: {
    key: "export",
    label: "Export",
    icon: "export",
    placement: "overflow",
    scope: "list",
    selection: "none",
  },
  bulkAssign: {
    key: "bulk-assign",
    label: "Assign",
    icon: "approve",
    placement: "secondary",
    scope: "list",
    selection: "any",
  },
  bulkDelete: {
    key: "bulk-delete",
    label: "Delete",
    icon: "delete",
    placement: "overflow",
    scope: "list",
    selection: "any",
    destructive: true,
    confirmTitle: "Delete selected records?",
    confirmDescription:
      "This action follows the module retention policy and cannot always be reversed.",
  },
  back: {
    key: "back",
    label: "Back",
    icon: "back",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  /*
   * `record-new` and `record-refresh` carry their own keys rather than reusing
   * `new` and `refresh`, which already exist at list scope with different
   * behaviour — list New opens the create form in place, record New navigates
   * away from the record you are looking at. One key with two meanings would
   * have left the action handler guessing which page it was on.
   */
  recordNew: {
    key: "record-new",
    label: "New",
    icon: "new",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  edit: {
    key: "edit",
    label: "Edit",
    icon: "edit",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  recordRefresh: {
    key: "record-refresh",
    label: "Refresh",
    icon: "refresh",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  save: {
    key: "save",
    label: "Save",
    icon: "save",
    placement: "primary",
    scope: "record",
    selection: "none",
  },
  saveClose: {
    key: "save-close",
    label: "Save and close",
    icon: "save",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  delete: {
    key: "delete",
    label: "Delete",
    icon: "delete",
    placement: "overflow",
    scope: "record",
    selection: "none",
    destructive: true,
    confirmTitle: "Delete this record?",
  },
} satisfies Record<string, RuntimeActionDefinition>;

const STANDARD_RECORD_ACTIONS: RuntimeActionDefinition[] = [
  ACTION.back,
  ACTION.recordNew,
  ACTION.edit,
  ACTION.recordRefresh,
  ACTION.save,
  ACTION.saveClose,
  ACTION.delete,
];
const READ_ONLY_ACTIONS: RuntimeActionDefinition[] = [
  ACTION.refresh,
  ACTION.export,
  ACTION.back,
  ACTION.recordRefresh,
];
const CREATE_LIST_ACTIONS: RuntimeActionDefinition[] = [
  ACTION.new,
  ACTION.refresh,
  ACTION.export,
];
const EDIT_RECORD_ACTIONS: RuntimeActionDefinition[] = [
  ACTION.back,
  ACTION.recordNew,
  ACTION.edit,
  ACTION.recordRefresh,
  ACTION.save,
  ACTION.saveClose,
];

/*
 * Declared above `definitions`, not beside the helper that reads it. The
 * definitions array is evaluated at module scope, so a `const` any `define()`
 * path touches must already be initialised — otherwise the registry throws
 * "cannot access before initialization" at import and the whole app fails to
 * boot, with a message that names the constant rather than the ordering.
 */
const COUNTRY_LOOKUP_PATH = "/public/geography/countries";

const OWNER_LOOKUP_PATH = "/platform-users/owner-candidates";
/**
 * Owner is not spelled the same way twice in this schema. The order matters:
 * a customer carries `assignedToUserId` *and* `accountManagerUserId`, and the
 * first is the one the list column, the Assign action and the personal views
 * all agree is the owner.
 */
const OWNER_FIELD_CANDIDATES = [
  { field: "assignedToUserId", displayValueField: "assignedToUser" },
  { field: "ownerUserId", displayValueField: "ownerUser" },
  { field: "onboardingOwnerUserId", displayValueField: "onboardingOwnerUser" },
  { field: "ownerPlatformUserId", displayValueField: "ownerPlatformUser" },
];
/** Modules `PlatformRuntimeService.bulkAssign` can actually reassign. */
const ASSIGNABLE_MODULES = new Set<PlatformModuleKey>([
  "leads",
  "partners",
  "customers",
  "support-cases",
]);
/** Modules `PlatformRuntimeService.changeStatus` implements a transition for. */
const STATUS_TRANSITION_MODULES = new Set<PlatformModuleKey>([
  "leads",
  "partners",
  "support-cases",
]);
/**
 * Why a status slot is read-only, where the reason is worth telling an
 * operator rather than leaving them to wonder whether the control is broken.
 */
const RECORD_HEADER_READ_ONLY_REASON: Partial<
  Record<PlatformModuleKey, string>
> = {
  plans:
    "Publication is changed through the plan form. Governed publish and archive actions are tracked as ITEM-0022.",
  tenants:
    "Tenant lifecycle changes go through the Operations tab so the provisioning transition rules apply.",
  customers:
    "Customer status follows onboarding and tenant provisioning rather than a direct edit.",
};

/**
 * A partner onboarding application can only be decided on while it is with the
 * reviewer. `APPROVED` and `REJECTED` are terminal, and an application still
 * `INVITED` or `IN_PROGRESS` has nothing submitted to decide about.
 */
const REVIEWABLE_ONBOARDING_STATES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
];

/**
 * What `PlatformRuntimeService` will accept, per module.
 *
 * This is a restatement of the `create`, `update` and `remove` switch
 * statements in
 * `services/api/src/modules/platform-runtime/platform-runtime.service.ts`, and
 * it is not free to drift from them: `platform-module-capabilities.spec.ts`
 * re-derives all three sets from that file and fails when this map disagrees.
 *
 * `define()` builds the default command bar from these flags, so a module the
 * API cannot update never renders an Edit that would come back 400 — and, just
 * as importantly, a module the API *can* update never quietly ships a record
 * page carrying nothing but Back, which is what seven of them did before the
 * command bar had a default at all.
 */
/**
 * Why a module offers no Delete, in the words its operator needs.
 *
 * Delete appeared on three modules out of eighteen, which reads as an
 * oversight and mostly is not. Most of the fifteen hold records the business
 * has to be able to produce later, or sit in front of a cascade that would take
 * a customer's whole workspace with them.
 *
 * The answer to "there is no Delete button" is therefore not a Delete button.
 * It is a Delete entry that says which of those applies and, where one exists,
 * points at the non-destructive action that does what the operator actually
 * wanted. A list with no Delete and no explanation sends somebody to support;
 * this sends them to Archive.
 *
 * A module absent from this map and absent from `delete: true` would render no
 * Delete at all — which is why `platform-module-capabilities.spec.ts` asserts
 * that every module is in exactly one of the two.
 */
const DELETE_REFUSALS: Partial<Record<PlatformModuleKey, string>> = {
  tenants:
    "A tenant carries its customer's entire workspace behind a cascade, so deleting the row deletes their data. Use More → Erase tenant, which is governed, reconciled and reversible up to the point of erasure.",
  contracts:
    "An executed agreement is the evidence that it was executed, and the signature chain hashes it. Supersede or terminate the agreement instead — both keep the record and change what it means.",
  "contract-templates":
    "Templates are versioned and referenced by every agreement generated from them, so deleting one detaches contracts from the text they were made of. Deactivate the template instead: it stops being offered and stays resolvable.",
  "signature-requests":
    "A signature request is signing evidence — who was asked, when, and what they saw. Cancel it instead; a cancelled request still explains itself.",
  "support-cases":
    "A case is the record of what a customer was told and when. Resolve or close it instead — the list filters on status, and closed cases leave the default view.",
  subscriptions:
    "A subscription is what a customer is being charged against. Cancel it instead; deleting it detaches invoices and payments from the thing that produced them.",
  plans:
    "Plans are referenced by every subscription and price sold under them. Archive the plan instead — it stops being sellable and existing subscriptions keep resolving.",
  invoices:
    "Invoices are financial records the business is required to be able to produce. Void or credit the invoice instead, which is what an auditor expects to see.",
  payments:
    "A payment is a record of money moving, reconciled against Stripe. Refund it instead — deleting it would leave the reconciliation permanently short.",
  commissions:
    "A commission is what a partner is owed or was paid. Adjust or reverse it instead; deleting one removes the explanation for a payment that already happened.",
  "monitoring-incidents":
    "Incidents are the support trail for what customers experienced. Resolve them instead — resolved incidents leave the default queue and stay searchable by reference.",
  dashboard: "The dashboard is not a list of records.",
};

const MODULE_CAPABILITIES: Record<
  PlatformModuleKey,
  RuntimeModuleCapabilities
> = {
  dashboard: { create: false, update: false, delete: false },
  leads: { create: true, update: true, delete: true },
  partners: { create: true, update: true, delete: true },
  "partner-inquiries": { create: false, update: false, delete: true },
  customers: { create: true, update: true, delete: true },
  "partner-onboarding": { create: false, update: false, delete: true },
  "customer-onboarding": { create: true, update: true, delete: true },
  tenants: { create: false, update: true, delete: false },
  contracts: { create: true, update: true, delete: false },
  "contract-templates": { create: false, update: false, delete: false },
  "signature-requests": { create: false, update: false, delete: false },
  "support-cases": { create: true, update: true, delete: false },
  subscriptions: { create: false, update: false, delete: false },
  plans: { create: false, update: true, delete: false },
  invoices: { create: false, update: false, delete: false },
  payments: { create: false, update: false, delete: false },
  commissions: { create: false, update: false, delete: false },
  "monitoring-incidents": { create: false, update: false, delete: false },
};

/**
 * The command bar every module gets before its own actions are merged in.
 *
 * Back and Refresh are unconditional: both are client-side, both work on a
 * record the API will never let anyone change, and a detail page without them
 * is a dead end. The rest follow the module's capabilities.
 */
function defaultActionsFor(
  key: PlatformModuleKey,
  capabilities: RuntimeModuleCapabilities,
): RuntimeActionDefinition[] {
  if (key === "dashboard") return [ACTION.refresh];
  return [
    ...(capabilities.create ? [ACTION.new] : []),
    ACTION.refresh,
    ACTION.export,
    ACTION.back,
    ...(capabilities.create ? [ACTION.recordNew] : []),
    ...(capabilities.update ? [ACTION.edit] : []),
    ACTION.recordRefresh,
    ...(capabilities.update ? [ACTION.save, ACTION.saveClose] : []),
    ...(capabilities.delete
      ? [ACTION.delete, ACTION.bulkDelete]
      : refusingDeleteActions(key)),
  ];
}

/**
 * A Delete that appears and explains itself.
 *
 * The alternative — rendering nothing — is what produced "there is no Delete
 * button on any module". It is technically the safer default and practically
 * the worse one: an operator cannot tell a missing feature from a deliberate
 * refusal, so they go looking, then ask.
 *
 * Both entries are disabled and carry the reason, which `ModuleActionBar`
 * already renders as the button's `title` and its disabled state. Nothing can
 * be clicked into a destructive path that the API would refuse anyway — the
 * server is still the authority, and `PlatformRuntimeService.remove` throws for
 * every module outside its switch.
 */
function refusingDeleteActions(
  key: PlatformModuleKey,
): RuntimeActionDefinition[] {
  const reason = DELETE_REFUSALS[key];
  if (!reason || key === "dashboard") return [];
  return [
    { ...ACTION.delete, disabledReason: reason },
    { ...ACTION.bulkDelete, disabledReason: reason },
  ];
}

/**
 * Merge a module's declared actions over the defaults.
 *
 * A declared action wins on `(key, scope)` — that is how Leads keeps "New
 * Lead" as its list button and Contracts keeps an Edit offered only in the
 * states an unsigned agreement may be edited in. Everything the module did not
 * mention is prepended in the canonical order above, so the first commands sit
 * in the same place on every record page in the product.
 */
function withDefaultActions(
  key: PlatformModuleKey,
  capabilities: RuntimeModuleCapabilities,
  declared: RuntimeActionDefinition[],
): RuntimeActionDefinition[] {
  const identity = (action: RuntimeActionDefinition) =>
    `${action.key}::${action.scope}`;
  const declaredIds = new Set(declared.map(identity));
  const defaults = defaultActionsFor(key, capabilities).filter(
    (action) => !declaredIds.has(identity(action)),
  );
  const seen = new Set<string>();
  const merged = [...defaults, ...declared].filter((action) => {
    const id = identity(action);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  /*
   * The standard commands come first, in one fixed order, whether the module
   * declared them or inherited them. Without this a module that declared five
   * of the six got the sixth prepended, so Delete led the command bar on Leads
   * while it sat last on Customers — the same button in two places depending
   * on which module happened to spell out which defaults.
   */
  const rank = (action: RuntimeActionDefinition) => {
    const index = COMMAND_ORDER.indexOf(String(action.key));
    return index === -1 ? COMMAND_ORDER.length : index;
  };
  return merged
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rank(a.action) - rank(b.action) || a.index - b.index)
    .map((entry) => entry.action);
}

/**
 * The order the standard commands appear in, list and record together. Keys
 * absent from this list are module-specific and keep their declared order
 * after them; `placement` still decides which of them are drawn inline and
 * which fall into the overflow menu.
 */
const COMMAND_ORDER = [
  "new",
  "back",
  "record-new",
  "edit",
  "save",
  "save-close",
  "refresh",
  "record-refresh",
  "export",
  "bulk-assign",
  "delete",
  "bulk-delete",
];

/**
 * Tenant lifecycle, mirroring the `TenantStatus` enum and the transition map the
 * API enforces. Tone is what tells an operator at a glance whether a workspace
 * is live, being worked on, or stopped.
 */
const TENANT_STATUS_VALUES = [
  "ONBOARDING",
  "PENDING_SETUP",
  "PROVISIONING",
  "PROVISIONING_FAILED",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "DECOMMISSIONING",
  "DECOMMISSIONED",
  "ARCHIVED",
  "CHURNED",
];

const TENANT_STATUS_TONES: Record<string, RuntimeStatusDefinition["tone"]> = {
  ONBOARDING: "neutral",
  PENDING_SETUP: "warning",
  PROVISIONING: "info",
  PROVISIONING_FAILED: "danger",
  ACTIVE: "success",
  SUSPENDED: "danger",
  INACTIVE: "neutral",
  DECOMMISSIONING: "warning",
  DECOMMISSIONED: "neutral",
  ARCHIVED: "neutral",
  CHURNED: "neutral",
};

const TENANT_STATUSES: RuntimeStatusDefinition[] = TENANT_STATUS_VALUES.map(
  (value) => ({
    value,
    label: title(value),
    tone: TENANT_STATUS_TONES[value] ?? "neutral",
    terminal: ["ARCHIVED", "CHURNED", "DECOMMISSIONED"].includes(value),
  }),
);

/**
 * The tenant record action bar.
 *
 * Ordinary record actions stay where an operator expects them; everything that
 * changes the workspace's state sits behind one Actions menu and declares the
 * lifecycle states it is valid in. `states` is a usability filter only — the API
 * re-checks every transition, so hiding a button is never the control.
 */
const TENANT_RECORD_ACTIONS: RuntimeActionDefinition[] = [
  /*
   * List-scope actions come first. They are easy to forget when a module's
   * action set is written for its record page — and forgetting them leaves the
   * list screen with an empty command bar, which is what happened here. A tenant
   * is never created from this list (provisioning creates it from a completed
   * onboarding), so New is deliberately absent while Refresh and Export are not.
   */
  ACTION.refresh,
  ACTION.export,
  ACTION.back,
  ACTION.recordNew,
  ACTION.edit,
  ACTION.recordRefresh,
  ACTION.save,
  ACTION.saveClose,
  {
    key: "open-tenant-list",
    label: "Open Tenant",
    icon: "external",
    placement: "secondary",
    scope: "list",
    selection: "one",
  },
  {
    key: "open-tenant",
    label: "Open Tenant",
    icon: "external",
    placement: "primary",
    scope: "record",
    selection: "none",
    states: ["ACTIVE"],
  },
  {
    key: "validate-tenant",
    label: "Validate Tenant",
    icon: "check",
    placement: "overflow",
    scope: "record",
    selection: "none",
  },
  {
    key: "suspend-tenant",
    label: "Suspend Tenant",
    icon: "reject",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ["ACTIVE", "PENDING_SETUP", "INACTIVE"],
    destructive: true,
    confirmTitle: "Suspend this tenant?",
    confirmDescription:
      "Tenant users lose access immediately and live sessions are revoked. Data, subscription and history are preserved, and the tenant can be reactivated.",
  },
  {
    key: "reactivate-tenant",
    label: "Reactivate Tenant",
    icon: "approve",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ["SUSPENDED", "INACTIVE", "DECOMMISSIONING"],
  },
  {
    key: "activate-tenant",
    label: "Activate Tenant",
    icon: "approve",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ["PENDING_SETUP", "ONBOARDING"],
  },
  {
    key: "decommission-tenant",
    label: "Start Decommissioning",
    icon: "reject",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: ["ACTIVE", "SUSPENDED", "INACTIVE"],
    destructive: true,
    confirmTitle: "Start decommissioning this tenant?",
    confirmDescription:
      "The workspace is retired according to the termination process. Data is preserved; this is not erasure.",
  },
  {
    key: "create-tenant-owner",
    label: "Create Tenant Owner",
    icon: "new",
    placement: "overflow",
    scope: "record",
    selection: "none",
  },
  {
    key: "create-service-account",
    label: "Create Service Account",
    icon: "new",
    placement: "overflow",
    scope: "record",
    selection: "none",
  },
  {
    key: "retry-provisioning",
    label: "Retry Provisioning",
    icon: "refresh",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: [
      "PROVISIONING",
      "PROVISIONING_FAILED",
      "ONBOARDING",
      "PENDING_SETUP",
    ],
  },
  {
    key: "refresh-tenant",
    label: "Refresh Tenant State",
    icon: "refresh",
    placement: "overflow",
    scope: "record",
    selection: "none",
  },
  {
    key: "erase-tenant",
    label: "Erase Tenant",
    icon: "delete",
    placement: "overflow",
    scope: "record",
    selection: "none",
    states: [
      "SUSPENDED",
      "INACTIVE",
      "DECOMMISSIONING",
      "DECOMMISSIONED",
      "ARCHIVED",
      "CHURNED",
      "PROVISIONING_FAILED",
    ],
    destructive: true,
  },
];

export const DASHBOARD_VIEWS: RuntimeViewDefinition[] = [
  {
    key: "executive",
    label: "Executive overview",
    description: "Commercial and operational health across the platform.",
    kind: "system",
    isSystemDefault: true,
    roles: PLATFORM_OPERATORS,
  },
  {
    key: "presales",
    label: "Presales",
    description:
      "Lead pipeline, conversion, ownership, and stale opportunities.",
    kind: "system",
    roles: [
      ...PLATFORM_OPERATORS,
      "PRESALES_MANAGER",
      "PRESALES_USER",
      "MEMBER",
    ],
  },
  {
    key: "partner-operations",
    label: "Partner operations",
    description:
      "Applications, onboarding, agreements, leads, and commissions.",
    kind: "system",
    roles: [...PLATFORM_OPERATORS, "PARTNER_MANAGER"],
  },
  {
    key: "agreement-operations",
    label: "Agreement operations",
    description:
      "Drafting, approval, signature, execution, expiry, and exception queues.",
    kind: "system",
    roles: [
      ...PLATFORM_OPERATORS,
      "CONTRACT_MANAGER",
      "LEGAL_REVIEWER",
      "FINANCE_MANAGER",
      "PARTNER_MANAGER",
    ],
  },
  {
    key: "customer-onboarding",
    label: "Customer onboarding",
    description: "Agreements, provisioning, tasks, and activation readiness.",
    kind: "system",
    roles: [...PLATFORM_OPERATORS, "PLATFORM_OPERATIONS", "MEMBER"],
  },
  {
    key: "customer-support",
    label: "Customer support",
    description: "Support queues, SLAs, escalations, and communications.",
    kind: "system",
    roles: [
      ...PLATFORM_OPERATORS,
      "SUPPORT_MANAGER",
      "SUPPORT_AGENT",
      "MONITORING_OPERATOR",
    ],
  },
  {
    key: "billing-revenue",
    label: "Billing and revenue",
    description:
      "Subscriptions, invoicing, collections, and commission exposure.",
    kind: "system",
    roles: [...PLATFORM_OPERATORS, "FINANCE_MANAGER", "BILLING_USER"],
  },
  {
    key: "platform-administration",
    label: "Platform administration",
    description: "Tenants, users, security, integrations, and configuration.",
    kind: "system",
    roles: PLATFORM_OPERATORS,
  },
  {
    key: "system-health",
    label: "System health",
    description:
      "Application failures, queues, delivery health, and incidents.",
    kind: "system",
    roles: [...PLATFORM_OPERATORS, "MONITORING_OPERATOR", "SUPPORT_MANAGER"],
  },
];

const LEAD_STATUSES: RuntimeStatusDefinition[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "UNQUALIFIED",
  "CONVERTED",
  "CLOSED_LOST",
  "ARCHIVED",
].map((value) => ({
  value,
  label: title(value),
  tone:
    value === "CONVERTED"
      ? "success"
      : value === "CLOSED_LOST" || value === "UNQUALIFIED"
        ? "danger"
        : value === "QUALIFIED"
          ? "info"
          : "neutral",
  terminal: ["CONVERTED", "CLOSED_LOST", "ARCHIVED"].includes(value),
}));
const PARTNER_STATUSES: RuntimeStatusDefinition[] = [
  "INQUIRY",
  "NEW_INQUIRY",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "REJECTED",
  "APPROVED_AWAITING_AGREEMENT",
  "AGREEMENT_IN_PROGRESS",
  "AGREEMENT_EXECUTED",
  "ONBOARDING_PENDING",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "TERMINATED",
].map(status);
const CONTRACT_STATUSES: RuntimeStatusDefinition[] = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "APPROVED_FOR_SENDING",
  "COMMERCIAL_APPROVAL",
  "LEGAL_APPROVAL",
  "COUNTERPARTY_REVIEW",
  "READY_FOR_SIGNATURE",
  "SENT",
  "VIEWED",
  "SIGNATURE_IN_PROGRESS",
  "PARTIALLY_SIGNED",
  "FULLY_SIGNED",
  "FULLY_EXECUTED",
  "DECLINED",
  "VOIDED",
  "SUPERSEDED",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
  "ARCHIVED",
].map(status);
const SUPPORT_STATUSES: RuntimeStatusDefinition[] = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "INVESTIGATING",
  "WAITING_ON_CUSTOMER",
  "WAITING_ON_INTERNAL_TEAM",
  "FIX_IN_PROGRESS",
  "MONITORING",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
].map(status);

const partnerFields: RuntimeFieldDefinition[] = [
  { ...field("id", "Partner ID", "text", "system"), readOnly: true },
  { ...field("code", "Partner number", "text", "identity"), readOnly: true },
  field("displayName", "Partner name", "text", "identity", true),
  field("legalName", "Legal name", "text", "identity"),
  field("type", "Partner type", "option", "identity", true, [
    "COMPANY",
    "INDIVIDUAL",
  ]),
  field(
    "status",
    "Status",
    "option",
    "identity",
    true,
    PARTNER_STATUSES.map((item) => item.value),
  ),
  {
    ...field("accountStatus", "Account status", "option", "identity", false, [
      "NOT_PROVISIONED",
      "INVITED",
      "ACTIVE",
      "SUSPENDED",
      "DISABLED",
    ]),
    readOnly: true,
  },
  field("companyName", "Legal company name", "text", "identity"),
  field("taxId", "Tax ID", "text", "identity"),
  field("contactFirstName", "Contact first name", "text", "contact"),
  field("contactLastName", "Contact last name", "text", "contact"),
  field("email", "Business email", "email", "contact", true),
  field("phone", "Phone", "phone", "contact"),
  field("website", "Website", "url", "contact"),
  countryField("contact"),
  field(
    "defaultCommissionRate",
    "Default commission",
    "percentage",
    "commercial",
    true,
  ),
  /*
   * A currency *code*, not an amount.
   *
   * `"currency"` names two different things in this registry — the money
   * control, which renders `<input type="number">`, and the ISO code that says
   * which money it is. `currencyCode` was given the first, so the only value an
   * operator could enter on Partners → New was a number, and the API stored it:
   * a partner created through the console carries `currencyCode: "5"`
   * (BUG-1747).
   *
   * Contracts already declares this field as an option over
   * `PLATFORM_CURRENCY_OPTIONS`. Partners now says the same thing the same way.
   */
  {
    ...field("currencyCode", "Currency", "option", "commercial", true),
    options: PLATFORM_CURRENCY_OPTIONS,
  },
  {
    ...field("assignedToUserId", "Internal owner", "userLookup", "ownership"),
    lookupPath: "/platform-users/owner-candidates",
  },
  field("notes", "Internal notes", "longText", "notes"),
  {
    ...field("applicationSource", "Application source", "text", "application"),
    readOnly: true,
  },
  {
    ...field(
      "applicationSubmittedAt",
      "Application submitted",
      "dateTime",
      "application",
    ),
    readOnly: true,
  },
  {
    ...field(
      "applicationSnapshot",
      "Application snapshot",
      "json",
      "application",
    ),
    readOnly: true,
  },
  { ...field("createdAt", "Created", "dateTime", "system"), readOnly: true },
  {
    ...field("updatedAt", "Last updated", "dateTime", "system"),
    readOnly: true,
  },
];

/**
 * Columns that exist on the model and must not appear on a form.
 *
 * `completeFormsFromSchema` adds every readable column a form does not mention,
 * which is the right default — a field nobody declared is more likely forgotten
 * than deliberately hidden. It also means **deleting a field declaration does
 * not remove the field**: it reappears under "Additional details", stripped of
 * the label and description that explained it.
 *
 * The plan's legacy price columns are the case that needs the opposite. They
 * are the pre-`PlanPrice` shape; checkout has read `PlanPrice` since BUG-0027,
 * so an editable "monthly price" on this form bills nobody and invites somebody
 * to set a number that does nothing. Removing the declarations alone made that
 * worse, not better.
 *
 * The columns stay on the model — existing rows carry values, and dropping them
 * is a destructive migration with its own backfill question. What is withdrawn
 * is the claim that an operator should be setting them.
 *
 * Declared above `definitions` for the reason `COUNTRY_LOOKUP_PATH` is: that
 * array is evaluated at module scope, so a constant declared below it is in its
 * temporal dead zone and every import of this file throws.
 */
const FORM_EXCLUDED_FIELDS: Partial<Record<PlatformModuleKey, string[]>> = {
  plans: [
    "currency",
    "monthlyBasePrice",
    "annualBasePrice",
    "legacyPricingMigratedAt",
  ],
};

const definitions: PlatformModuleDefinition[] = [
  define({
    key: "dashboard",
    entityType: "DashboardWorkspace",
    displayName: "Dashboard",
    pluralDisplayName: "Dashboards",
    description: "Role-based operational workspaces.",
    icon: "LayoutDashboard",
    routeBase: "/",
    navigationGroup: "workspace",
    apiBase: "/platform-runtime/dashboard",
    views: DASHBOARD_VIEWS,
    defaultView: "executive",
    columns: [],
    permissions: { read: "dashboard.read" },
    actions: [
      {
        key: "refresh",
        label: "Refresh",
        scope: "list",
        placement: "secondary",
      },
    ],
    dashboard: {
      widgetKeys: ["kpi", "trend", "funnel", "work-queue", "alerts", "health"],
    },
  }),
  define({
    key: "leads",
    entityType: "Lead",
    displayName: "Lead",
    pluralDisplayName: "Leads",
    description: "Presales and partner-attributed opportunities.",
    icon: "UserRoundSearch",
    routeBase: "/leads",
    navigationGroup: "customers",
    apiBase: "/super-admin/leads",
    views: views("leads", [
      "all",
      "my-open-leads",
      "website-leads",
      "partner-leads",
      "qualified",
      "awaiting-agreement",
      "converted",
      "lost-inactive",
    ]),
    defaultView: "all",
    statuses: LEAD_STATUSES,
    columns: [
      col("companyName", "Company", 220),
      col("fullName", "Contact", 180),
      col("status", "Status", 140, "status"),
      col("partner.displayName", "Partner", 180, "lookup"),
      col("assignedToUser.fullName", "Owner", 170, "lookup"),
      col("createdAt", "Created", 160, "dateTime"),
    ],
    forms: lifecycleForms(
      "lead",
      [
        field(
          "companyName",
          "Company / lead name",
          "text",
          "lead-information",
          true,
        ),
        {
          ...field("fullName", "Contact name", "text", "lead-information"),
          readOnly: true,
        },
        field(
          "status",
          "Status",
          "option",
          "lead-information",
          true,
          LEAD_STATUSES.map((item) => item.value),
        ),
        {
          ...field("subStatus", "Status reason", "option", "lead-information"),
          description: "Options are filtered by the selected lead status.",
          optionsByFieldValue: {
            field: "status",
            values: Object.fromEntries(
              Object.entries(LEAD_SUB_STATUS_VALUES).map(([status, values]) => [
                status,
                values.map((value) => ({ value, label: value })),
              ]),
            ),
          },
        },
        {
          ...field(
            "assignedToUserId",
            "Owner",
            "userLookup",
            "lead-information",
          ),
          lookupPath: "/platform-users/owner-candidates",
        },
        field("contactFirstName", "First name", "text", "contact", true),
        field("contactLastName", "Last name", "text", "contact", true),
        field("workEmail", "Work email", "email", "contact", true),
        field("phoneNumber", "Phone", "phone", "contact"),
        field("companyWebsite", "Company website", "url", "company"),
        field(
          "industry",
          "Industry",
          "option",
          "company",
          true,
          INDUSTRY_VALUES,
        ),
        field(
          "companySize",
          "Company size",
          "option",
          "company",
          true,
          COMPANY_SIZE_VALUES,
        ),
        field(
          "estimatedEmployeeCount",
          "Expected employees / seats",
          "integer",
          "company",
        ),
        countryField("company"),
        field("stateProvince", "State or province", "text", "company"),
        field("city", "City", "text", "company"),
        field(
          "requirementsSummary",
          "Requirements summary",
          "longText",
          "requirement",
        ),
        {
          ...field("message", "Website message", "longText", "requirement"),
          readOnly: true,
        },
        // Wave 3 acquisition context. All read-only: these record what the
        // visitor told us and what the page captured, so an operator editing
        // them would be rewriting the inquiry rather than working it.
        {
          ...field("inquiryIntent", "Inquiry intent", "option", "requirement"),
          readOnly: true,
        },
        {
          ...field(
            "interestAreas",
            "Interest areas",
            "multiSelect",
            "requirement",
          ),
          readOnly: true,
        },
        {
          ...field("sourcePage", "Submitted from", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("referrerUrl", "Referrer", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("utmSource", "Campaign source", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("utmMedium", "Campaign medium", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("utmCampaign", "Campaign", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("utmContent", "Campaign content", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("utmTerm", "Campaign term", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("marketCode", "Market", "text", "acquisition"),
          readOnly: true,
        },
        {
          ...field("correlationId", "Correlation ID", "text", "acquisition"),
          readOnly: true,
        },
        // Consent evidence. Read-only by design: a consent record an operator
        // can edit is not evidence of anything.
        {
          ...field(
            "privacyNoticeVersion",
            "Privacy notice version",
            "text",
            "acquisition",
          ),
          readOnly: true,
        },
        {
          ...field(
            "privacyNoticeAcceptedAt",
            "Notice acknowledged",
            "dateTime",
            "acquisition",
          ),
          readOnly: true,
        },
        {
          ...field(
            "marketingConsent",
            "Marketing consent",
            "boolean",
            "acquisition",
          ),
          readOnly: true,
        },
        {
          ...field(
            "marketingConsentAt",
            "Marketing consent given",
            "dateTime",
            "acquisition",
          ),
          readOnly: true,
        },
        {
          ...field(
            "marketingConsentWithdrawnAt",
            "Marketing consent withdrawn",
            "dateTime",
            "acquisition",
          ),
          readOnly: true,
        },
        {
          ...field("submissionHash", "Submission key", "text", "acquisition"),
          readOnly: true,
        },
        field(
          "interestedPlan",
          "Interested product or plan",
          "text",
          "commercial",
        ),
        field("expectedGoLiveDate", "Expected go-live", "date", "commercial"),
        field("budgetExpectation", "Budget expectation", "text", "commercial"),
        field("isQualified", "Qualified", "boolean", "qualification"),
        field("notes", "Qualification notes", "longText", "qualification"),
        field("source", "Source", "option", "acquisition", true, [
          "Website",
          "Manual Entry",
          "Sales Outreach",
          "Referral",
          "LinkedIn",
          "Upwork",
          "Email Inquiry",
          "WhatsApp Inquiry",
          "Demo Request",
          "Partner Referral",
          "PARTNER_PORTAL",
          "Existing Customer",
          "Event / Exhibition",
          "Support Conversion",
          "Marketing Campaign",
          "Other",
        ]),
        {
          ...field("partnerId", "Referral partner", "lookup", "acquisition"),
          lookupPath: "/partners?pageSize=100",
          visibleWhenAny: [
            {
              field: "source",
              in: ["Partner Referral", "PARTNER_PORTAL"],
            },
            { field: "partnerId", hasValue: true },
          ],
          hideWhenEmpty: true,
        },
        {
          ...field(
            "partnerReferralLinkId",
            "Referral link",
            "text",
            "acquisition",
          ),
          readOnly: true,
          hideOnCreate: true,
          hidden: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "partnerId", hasValue: true },
        },
        {
          ...field(
            "referralCodeSnapshot",
            "Referral code",
            "text",
            "acquisition",
          ),
          readOnly: true,
          hideOnCreate: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "partnerId", hasValue: true },
        },
        {
          ...field("referralSource", "Referral source", "text", "acquisition"),
          readOnly: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "partnerId", hasValue: true },
        },
        {
          ...field("referredAt", "Referred at", "dateTime", "acquisition"),
          readOnly: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "partnerId", hasValue: true },
        },
        {
          ...field(
            "attributionStatus",
            "Attribution status",
            "option",
            "acquisition",
            false,
            [
              "DIRECT",
              "ATTRIBUTED",
              "INVALID_CODE",
              "INACTIVE_PARTNER",
              "EXPIRED_LINK",
              "DISABLED_LINK",
              "CORRECTED",
            ],
          ),
          readOnly: true,
          hideOnCreate: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "partnerId", hasValue: true },
        },
        /*
         * Contracting and commercial confirmation. These stay optional while a
         * lead is New or Contacted; the Agreement lifecycle stage is what makes
         * them mandatory, and the server reports exactly which are missing.
         */
        field("legalCompanyName", "Legal company name", "text", "legal-entity"),
        field(
          "registrationNumber",
          "Registration number",
          "text",
          "legal-entity",
        ),
        field(
          "registeredAddress",
          "Registered address",
          "longText",
          "legal-entity",
        ),
        field(
          "countryOfRegistration",
          "Country of registration",
          "text",
          "legal-entity",
        ),
        field("taxId", "Tax / VAT number", "text", "legal-entity"),
        field(
          "authorizedSignerName",
          "Authorized signatory",
          "text",
          "authorized-signatory",
        ),
        field(
          "authorizedSignerTitle",
          "Job title",
          "text",
          "authorized-signatory",
        ),
        field(
          "authorizedSignerEmail",
          "Signatory email",
          "email",
          "authorized-signatory",
        ),
        {
          ...field(
            "agreedPlanId",
            "Selected plan",
            "lookup",
            "commercial-confirmation",
          ),
          lookupPath: "/super-admin/plans",
        },
        field(
          "agreedSeats",
          "Agreed seats",
          "integer",
          "commercial-confirmation",
        ),
        field(
          "agreedPrice",
          "Agreed price",
          "currency",
          "commercial-confirmation",
        ),
        field(
          "billingCycle",
          "Billing cycle",
          "option",
          "commercial-confirmation",
          false,
          ["MONTHLY", "ANNUAL"],
        ),
        field(
          "subscriptionTerm",
          "Subscription term",
          "option",
          "commercial-confirmation",
          false,
          ["Month-to-month", "12 months", "24 months", "36 months"],
        ),
        field(
          "paymentTerms",
          "Payment terms",
          "text",
          "commercial-confirmation",
        ),
        field(
          "proposedEffectiveDate",
          "Proposed effective date",
          "date",
          "commercial-confirmation",
        ),
        field("billingContactName", "Billing contact", "text", "billing"),
        field("billingContactEmail", "Billing email", "email", "billing"),
        {
          ...field("convertedAt", "Converted at", "dateTime", "conversion"),
          readOnly: true,
        },
        { ...field("id", "Lead ID", "text", "system"), readOnly: true },
        {
          ...field("createdAt", "Received", "dateTime", "system"),
          readOnly: true,
        },
        {
          ...field("updatedAt", "Last updated", "dateTime", "system"),
          readOnly: true,
        },
      ],
      ["Summary", "Commercial", "Agreements", "Activities", "System"],
      {
        "lead-information": "summary",
        contact: "summary",
        company: "commercial",
        requirement: "commercial",
        qualification: "commercial",
        acquisition: "commercial",
        commercial: "commercial",
        "legal-entity": "commercial",
        "authorized-signatory": "commercial",
        "commercial-confirmation": "commercial",
        billing: "commercial",
        conversion: "commercial",
        system: "system",
      },
    ),
    process: {
      key: "lead-lifecycle",
      stages: [
        { key: "NEW", label: "New" },
        { key: "CONTACTED", label: "Contacted" },
        {
          key: "QUALIFIED",
          label: "Qualification",
          requiredFields: ["requirementsSummary"],
        },
        { key: "AGREEMENT", label: "Agreement" },
        { key: "CONVERTED", label: "Conversion" },
      ],
      terminalOutcomes: [
        { key: "UNQUALIFIED", label: "Unqualified", tone: "danger" },
        { key: "CLOSED_LOST", label: "Closed Lost", tone: "danger" },
        { key: "ARCHIVED", label: "Cancelled / Archived", tone: "neutral" },
      ],
    },
    actions: [
      { ...ACTION.new, label: "New Lead" },
      ACTION.refresh,
      ACTION.export,
      ACTION.bulkAssign,
      {
        key: "bulk-change-status",
        label: "Change Status",
        placement: "secondary",
        scope: "list",
        selection: "any",
      },
      ACTION.bulkDelete,
      ...EDIT_RECORD_ACTIONS,
      {
        key: "qualify",
        label: "Qualify",
        icon: "qualify",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["NEW", "CONTACTED"],
      },
      {
        key: "disqualify",
        label: "Disqualify",
        icon: "disqualify",
        placement: "overflow",
        scope: "record",
        selection: "none",
        states: ["NEW", "CONTACTED", "QUALIFIED"],
      },
      {
        key: "create-agreement",
        label: "Create agreement",
        icon: "agreement",
        placement: "secondary",
        scope: "record",
        selection: "none",
        states: ["QUALIFIED"],
      },
      {
        key: "convert",
        label: "Convert to Customer",
        icon: "convert",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["QUALIFIED"],
      },
    ],
    relatedRecords: [
      {
        key: "agreements",
        label: "Lead agreements",
        tab: "agreements",
        description:
          "Pre-sales and customer agreements linked to this opportunity.",
        emptyTitle: "No lead agreements yet",
        emptyDescription:
          "Create an agreement when this qualified opportunity requires one before conversion.",
        module: "contracts",
        foreignKey: "relatedLeadId",
      },
    ],
  }),
  define({
    key: "partners",
    entityType: "Partner",
    displayName: "Partner",
    pluralDisplayName: "Partners",
    description:
      "Partner inquiries, onboarding, agreements, activation, leads, and commissions.",
    icon: "Handshake",
    routeBase: "/partners",
    navigationGroup: "partners",
    apiBase: "/partners",
    views: views("partners", [
      "all",
      "partner-inquiries",
      "under-review",
      "more-information-required",
      "agreement-pending",
      "awaiting-dijipeople-signature",
      "awaiting-partner-signature",
      "pending-onboarding",
      "active",
      "suspended",
      "rejected",
      "inactive",
    ]),
    defaultView: "all",
    statuses: PARTNER_STATUSES,
    columns: [
      col("displayName", "Partner", 230),
      col("type", "Type", 120),
      col("status", "Status", 170, "status"),
      col("onboardingApplications", "Onboarding", 170, "number"),
      col("agreements", "Agreements", 170, "number"),
      col("portalUsers", "Portal users", 150, "number"),
      col("defaultCommissionRate", "Commission", 130, "percentage"),
      col("assignedToUser.fullName", "Owner", 180, "lookup"),
      col("_count.leads", "Leads", 90, "number"),
      col("createdAt", "Created", 160, "dateTime"),
    ],
    forms: partnerForms(partnerFields),
    actions: [
      ...CREATE_LIST_ACTIONS,
      ACTION.bulkAssign,
      ...EDIT_RECORD_ACTIONS,
      {
        key: "start-review",
        label: "Start review",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["INQUIRY", "NEW_INQUIRY", "MORE_INFORMATION_REQUIRED"],
      },
      {
        key: "approve-partner",
        label: "Approve application",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["UNDER_REVIEW"],
      },
      {
        key: "request-information",
        label: "Request information",
        placement: "secondary",
        scope: "record",
        selection: "none",
        states: ["INQUIRY", "NEW_INQUIRY", "UNDER_REVIEW"],
      },
      {
        key: "reject-partner",
        label: "Reject",
        placement: "overflow",
        scope: "record",
        selection: "none",
        states: [
          "INQUIRY",
          "NEW_INQUIRY",
          "UNDER_REVIEW",
          "APPROVED_AWAITING_AGREEMENT",
        ],
        destructive: true,
        confirmTitle: "Reject this partner application?",
      },
      {
        key: "create-agreement",
        label: "Create agreement",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["APPROVED_AWAITING_AGREEMENT", "ACTIVE"],
      },
      {
        key: "send-onboarding-link",
        label: "Send onboarding link",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["AGREEMENT_EXECUTED"],
      },
      {
        key: "activate",
        label: "Activate partner",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["ONBOARDING_PENDING", "APPROVED_FOR_ACTIVATION"],
      },
      {
        key: "suspend-partner",
        label: "Suspend",
        placement: "overflow",
        scope: "record",
        selection: "none",
        states: ["ACTIVE"],
        destructive: true,
      },
      {
        key: "reactivate-partner",
        label: "Reactivate",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["SUSPENDED", "INACTIVE"],
      },
    ],
    process: {
      key: "partner-lifecycle",
      stages: PARTNER_STATUSES.slice(0, 15).map((item) => ({
        key: item.value,
        label: item.label,
      })),
    },
    relatedRecords: [
      {
        key: "leads",
        label: "Attributed leads",
        tab: "referred-leads",
        emptyTitle: "No referred leads yet",
        emptyDescription:
          "Leads submitted through this partner's referral links will appear here.",
        module: "leads",
        foreignKey: "partnerId",
        columns: [
          col("companyName", "Company", 220),
          col("status", "Status", 140, "status"),
          col("createdAt", "Created", 160, "dateTime"),
        ],
      },
      {
        key: "agreements",
        label: "Partner agreements",
        tab: "agreements",
        emptyTitle: "No partner agreements yet",
        emptyDescription:
          "Create and execute the required partner agreement before activation.",
        module: "contracts",
        foreignKey: "partnerId",
        columns: [
          col("contractNumber", "Contract", 170),
          col("title", "Title", 220),
          col("status", "Status", 160, "status"),
        ],
      },
      {
        key: "referralLinks",
        label: "Referral links",
        tab: "referral-links",
        foreignKey: "partnerId",
      },
      {
        key: "inquiries",
        label: "Application submissions",
        tab: "application",
        foreignKey: "partnerId",
      },
      {
        key: "portalUsers",
        label: "Contacts and users",
        tab: "contacts",
        foreignKey: "partnerId",
      },
      {
        key: "attributedCustomers",
        label: "Converted customers",
        tab: "customers",
        module: "customers",
        foreignKey: "originatingPartnerId",
      },
      {
        key: "attributedTenants",
        label: "Attributed tenants",
        tab: "tenants",
        module: "tenants",
        foreignKey: "originatingPartnerId",
      },
      {
        key: "commissions",
        label: "Commissions",
        tab: "summary",
        module: "commissions",
        foreignKey: "partnerId",
        columns: [
          col("commissionNumber", "Commission", 170),
          col("status", "Status", 130, "status"),
          col("commissionAmount", "Amount", 140, "currency"),
        ],
      },
    ],
  }),
  define({
    ...simple(
      "customers",
      "Customer",
      "Customers",
      "UsersRound",
      "/customers",
      "/super-admin/customers",
      "customers",
      [
        col("companyName", "Customer", 240),
        col("status", "Status", 140, "status"),
        col("onboardings", "Onboarding", 150, "number"),
        col("contracts", "Contracts", 150, "number"),
        col("assignedToUser.fullName", "Owner", 180, "lookup"),
        col("createdAt", "Created", 160, "dateTime"),
      ],
    ),
    statuses: [
      "LEAD",
      "PROSPECT",
      "ONBOARDING",
      "ACTIVE",
      "SUSPENDED",
      "CHURNED",
      "ARCHIVED",
    ].map(status),
    forms: lifecycleForms(
      "customer",
      [
        field("companyName", "Company name", "text", "identity", true),
        field("legalCompanyName", "Legal company name", "text", "identity"),
        field("status", "Status", "option", "identity", false, [
          "LEAD",
          "PROSPECT",
          "ONBOARDING",
          "ACTIVE",
          "SUSPENDED",
          "CHURNED",
          "ARCHIVED",
        ]),
        field("subStatus", "Status reason", "text", "identity"),
        field(
          "industry",
          "Industry",
          "option",
          "identity",
          false,
          INDUSTRY_VALUES,
        ),
        field(
          "companySize",
          "Company size",
          "option",
          "identity",
          false,
          COMPANY_SIZE_VALUES,
        ),
        field("website", "Website", "url", "identity"),
        field(
          "estimatedEmployeeCount",
          "Estimated employees",
          "integer",
          "identity",
        ),
        field("actualEmployeeCount", "Actual employees", "integer", "identity"),
        field(
          "primaryContactFirstName",
          "Primary contact first name",
          "text",
          "contacts",
          true,
        ),
        field(
          "primaryContactLastName",
          "Primary contact last name",
          "text",
          "contacts",
          true,
        ),
        field(
          "primaryContactEmail",
          "Primary contact email",
          "email",
          "contacts",
          true,
        ),
        field(
          "primaryContactPhone",
          "Primary contact phone",
          "phone",
          "contacts",
        ),
        field(
          "contactEmail",
          "Account contact email",
          "email",
          "contacts",
          true,
        ),
        field("contactPhone", "Account contact phone", "phone", "contacts"),
        field("registrationNumber", "Registration number", "text", "identity"),
        field("taxId", "Tax ID", "text", "identity"),
        field(
          "billingContactEmail",
          "Billing contact email",
          "email",
          "contacts",
        ),
        field("financeContactName", "Finance contact", "text", "contacts"),
        field("financeContactEmail", "Finance email", "email", "contacts"),
        countryField("address", true),
        field("stateProvince", "State or province", "text", "address"),
        field("city", "City", "text", "address"),
        field("addressLine1", "Address line 1", "text", "address"),
        field("addressLine2", "Address line 2", "text", "address"),
        {
          ...field("selectedPlanId", "Preferred plan", "lookup", "commercial"),
          lookupPath: "/super-admin/plans",
        },
        field(
          "preferredBillingCycle",
          "Billing cycle",
          "option",
          "commercial",
          false,
          ["MONTHLY", "ANNUAL"],
        ),
        field("customPricingFlag", "Custom pricing", "boolean", "commercial"),
        field("discountApproved", "Discount approved", "boolean", "commercial"),
        {
          ...field(
            "assignedToUserId",
            "Record owner",
            "userLookup",
            "ownership",
          ),
          lookupPath: "/platform-users/owner-candidates",
        },
        {
          ...field(
            "accountManagerUserId",
            "Account manager",
            "userLookup",
            "ownership",
          ),
          lookupPath: "/platform-users/owner-candidates",
        },
        {
          ...field(
            "primaryOwnerUserId",
            "Tenant primary owner",
            "text",
            "ownership",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field("leadId", "Source lead", "lookup", "attribution"),
          lookupPath: "/super-admin/leads?pageSize=100",
        },
        {
          ...field(
            "originatingPartnerId",
            "Originating partner",
            "lookup",
            "attribution",
          ),
          lookupPath: "/partners?pageSize=100",
          readOnly: true,
          hideWhenEmpty: true,
        },
        {
          ...field(
            "originatingReferralLinkId",
            "Originating referral link",
            "text",
            "attribution",
          ),
          readOnly: true,
          hideOnCreate: true,
          hidden: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "originatingPartnerId", hasValue: true },
        },
        {
          ...field(
            "referralCodeSnapshot",
            "Referral code",
            "text",
            "attribution",
          ),
          readOnly: true,
          hideOnCreate: true,
          hideWhenEmpty: true,
          visibleWhen: { field: "originatingPartnerId", hasValue: true },
        },
        {
          ...field("stripeCustomerId", "Stripe customer ID", "text", "system"),
          readOnly: true,
        },
        {
          ...field("isDemoData", "Demo data", "boolean", "system"),
          readOnly: true,
        },
        {
          ...field("demoBatchId", "Demo batch ID", "text", "system"),
          readOnly: true,
        },
        {
          ...field("seedSource", "Seed source", "text", "system"),
          readOnly: true,
        },
        { ...field("id", "Customer ID", "text", "system"), readOnly: true },
        {
          ...field("createdAt", "Created", "dateTime", "system"),
          readOnly: true,
        },
        {
          ...field("updatedAt", "Last updated", "dateTime", "system"),
          readOnly: true,
        },
      ],
      [
        "Summary",
        "Company and Contacts",
        "Agreements",
        "Onboarding",
        "Tenants",
        "Subscriptions",
        "Invoices",
        "Support",
        "Timeline",
        "System",
      ],
      {
        identity: "summary",
        commercial: "summary",
        ownership: "summary",
        contacts: "company-contacts",
        address: "company-contacts",
        attribution: "summary",
        system: "system",
      },
    ),
    actions: [
      { ...ACTION.new, label: "New Customer" },
      ACTION.refresh,
      ACTION.export,
      ACTION.bulkAssign,
      ACTION.bulkDelete,
      ...STANDARD_RECORD_ACTIONS,
      {
        key: "start-onboarding",
        label: "Start Onboarding",
        placement: "primary",
        scope: "record",
        selection: "none",
        states: ["PROSPECT", "ACTIVE"],
      },
      {
        key: "create-agreement",
        label: "Create agreement",
        placement: "secondary",
        scope: "record",
        selection: "none",
        states: ["PROSPECT", "ONBOARDING", "ACTIVE"],
      },
    ],
    relatedRecords: [
      {
        key: "contracts",
        label: "Customer agreements",
        tab: "agreements",
        emptyTitle: "No customer agreements yet",
        emptyDescription:
          "Create an agreement to record commercial and service terms for this customer.",
        module: "contracts",
        foreignKey: "customerAccountId",
      },
      {
        key: "onboardings",
        label: "Onboarding cycles",
        tab: "onboarding",
        module: "customer-onboarding",
        foreignKey: "customerId",
        emptyTitle: "No onboarding cycles yet",
        emptyDescription:
          "Start onboarding when the commercial prerequisites are complete.",
      },
      {
        key: "tenants",
        label: "Tenants",
        tab: "tenants",
        module: "tenants",
        foreignKey: "customerAccountId",
        emptyTitle: "No tenants yet",
        emptyDescription:
          "Tenants are provisioned from completed onboarding cycles. A customer can have multiple tenants.",
      },
      {
        key: "subscriptions",
        label: "Subscriptions",
        tab: "subscriptions",
        module: "subscriptions",
        foreignKey: "customerAccountId",
        emptyTitle: "No subscriptions yet",
        emptyDescription:
          "Subscriptions appear after a tenant has been provisioned.",
      },
      {
        key: "invoices",
        label: "Invoices",
        tab: "invoices",
        module: "invoices",
        foreignKey: "customerAccountId",
        emptyTitle: "No invoices yet",
        emptyDescription:
          "Invoices across all of this customer's tenants appear here.",
      },
      {
        key: "supportCases",
        label: "Support cases",
        tab: "support",
        emptyTitle: "No support cases",
        emptyDescription:
          "Support requests linked to this customer will appear here.",
        module: "support-cases",
        foreignKey: "customerAccountId",
      },
    ],
  }),
  define({
    ...simple(
      "partner-inquiries",
      "Partner inquiry",
      "Partner inquiries",
      "UserRoundSearch",
      "/partner-inquiries",
      "/partner-inquiries",
      "partners",
      [
        col("referenceNumber", "Inquiry", 170),
        col("companyName", "Partner or company", 230),
        // The commercial relationship being proposed. Leading with it because
        // it is what an operator triages on — `type` is INDIVIDUAL/COMPANY,
        // the contracting entity, and says nothing about the partnership.
        col("partnershipModel", "Partnership", 190, "status"),
        col("email", "Work email", 220),
        col("country", "Country", 130),
        col("type", "Entity type", 130, "status"),
        col("status", "Status", 150, "status"),
        col("createdAt", "Received", 170, "dateTime"),
      ],
    ),
    /*
     * The review decisions used to be declared inside
     * `partner-inquiry-review.tsx`, which meant this module's command bar was
     * whatever that one component happened to build — no Refresh, and no way
     * for the registry's defaults to reach it. They are the module's actions,
     * so they live with the module.
     */
    actions: [
      ...READ_ONLY_ACTIONS,
      {
        key: "approve",
        label: "Qualify and invite",
        scope: "record",
        selection: "none",
        placement: "primary",
        states: ["NEW", "QUALIFYING", "QUALIFIED"],
      },
      {
        key: "reject",
        label: "Reject inquiry",
        scope: "record",
        selection: "none",
        placement: "secondary",
        destructive: true,
        confirmTitle: "Reject this partner inquiry?",
        confirmDescription:
          "The applicant is told the inquiry was not taken forward. This cannot be undone from here.",
        states: ["NEW", "QUALIFYING", "QUALIFIED"],
      },
    ],
  }),
  define({
    ...simple(
      "partner-onboarding",
      "Partner onboarding application",
      "Partner onboarding",
      "ClipboardCheck",
      "/partner-onboarding",
      "/partner-onboarding",
      "partners",
      [
        col("partner.displayName", "Partner", 320, "lookup"),
        col("status", "Stage", 150, "status"),
        col("submittedAt", "Submitted", 190, "dateTime"),
        col("reviewedById", "Reviewer", 220, "lookup"),
      ],
    ),
    actions: [
      ...READ_ONLY_ACTIONS,
      {
        key: "approve",
        label: "Approve information",
        scope: "record",
        selection: "none",
        placement: "primary",
        states: REVIEWABLE_ONBOARDING_STATES,
      },
      {
        key: "changes",
        label: "Request changes",
        scope: "record",
        selection: "none",
        placement: "secondary",
        states: REVIEWABLE_ONBOARDING_STATES,
      },
      {
        key: "reject",
        label: "Reject",
        scope: "record",
        selection: "none",
        placement: "secondary",
        destructive: true,
        confirmTitle: "Reject this onboarding application?",
        states: REVIEWABLE_ONBOARDING_STATES,
      },
    ],
  }),
  define({
    ...simple(
      "customer-onboarding",
      "Customer onboarding record",
      "Customer onboarding",
      "ClipboardList",
      "/onboarding",
      "/super-admin/customer-onboardings",
      "customers",
      [
        col("customer.companyName", "Customer", 230, "lookup"),
        col("status", "Status", 170, "status"),
        col("contractSigned", "Contract signed", 150, "status"),
        col("onboardingOwnerUser.fullName", "Owner", 180, "lookup"),
        col("updatedAt", "Updated", 160, "dateTime"),
      ],
    ),
    statuses: [
      "NOT_STARTED",
      "IN_PROGRESS",
      "AWAITING_CUSTOMER_INPUT",
      "PENDING_PAYMENT",
      "READY_FOR_TENANT_CREATION",
      "COMPLETED",
      "BLOCKED",
      "CANCELED",
    ].map(status),
    forms: lifecycleForms(
      "customer-onboarding",
      [
        {
          ...field("customerId", "Customer", "lookup", "record", true),
          lookupPath: "/super-admin/customers?pageSize=100",
        },
        {
          ...field("leadId", "Source lead", "lookup", "record"),
          lookupPath: "/super-admin/leads?pageSize=100",
          readOnly: true,
        },
        {
          ...field(
            "customer.companyName",
            "Customer company",
            "text",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field(
            "customer.industry",
            "Industry",
            "text",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field(
            "customer.companySize",
            "Company size",
            "text",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field(
            "customer.primaryContactEmail",
            "Primary contact email",
            "email",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field(
            "customer.primaryContactPhone",
            "Primary contact phone",
            "phone",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        {
          ...field(
            "customer.country",
            "Customer country",
            "text",
            "customer-snapshot",
          ),
          readOnly: true,
          hideOnCreate: true,
        },
        field("status", "Status", "option", "record", true, [
          "NOT_STARTED",
          "IN_PROGRESS",
          "AWAITING_CUSTOMER_INPUT",
          "PENDING_PAYMENT",
          "READY_FOR_TENANT_CREATION",
          "COMPLETED",
          "BLOCKED",
          "CANCELED",
        ]),
        field("subStatus", "Status reason", "text", "record"),
        {
          ...field(
            "onboardingOwnerUserId",
            "Onboarding owner",
            "userLookup",
            "record",
          ),
          lookupPath: "/platform-users/owner-candidates",
        },
        {
          ...field("selectedPlanId", "Plan", "lookup", "commercial"),
          lookupPath: "/super-admin/plans",
        },
        field("billingCycle", "Billing cycle", "option", "commercial", false, [
          "MONTHLY",
          "ANNUAL",
        ]),
        field("agreedPrice", "Agreed price", "currency", "commercial"),
        field("discountType", "Discount type", "option", "commercial", true, [
          "NONE",
          "PERCENTAGE",
          "FLAT",
        ]),
        field("discountValue", "Discount value", "decimal", "commercial", true),
        {
          ...field(
            "featureSelectionSummary",
            "Feature selection",
            "json",
            "commercial",
          ),
          readOnly: true,
          description:
            "Plan feature selections captured for this provisioning cycle.",
        },
        field(
          "contractSigned",
          "Required agreement verified",
          "boolean",
          "readiness",
        ),
        field("paymentConfirmed", "Payment confirmed", "boolean", "readiness"),
        field(
          "implementationKickoffDone",
          "Implementation kickoff complete",
          "boolean",
          "readiness",
        ),
        field("dataReceived", "Customer data received", "boolean", "readiness"),
        field(
          "configurationReady",
          "Configuration ready",
          "boolean",
          "readiness",
        ),
        field("trainingPlanned", "Training planned", "boolean", "readiness"),
        field(
          "plannedTenantSlug",
          "Planned tenant slug",
          "text",
          "tenant-setup",
          true,
        ),
        {
          ...field("tenantId", "Provisioned tenant", "lookup", "tenant-setup"),
          lookupPath: "/super-admin/tenants",
          readOnly: true,
        },
        {
          ...field(
            "tenantCreated",
            "Tenant created",
            "boolean",
            "tenant-setup",
          ),
          readOnly: true,
        },
        field(
          "primaryOwnerFirstName",
          "Administrator first name",
          "text",
          "administrator",
          true,
        ),
        field(
          "primaryOwnerLastName",
          "Administrator last name",
          "text",
          "administrator",
          true,
        ),
        field(
          "primaryOwnerWorkEmail",
          "Administrator work email",
          "email",
          "administrator",
          true,
        ),
        field(
          "primaryOwnerPhone",
          "Administrator phone",
          "phone",
          "administrator",
        ),
        field(
          "createServiceAccount",
          "Create service account",
          "boolean",
          "service-account",
        ),
        field(
          "serviceAccountDisplayName",
          "Service account name",
          "text",
          "service-account",
        ),
        field(
          "serviceAccountEmail",
          "Service account email",
          "email",
          "service-account",
        ),
        field(
          "serviceAccountAssignSystemAdmin",
          "Assign System Admin",
          "boolean",
          "service-account",
        ),
        field("notes", "Implementation notes", "longText", "notes"),
        { ...field("id", "Onboarding ID", "text", "system"), readOnly: true },
        {
          ...field("createdAt", "Created", "dateTime", "system"),
          readOnly: true,
        },
        {
          ...field("updatedAt", "Last updated", "dateTime", "system"),
          readOnly: true,
        },
      ],
      [
        "Overview",
        "Readiness",
        "Tenant Setup",
        "Administrator",
        "Commercial",
        "Agreements",
        "Support",
        "Timeline",
        "System",
      ],
      {
        record: "overview",
        "customer-snapshot": "overview",
        readiness: "readiness",
        "tenant-setup": "tenant-setup",
        administrator: "administrator",
        "service-account": "administrator",
        commercial: "commercial",
        notes: "overview",
        system: "system",
      },
    ),
    process: {
      key: "customer-onboarding-lifecycle",
      stages: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "AWAITING_CUSTOMER_INPUT",
        "PENDING_PAYMENT",
        "READY_FOR_TENANT_CREATION",
        "COMPLETED",
      ].map((key) => ({ key, label: title(key) })),
      terminalOutcomes: [
        { key: "BLOCKED", label: "Blocked", tone: "danger" },
        { key: "CANCELED", label: "Canceled", tone: "danger" },
      ],
    },
    actions: [
      ...CREATE_LIST_ACTIONS,
      ACTION.bulkAssign,
      ACTION.bulkDelete,
      ...EDIT_RECORD_ACTIONS,
      {
        key: "create-agreement",
        label: "Create agreement",
        placement: "secondary",
        scope: "record",
        selection: "none",
        states: [
          "NOT_STARTED",
          "IN_PROGRESS",
          "AWAITING_CUSTOMER_INPUT",
          "PENDING_PAYMENT",
          "READY_FOR_TENANT_CREATION",
        ],
      },
    ],
    relatedRecords: [
      {
        key: "contracts",
        label: "Required agreements",
        tab: "agreements",
        module: "contracts",
        foreignKey: "customerOnboardingId",
        emptyTitle: "No onboarding agreements yet",
        emptyDescription:
          "Link the required customer agreement before provisioning when policy requires it.",
      },
      {
        key: "supportCases",
        label: "Implementation support cases",
        tab: "support",
        module: "support-cases",
        foreignKey: "customerOnboardingId",
        emptyTitle: "No implementation support cases",
        emptyDescription: "Issues raised during onboarding will appear here.",
      },
    ],
  }),
  define({
    ...simple(
      "tenants",
      "Tenant",
      "Tenants",
      "Building2",
      "/tenants",
      "/super-admin/tenants",
      "customers",
      /*
       * A tenant is a running workspace, so this list answers "which one, whose,
       * is it healthy, and how big" before anything else. The order is the
       * answer order: identity, then address, then lifecycle, then commercial,
       * then size.
       *
       * The name stays first and the workspace address sits beside it. Those two
       * are how an operator recognises a row — a tenant is discussed by its
       * workspace URL far more often than by its display name, and the slug was
       * previously reachable only by opening the record.
       */
      [
        /*
         * The row's identity, and `essential` so no saved preference can hide
         * it. A tenant list with its name column off leads with `Customer`,
         * addresses every row by somebody else's name, and stops being a list
         * of tenants — which is exactly how this was found.
         *
         * Labelled "Name" rather than "Tenant": the header sits on a page
         * already titled Tenants, so repeating the noun said nothing, and the
         * question an operator is answering here is "which one".
         *
         * `displayName` rather than `name`, even though `name` is the required
         * field: `mapTenantSummary` returns `displayName: tenant.displayName ??
         * tenant.name`, so this is the friendly name where one is set and the
         * real name otherwise, and is never empty.
         */
        { ...col("displayName", "Name", 220), essential: true },
        /*
         * The subdomain the customer actually signs in at. Not a lookup: it
         * addresses the same record the row already opens, so linking it
         * elsewhere would be a link to here.
         */
        col("slug", "Workspace", 170),
        /*
         * Every lookup on this module opens the record it names. These read as
         * a customer and a plan and used to be plain text, so the only way to
         * reach either was to leave the tenant list and search for them.
         */
        col("customerAccount.companyName", "Customer", 210, "lookup", {
          route: "/customers",
          idField: "customerAccount.id",
        }),
        col("status", "Status", 150, "status"),
        col("subscription.plan.name", "Plan", 150, "lookup", {
          route: "/plans",
          idField: "subscription.plan.id",
        }),
        col("subscription.status", "Subscription", 150, "status"),
        /*
         * Which of the customer's workspaces this is. A UAT tenant beside a
         * production one is otherwise indistinguishable in this list, and they
         * are treated very differently — the record page calls relabelling one
         * as the other "reclassifying live data rather than moving it".
         */
        col("environmentType", "Environment", 140, "status"),
        /*
         * Employees, not users. Employees are the billable population — an
         * admin who is not an employee consumes no seat — so this is the number
         * that explains an invoice, and the one an operator is usually asked
         * about. `users` is the same shape and stays in the column picker.
         *
         * Named for the Prisma relation rather than `employeeCount`, because
         * `validateRuntimeDefinition` resolves every column against the model
         * graph and a computed alias resolves to nothing. `mapPlan` already
         * names its count `subscriptions` for the same reason.
         */
        col("employees", "Employees", 120, "number"),
        col("createdAt", "Created", 160, "dateTime"),
        /*
         * Off by default. Each is a column an operator wants only while chasing
         * a specific workspace, and a list that shows everything shows nothing.
         *
         * They are declared rather than omitted because the column picker can
         * only offer what the definition names — a field absent here is not
         * "off", it is unreachable.
         */
        { ...col("users", "Users", 110, "number"), visible: false },
        /*
         * There is no owner column, and the reason is left here so nobody adds
         * one casually. `mapTenantSummary` returns the owner under `owner`,
         * while `validateRuntimeDefinition` resolves column paths against the
         * Prisma graph, where the relation is `ownerUser`. So `owner.fullName`
         * fails validation, and `ownerUser.fullName` passes it and then renders
         * blank, because that key is not in the payload.
         *
         * A column that validates and shows nothing is the shape of BUG-0796.
         * Adding one here means reconciling the mapper with the graph first.
         */
        { ...col("tenantCode", "Tenant code", 150), visible: false },
        /*
         * The registered entity, which is not the workspace name. It appears on
         * contracts and invoices, so it is the column that answers "is this the
         * company we think it is" — needed rarely, and badly when needed.
         */
        { ...col("legalName", "Legal name", 200), visible: false },
        { ...col("updatedAt", "Updated", 160, "dateTime"), visible: false },
      ],
    ),
    statuses: TENANT_STATUSES,
    forms: lifecycleForms(
      "tenants",
      [
        /*
         * Overview, Access & Security, Commercial, Apps & Modules and Operations
         * are rendered by their own panels rather than by form fields. A tenant
         * is a running workspace, and a list of columns is the wrong way to ask
         * whether it is healthy. Only the tabs that genuinely edit or display
         * record columns declare fields here.
         */
        field("name", "Tenant name", "text", "workspace", true),
        field("displayName", "Display name", "text", "workspace"),
        field("legalName", "Legal name", "text", "workspace"),
        {
          ...field("tenantCode", "Tenant code", "text", "workspace"),
          readOnly: true,
          description:
            "Issued at provisioning and printed on invoices. Not editable.",
        },
        {
          ...field("slug", "Workspace slug", "text", "workspace"),
          readOnly: true,
          description:
            "Fixed once the workspace is addressable — it is in every workspace URL, agent configuration and gateway pairing.",
        },
        {
          ...field(
            "status",
            "Lifecycle status",
            "option",
            "workspace",
            true,
            TENANT_STATUS_VALUES,
          ),
          readOnly: true,
          renderAs: "status" as const,
          description:
            "Changed through the Actions menu so every transition carries a reason and is audited.",
        },
        {
          ...field("subStatus", "Status reason", "text", "workspace"),
          readOnly: true,
        },
        {
          ...field(
            "environmentType",
            "Environment",
            "option",
            "workspace",
            true,
            ["PRODUCTION", "UAT", "SANDBOX", "DEVELOPMENT"],
          ),
          readOnly: true,
          renderAs: "status" as const,
          description:
            "Which of the customer's workspaces this is. Fixed after activation — promoting UAT to production by relabelling would reclassify live data rather than move it.",
        },
        {
          ...field(
            "customerAccountId",
            "Customer",
            "lookup",
            "customer-relationship",
            true,
          ),
          lookupPath: "/super-admin/customers?pageSize=100",
          readOnly: true,
          displayValueField: "customerAccount.companyName",
          displayHref: "/customers/{customerAccountId}",
        },
        {
          ...field(
            "originatingLeadId",
            "Originating lead",
            "lookup",
            "customer-relationship",
          ),
          lookupPath: "/super-admin/leads?pageSize=100",
          readOnly: true,
          hideWhenEmpty: true,
          displayValueField: "originatingLead.label",
          displayHref: "/leads/{originatingLeadId}",
        },
        {
          ...field(
            "originatingPartnerId",
            "Originating partner",
            "lookup",
            "customer-relationship",
          ),
          lookupPath: "/partners?pageSize=100",
          readOnly: true,
          hideWhenEmpty: true,
          displayValueField: "originatingPartner.label",
          displayHref: "/partners/{originatingPartnerId}",
        },
        {
          ...field(
            "referralCodeSnapshot",
            "Referral code",
            "text",
            "customer-relationship",
          ),
          readOnly: true,
          hideWhenEmpty: true,
        },
        {
          ...field(
            "originatingReferralLinkId",
            "Originating referral link",
            "text",
            "customer-relationship",
          ),
          readOnly: true,
          hideWhenEmpty: true,
          renderAs: "identifier" as const,
          visibleWhen: { field: "originatingPartnerId", hasValue: true },
        },
        {
          ...field("id", "Tenant ID", "text", "identifiers"),
          readOnly: true,
          renderAs: "identifier" as const,
        },
        {
          ...field(
            "ownerUserId",
            "Primary Tenant Owner",
            "text",
            "identifiers",
          ),
          readOnly: true,
          displayValueField: "owner.fullName",
          description: "Managed from Access & Security.",
        },
        {
          ...field("createdAt", "Created", "dateTime", "record-history"),
          readOnly: true,
        },
        {
          ...field("createdById", "Created by", "text", "record-history"),
          readOnly: true,
          displayValueField: "createdByName",
        },
        {
          ...field("updatedAt", "Last updated", "dateTime", "record-history"),
          readOnly: true,
        },
        {
          ...field("updatedById", "Updated by", "text", "record-history"),
          readOnly: true,
          displayValueField: "updatedByName",
        },
        {
          ...field("isDemoData", "Demo data", "boolean", "provenance"),
          readOnly: true,
        },
        {
          ...field("demoBatchId", "Demo batch ID", "text", "provenance"),
          readOnly: true,
          hideWhenEmpty: true,
          renderAs: "identifier" as const,
        },
        {
          ...field("seedSource", "Seed source", "text", "provenance"),
          readOnly: true,
          hideWhenEmpty: true,
        },
      ],
      [
        "Overview",
        "Configuration",
        "Access & Security",
        "Commercial",
        "Apps & Modules",
        "Operations",
        "Timeline",
        "System",
      ],
      {
        workspace: "configuration",
        "customer-relationship": "configuration",
        identifiers: "system",
        "record-history": "system",
        provenance: "system",
      },
    ),
    actions: TENANT_RECORD_ACTIONS,
    /*
     * Commercial and Operations render agreements, invoices and support cases in
     * their own panels, so the generic related-record tables are not repeated
     * here. Branding and the tenant Integrations table are gone on purpose:
     * branding belongs to the tenant application, and integration configuration
     * now lives under the module it belongs to in Apps & Modules.
     */
    relatedRecords: [],
  }),
  define({
    ...simple(
      "contracts",
      "Contract",
      "Contracts",
      "FileSignature",
      "/contracts",
      "/contracts",
      "agreements",
      [
        col("contractNumber", "Contract", 170),
        col("title", "Title", 250),
        col("counterpartyName", "Counterparty", 210),
        col("contractType", "Type", 150),
        col("status", "Status", 180, "status"),
        col("signatureRequests", "Signature requests", 160, "number"),
        col("ownerPlatformUser.fullName", "Owner", 170, "lookup"),
        col("effectiveDate", "Effective", 130, "date"),
        col("expiryDate", "Expiry", 130, "date"),
        col("contractValue", "Value", 150, "currency"),
      ],
    ),
    views: views("contracts", [
      "all",
      "drafts",
      "internal-review",
      "ready-to-send",
      "awaiting-our-signature",
      "awaiting-external-signature",
      "partially-signed",
      "fully-executed",
      "declined",
      "expiring-soon",
      "expired",
      "voided",
    ]),
    statuses: CONTRACT_STATUSES,
    forms: contractForms([
      { ...field("id", "Agreement ID", "text", "system"), readOnly: true },
      {
        ...field("contractNumber", "Agreement number", "text", "identity"),
        readOnly: true,
        placeholder: "Generated on save",
        description:
          "Generated automatically when the agreement is first saved.",
      },
      field("title", "Contract title", "text", "identity", true),
      field("contractType", "Contract type", "option", "identity", true, [
        "PARTNER_AGREEMENT",
        "MASTER_PARTNER_AGREEMENT",
        "COMMISSION_ADDENDUM",
        "TERRITORY_ADDENDUM",
        "REFERRAL_ADDENDUM",
        "CUSTOMER_AGREEMENT",
        "MASTER_SERVICES_AGREEMENT",
        "SUBSCRIPTION_AGREEMENT",
        "DATA_PROCESSING_AGREEMENT",
        "SLA",
        "STATEMENT_OF_WORK",
        "NDA",
        "SERVICE_AGREEMENT",
        "ADDENDUM",
        "AMENDMENT",
        "RENEWAL",
        "TERMINATION",
        "OTHER",
      ]),
      {
        ...field(
          "agreementCategory",
          "Agreement category",
          "option",
          "identity",
        ),
        description:
          "Optional business context; contract type remains the legal classification.",
        options: [...AGREEMENT_CATEGORY_OPTIONS],
      },
      {
        ...field(
          "lifecycleGatePurpose",
          "Lifecycle gate purpose",
          "text",
          "identity",
        ),
        description:
          "Optional lifecycle gate configured for this agreement, such as customer or partner activation.",
        maxLength: 120,
      },
      field(
        "isGoverningAgreement",
        "Governing agreement",
        "boolean",
        "identity",
      ),
      {
        ...field(
          "allowChangeRequests",
          "Allow signer change requests",
          "boolean",
          "identity",
        ),
        description:
          "Lets external signers return the agreement to the platform with a required comment before signing.",
      },
      field("signingMode", "Signing mode", "option", "identity", true, [
        "SEQUENTIAL",
        "PARALLEL",
        "MIXED",
      ]),
      {
        ...field(
          "status",
          "Agreement status",
          "option",
          "identity",
          true,
          CONTRACT_STATUSES.map((item) => item.value),
        ),
        readOnly: true,
        description:
          "New agreements start in Draft. Use workflow actions to change status after saving.",
      },
      {
        ...field("processStage", "Process stage", "text", "identity"),
        readOnly: true,
        description:
          "Calculated automatically from the agreement workflow and signing progress.",
      },
      field(
        "counterpartyType",
        "Counterparty type",
        "option",
        "identity",
        false,
        [
          "PARTNER",
          "CUSTOMER",
          "LEAD",
          "TENANT",
          "INDIVIDUAL",
          "EXTERNAL_ORGANIZATION",
        ],
      ),
      field("documentSource", "Document source", "option", "identity", true, [
        "BLANK",
        "EDITOR",
        "TEMPLATE",
        "COPY",
        "UPLOAD",
      ]),
      {
        ...field("templateId", "Template", "lookup", "identity"),
        lookupPath: "/contract-templates",
      },
      field(
        "counterpartyName",
        "Counterparty name",
        "text",
        "counterparty",
        true,
      ),
      field("counterpartyEmail", "Counterparty email", "email", "counterparty"),
      {
        ...field("partnerId", "Partner", "lookup", "counterparty"),
        lookupPath: "/partners",
        visibleWhenAny: [
          { field: "counterpartyType", equals: "PARTNER" },
          { field: "partnerId", hasValue: true },
        ],
        hideWhenEmpty: true,
      },
      {
        ...field("customerAccountId", "Customer", "lookup", "counterparty"),
        lookupPath: "/super-admin/customers",
        visibleWhenAny: [
          { field: "counterpartyType", equals: "CUSTOMER" },
          { field: "customerAccountId", hasValue: true },
        ],
      },
      {
        ...field(
          "customerOnboardingId",
          "Related onboarding",
          "lookup",
          "counterparty",
        ),
        lookupPath: "/super-admin/customer-onboarding?pageSize=100",
        visibleWhen: { field: "counterpartyType", equals: "CUSTOMER" },
      },
      {
        ...field("tenantId", "Tenant", "lookup", "counterparty"),
        lookupPath: "/super-admin/tenants",
        visibleWhenAny: [
          { field: "counterpartyType", equals: "TENANT" },
          { field: "tenantId", hasValue: true },
        ],
      },
      {
        ...field("relatedLeadId", "Related lead", "lookup", "counterparty"),
        lookupPath: "/super-admin/leads?pageSize=100",
        visibleWhenAny: [
          { field: "counterpartyType", equals: "LEAD" },
          { field: "relatedLeadId", hasValue: true },
        ],
      },
      {
        ...field(
          "ownerPlatformUserId",
          "Contract owner",
          "userLookup",
          "ownership",
        ),
        lookupPath: "/platform-users/owner-candidates",
      },
      {
        ...field(
          "internalLegalOwnerId",
          "Internal legal owner",
          "userLookup",
          "ownership",
        ),
        lookupPath: "/platform-users/owner-candidates",
      },
      {
        ...field("parentContractId", "Parent contract", "lookup", "ownership"),
        lookupPath: "/contracts?pageSize=100",
      },
      field("amendmentNumber", "Amendment number", "integer", "ownership"),
      {
        ...field("currencyCode", "Currency", "option", "commercial"),
        options: PLATFORM_CURRENCY_OPTIONS,
      },
      {
        ...field("contractValue", "Contract value", "currency", "commercial"),
        min: 0,
      },
      {
        ...field(
          "commissionPercentage",
          "Commission percentage",
          "percentage",
          "commercial",
        ),
        min: 0,
        max: 100,
      },
      {
        ...field("commissionBasis", "Commission basis", "text", "commercial"),
        description:
          "Commercial basis defined by the agreement; no platform option set is configured yet.",
        maxLength: 120,
      },
      field("paymentTerms", "Payment terms", "longText", "commercial"),
      field("effectiveDate", "Effective date", "date", "commercial"),
      field("expiryDate", "Expiry date", "date", "commercial"),
      field("effectiveFrom", "Terms effective from", "date", "commercial"),
      field("effectiveUntil", "Terms effective until", "date", "commercial"),
      field("autoRenewal", "Auto renewal", "boolean", "commercial"),
      {
        ...field(
          "renewalNoticeDays",
          "Renewal notice days",
          "integer",
          "commercial",
        ),
        min: 0,
      },
      {
        ...field(
          "terminationNoticeDays",
          "Termination notice days",
          "integer",
          "commercial",
        ),
        min: 0,
      },
      field("governingLaw", "Governing law", "text", "legal"),
      field("jurisdiction", "Jurisdiction", "text", "legal"),
      field(
        "confidentialityClass",
        "Confidentiality classification",
        "option",
        "legal",
        false,
        ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"],
      ),
      field("notes", "Internal notes", "longText", "legal"),
      {
        ...field("amendsContractId", "Amends agreement", "lookup", "ownership"),
        lookupPath: "/contracts?pageSize=100",
      },
      {
        ...field("renewsContractId", "Renews agreement", "lookup", "ownership"),
        lookupPath: "/contracts?pageSize=100",
      },
      {
        ...field(
          "supersedesContractId",
          "Supersedes agreement",
          "lookup",
          "ownership",
        ),
        lookupPath: "/contracts?pageSize=100",
      },
      {
        ...field("subscriptionId", "Subscription", "lookup", "commercial"),
        lookupPath: "/super-admin/subscriptions?pageSize=100",
      },
      {
        ...field(
          "currentVersionNumber",
          "Current version",
          "integer",
          "system",
        ),
        readOnly: true,
      },
      {
        ...field("signedAt", "Signed at", "dateTime", "system"),
        readOnly: true,
      },
      {
        ...field("activatedAt", "Activated at", "dateTime", "system"),
        readOnly: true,
      },
      {
        ...field("terminatedAt", "Terminated at", "dateTime", "system"),
        readOnly: true,
      },
      {
        ...field(
          "terminationReason",
          "Termination reason",
          "longText",
          "system",
        ),
        readOnly: true,
      },
      {
        ...field("archivedAt", "Archived at", "dateTime", "system"),
        readOnly: true,
      },
      {
        ...field("createdById", "Created by", "text", "system"),
        readOnly: true,
      },
      {
        ...field("updatedById", "Updated by", "text", "system"),
        readOnly: true,
      },
      {
        ...field("createdAt", "Created", "dateTime", "system"),
        readOnly: true,
      },
      {
        ...field("updatedAt", "Last updated", "dateTime", "system"),
        readOnly: true,
      },
      field(
        "contentHtml",
        "Contract document",
        "documentEditor",
        "document",
        true,
      ),
    ]),
    process: {
      key: "standard-agreement",
      stages: [
        "DRAFT",
        "INTERNAL_REVIEW",
        "COMMERCIAL_APPROVAL",
        "LEGAL_APPROVAL",
        "COUNTERPARTY_REVIEW",
        "APPROVED_FOR_SENDING",
        "SENT",
        "VIEWED",
        "PARTIALLY_SIGNED",
        "FULLY_EXECUTED",
        "ACTIVE",
        "EXPIRING",
        "EXPIRED",
        "TERMINATED",
        "ARCHIVED",
      ].map((key) => ({ key, label: title(key) })),
    },
    actions: [
      ...CREATE_LIST_ACTIONS,
      ACTION.back,
      {
        ...ACTION.edit,
        states: [
          "DRAFT",
          "INTERNAL_REVIEW",
          "COMMERCIAL_APPROVAL",
          "LEGAL_APPROVAL",
          "COUNTERPARTY_REVIEW",
          "APPROVED_FOR_SENDING",
          "READY_FOR_SIGNATURE",
          "DECLINED",
        ],
      },
      ACTION.save,
      ACTION.saveClose,
      {
        key: "submit",
        label: "Submit for internal review",
        scope: "record",
        placement: "primary",
        states: ["DRAFT", "INTERNAL_REVIEW"],
      },
      {
        key: "stage-back",
        label: "Previous stage",
        scope: "record",
        placement: "secondary",
        states: [
          "INTERNAL_REVIEW",
          "COUNTERPARTY_REVIEW",
          "READY_FOR_SIGNATURE",
        ],
      },
      {
        key: "stage-forward",
        label: "Next stage",
        scope: "record",
        placement: "secondary",
        states: [
          "DRAFT",
          "COUNTERPARTY_REVIEW",
          "FULLY_SIGNED",
          "ACTIVE",
          "EXPIRING",
        ],
      },
      {
        key: "generate-document",
        label: "Generate document",
        scope: "record",
        placement: "secondary",
      },
      {
        key: "send-signature",
        label: "Send for signature",
        scope: "record",
        placement: "primary",
        states: ["READY_FOR_SIGNATURE", "APPROVED_FOR_SENDING"],
      },
      {
        key: "approve",
        label: "Approve",
        scope: "record",
        placement: "primary",
        states: ["COMMERCIAL_APPROVAL", "LEGAL_APPROVAL"],
      },
      {
        key: "reject",
        label: "Reject",
        scope: "record",
        placement: "secondary",
        states: ["COMMERCIAL_APPROVAL", "LEGAL_APPROVAL"],
      },
      {
        key: "duplicate",
        label: "Duplicate",
        scope: "record",
        placement: "overflow",
      },
      {
        key: "new-version",
        label: "Create new version",
        scope: "record",
        placement: "overflow",
        states: [
          "DRAFT",
          "INTERNAL_REVIEW",
          "SENT",
          "VIEWED",
          "SIGNATURE_IN_PROGRESS",
          "PARTIALLY_SIGNED",
        ],
      },
      {
        key: "amend",
        label: "Amend",
        scope: "record",
        placement: "secondary",
        states: ["FULLY_EXECUTED", "ACTIVE"],
      },
      {
        key: "renew",
        label: "Renew",
        scope: "record",
        placement: "secondary",
        states: ["FULLY_EXECUTED", "ACTIVE", "EXPIRING", "EXPIRED"],
      },
      {
        key: "terminate-agreement",
        label: "Terminate",
        scope: "record",
        placement: "overflow",
        states: ["FULLY_EXECUTED", "ACTIVE", "EXPIRING"],
        destructive: true,
        confirmTitle: "Terminate this agreement?",
      },
      {
        key: "void-agreement",
        label: "Void",
        scope: "record",
        placement: "overflow",
        states: [
          "DRAFT",
          "INTERNAL_REVIEW",
          "APPROVED_FOR_SENDING",
          "SENT",
          "VIEWED",
          "SIGNATURE_IN_PROGRESS",
          "PARTIALLY_SIGNED",
        ],
        destructive: true,
        confirmTitle: "Void this agreement?",
      },
    ],
    relatedRecords: [
      {
        key: "signatureRequests",
        label: "Signature requests",
        tab: "signatures",
        emptyTitle: "No signature requests yet",
        emptyDescription:
          "Send the approved agreement for signature when all parties are ready.",
        module: "signature-requests",
        foreignKey: "contractId",
      },
      {
        key: "documents",
        label: "Contract documents",
        tab: "document",
        foreignKey: "contractId",
      },
      {
        key: "approvalRequests",
        label: "Approval history",
        tab: "timeline",
        foreignKey: "contractId",
      },
      {
        key: "parties",
        label: "Parties and signers",
        tab: "parties",
        foreignKey: "contractId",
      },
      {
        key: "fieldPlacements",
        label: "Placed fields",
        tab: "fields",
        foreignKey: "contractId",
      },
      {
        key: "relatedRecords",
        label: "Related records",
        tab: "related",
        foreignKey: "contractId",
        columns: [
          {
            key: "record",
            field: "displayName",
            label: "Record",
            minWidth: 220,
          },
          { key: "recordType", field: "recordType", label: "Type" },
          {
            key: "relationshipType",
            field: "relationshipType",
            label: "Relationship",
          },
          { key: "status", field: "status", label: "Status" },
          { key: "createdAt", field: "createdAt", label: "Linked" },
        ],
      },
      {
        key: "versions",
        label: "Versions",
        tab: "versions",
        foreignKey: "contractId",
      },
    ],
  }),
  define({
    ...simple(
      "contract-templates",
      "Contract template",
      "Templates",
      "Files",
      "/templates",
      "/contract-templates",
      "agreements",
      [
        col("name", "Template", 260),
        col("contractType", "Contract type", 160),
        col("versions", "Versions", 90, "number"),
        col("isActive", "Active", 130, "status"),
        col("updatedAt", "Updated", 160, "dateTime"),
      ],
    ),
    actions: [
      ...CREATE_LIST_ACTIONS,
      ACTION.back,
      {
        key: "save",
        label: "Create version",
        scope: "record",
        placement: "primary",
      },
      {
        key: "activate",
        label: "Activate",
        scope: "record",
        placement: "secondary",
        states: ["INACTIVE"],
      },
      {
        key: "deactivate",
        label: "Deactivate",
        scope: "record",
        placement: "secondary",
        states: ["ACTIVE"],
      },
      {
        key: "archive",
        label: "Archive",
        scope: "record",
        placement: "overflow",
        states: ["ACTIVE", "INACTIVE"],
        destructive: true,
        confirmTitle: "Archive this template?",
        confirmDescription:
          "Existing contracts remain linked to their original template version.",
      },
      {
        key: "duplicate",
        label: "Clone template",
        scope: "record",
        placement: "overflow",
      },
    ],
  }),
  define({
    ...simple(
      "signature-requests",
      "Signature request",
      "Signature requests",
      "PenLine",
      "/signature-requests",
      "/signature-requests",
      "agreements",
      [
        col("contract.contractNumber", "Contract", 170, "lookup"),
        col("status", "Status", 150, "status"),
        col("recipients", "Recipients", 100, "number"),
        col("expiresAt", "Expires", 160, "dateTime"),
        col("completedAt", "Completed", 160, "dateTime"),
      ],
    ),
    actions: [
      ...READ_ONLY_ACTIONS,
      {
        key: "resend",
        label: "Resend",
        scope: "record",
        placement: "primary",
        states: ["SENT", "VIEWED", "EXPIRED"],
      },
      {
        key: "cancel",
        label: "Cancel request",
        scope: "record",
        placement: "overflow",
        destructive: true,
        states: ["SENT", "VIEWED", "PARTIALLY_SIGNED", "EXPIRED"],
        confirmTitle: "Cancel this signature request?",
        confirmDescription: "Current secure signing links will stop working.",
      },
    ],
  }),
  define({
    ...simple(
      "support-cases",
      "Support case",
      "Support cases",
      "LifeBuoy",
      "/support/cases",
      "/support-cases",
      "support",
      [
        col("caseNumber", "Case", 150),
        col("title", "Title", 260),
        col("severity", "Severity", 120, "status"),
        col("priority", "Priority", 120, "status"),
        col("status", "Status", 170, "status"),
        col("customerAccount.companyName", "Customer", 190, "lookup"),
        col("assignedToUser", "Assigned to", 190, "lookup"),
        col("resolutionDueAt", "Resolution due", 170, "dateTime"),
        col("firstResponseDueAt", "Response due", 160, "dateTime"),
      ],
    ),
    statuses: SUPPORT_STATUSES,
    views: [
      { key: "all", label: "All cases", kind: "system", isSystemDefault: true },
      { key: "unassigned", label: "Unassigned", kind: "system" },
      { key: "my-cases", label: "My Cases", kind: "personal" },
      { key: "at-risk", label: "At Risk", kind: "team" },
      { key: "sla-breached", label: "SLA Breached", kind: "system" },
    ],
    defaultView: "all",
    forms: form("support-cases", [
      field("title", "Case title", "text", "case", true),
      field("description", "Description", "longText", "case", true),
      field(
        "status",
        "Status",
        "option",
        "case",
        false,
        SUPPORT_STATUSES.map((item) => item.value),
      ),
      field("priority", "Priority", "option", "triage", true, [
        "LOW",
        "NORMAL",
        "HIGH",
        "URGENT",
      ]),
      field("severity", "Severity", "option", "triage", true, [
        "S1_CRITICAL",
        "S2_HIGH",
        "S3_MEDIUM",
        "S4_LOW",
      ]),
      field("channel", "Channel", "option", "triage", true, [
        "WEB",
        "EMAIL",
        "PHONE",
        "CHAT",
        "MONITORING",
        "INTERNAL",
      ]),
      {
        ...field("customerAccountId", "Customer", "lookup", "customer"),
        lookupPath: "/super-admin/customers",
      },
      {
        ...field("tenantId", "Tenant", "lookup", "customer"),
        lookupPath: "/super-admin/tenants",
      },
      field("requesterName", "Requester name", "text", "customer"),
      field("requesterEmail", "Requester email", "email", "customer"),
      {
        ...field(
          "assignedToUserId",
          "Support owner",
          "userLookup",
          "ownership",
        ),
        lookupPath: "/platform-users/owner-candidates",
      },
      field("assignedTeam", "Support team", "option", "ownership", false, [
        "Customer Support",
        "Engineering",
        "Billing",
        "Platform Operations",
      ]),
      field(
        "resolutionSummary",
        "Resolution summary",
        "longText",
        "resolution",
      ),
      field("rootCause", "Root cause", "longText", "resolution"),
      field(
        "customerUpdate",
        "Latest customer update",
        "longText",
        "resolution",
      ),
    ]),
    actions: [
      ...CREATE_LIST_ACTIONS,
      ACTION.bulkAssign,
      ...EDIT_RECORD_ACTIONS,
    ],
    relatedRecords: [
      {
        key: "incidentLinks",
        label: "Linked incidents",
        module: "monitoring-incidents",
        foreignKey: "supportCaseId",
      },
      {
        key: "childCases",
        label: "Child cases",
        module: "support-cases",
        foreignKey: "parentCaseId",
      },
      {
        key: "attachments",
        label: "Attachments",
        foreignKey: "supportCaseId",
      },
    ],
  }),
  define({
    ...simple(
      "subscriptions",
      "Subscription",
      "Subscriptions",
      "RefreshCcw",
      "/subscriptions",
      "/super-admin/subscriptions",
      "revenue",
      [
        col("tenant.name", "Tenant", 200, "lookup"),
        col("plan.name", "Plan", 180, "lookup"),
        col("status", "Status", 140, "status"),
        col("billingCycle", "Cycle", 120),
        col("currentPeriodEnd", "Renewal", 150, "date"),
      ],
    ),
    forms: form("subscriptions", [
      {
        ...field("tenantId", "Tenant", "lookup", "subscription", true),
        lookupPath: "/super-admin/tenants",
      },
      {
        ...field("planId", "Plan", "lookup", "subscription", true),
        lookupPath: "/super-admin/plans",
      },
      {
        ...field("planPriceId", "Price", "lookup", "subscription"),
        lookupPath: "/super-admin/promotions/targets?scope=PRICE",
      },
      field("status", "Status", "option", "subscription", false, [
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "CANCELLED",
        "UNPAID",
        "INCOMPLETE",
        "EXPIRED",
        "PAUSED",
      ]),
      field("billingCycle", "Billing cycle", "option", "subscription", false, [
        "MONTHLY",
        "ANNUAL",
      ]),
      field(
        "purchasedSeats",
        "Licensed seats",
        "integer",
        "subscription",
        true,
      ),
      field("stripeQuantity", "Stripe quantity", "integer", "subscription"),
      field("currency", "Currency", "text", "commercial"),
      field("basePrice", "Base price", "currency", "commercial"),
      field("finalPrice", "Final price", "currency", "commercial"),
      field("trialStart", "Trial starts", "dateTime", "dates"),
      field("trialEnd", "Trial ends", "dateTime", "dates"),
      field("currentPeriodStart", "Period start", "dateTime", "dates"),
      field("currentPeriodEnd", "Period end", "dateTime", "dates"),
    ]),
  }),
  define({
    ...simple(
      "plans",
      "Plan",
      "Plans",
      "Package",
      "/plans",
      "/super-admin/plans",
      "revenue",
      [
        col("name", "Plan", 220),
        // Publication, not `isActive`, is what decides whether a plan reaches
        // the public catalogue. Leading with it shows an operator the state
        // that actually governs what customers can buy.
        col("publicationStatus", "Publication", 130, "status"),
        col("isActive", "Active", 100, "status"),
        col("salesModel", "Sales model", 140, "status"),
        // The legacy monthlyBasePrice / annualBasePrice columns used to sit
        // here, so the first amount an operator saw was the one checkout does
        // not use — BUG-0027. Authoritative amounts live on PlanPrice, per
        // market and currency; the list shows how many are configured and the
        // record page shows them.
        col("prices", "Prices", 90, "number"),
        col("features", "Features", 100, "number"),
        col("subscriptions", "Subscriptions", 120, "number"),
        col("updatedAt", "Updated", 160, "dateTime"),
      ],
    ),
    forms: planForms(),
    actions: [...CREATE_LIST_ACTIONS, ...EDIT_RECORD_ACTIONS],
    /*
     * These declared no `tab`, and the record page only renders a relationship
     * whose tab is the active one — so a plan with tabs named "Subscriptions"
     * and "Tenants" showed neither panel, on either tab, ever.
     */
    relatedRecords: [
      {
        key: "subscriptions",
        label: "Subscriptions on this plan",
        tab: "subscriptions",
        description:
          "Tenants currently billed on this plan. Their agreed terms are snapshotted at purchase and are not changed by editing the plan.",
        emptyTitle: "No tenant is subscribed to this plan",
        emptyDescription:
          "Pricing and entitlement changes here affect nobody until a tenant subscribes.",
        module: "subscriptions",
        foreignKey: "planId",
      },
      {
        key: "selectedByCustomers",
        label: "Customers who selected this plan",
        tab: "customers",
        description:
          "Customer accounts that named this plan during onboarding, whether or not a subscription exists yet.",
        emptyTitle: "No customer has selected this plan",
        emptyDescription:
          "Customers pick a plan during onboarding or at checkout.",
        module: "customers",
        foreignKey: "selectedPlanId",
      },
    ],
  }),
  define(
    simple(
      "invoices",
      "Invoice",
      "Invoices",
      "FileText",
      "/invoices",
      "/super-admin/invoices",
      "revenue",
      [
        col("invoiceNumber", "Invoice", 160),
        col("tenant.name", "Tenant", 200, "lookup"),
        col("status", "Status", 140, "status"),
        col("amount", "Amount", 150, "currency"),
        col("amountDue", "Due", 150, "currency"),
        col("dueDate", "Due date", 140, "date"),
      ],
    ),
  ),
  define({
    ...simple(
      "payments",
      "Payment",
      "Payments",
      "CreditCard",
      "/payments",
      "/super-admin/payments",
      "revenue",
      [
        col("tenant.name", "Tenant", 200, "lookup"),
        col("status", "Status", 130, "status"),
        col("amount", "Amount", 150, "currency"),
        col("paymentMethod", "Method", 130),
        col("paidAt", "Paid", 160, "dateTime"),
      ],
    ),
    forms: form("payments", [
      field("tenantId", "Tenant ID", "text", "payment"),
      field("invoiceId", "Invoice ID", "text", "payment"),
      field("status", "Status", "text", "payment"),
      field("amount", "Amount", "currency", "payment"),
      field("currency", "Currency", "text", "payment"),
      field("paymentMethod", "Payment method", "text", "payment"),
      field("paidAt", "Paid", "dateTime", "dates"),
      field("createdAt", "Created", "dateTime", "dates"),
    ]),
  }),
  define({
    ...simple(
      "commissions",
      "Commission",
      "Commissions",
      "BadgeDollarSign",
      "/commissions",
      "/partner-commissions",
      "revenue",
      [
        col("commissionNumber", "Commission", 170),
        col("partner.displayName", "Partner", 210, "lookup"),
        col("status", "Status", 130, "status"),
        col("commissionAmount", "Amount", 150, "currency"),
        col("dueAt", "Due", 140, "date"),
      ],
    ),
    forms: form("commissions", [
      field("commissionNumber", "Commission number", "text", "commission"),
      field("partnerId", "Partner ID", "text", "commission"),
      field("status", "Status", "text", "commission"),
      field("baseAmount", "Base amount", "currency", "commercial"),
      field("commissionRate", "Commission rate", "percentage", "commercial"),
      field("commissionAmount", "Commission amount", "currency", "commercial"),
      // A code, like the two above — see the note on the partner declaration.
      {
        ...field("currencyCode", "Currency", "option", "commercial"),
        options: PLATFORM_CURRENCY_OPTIONS,
      },
      field("earnedAt", "Earned", "dateTime", "dates"),
      field("dueAt", "Due", "dateTime", "dates"),
      field("paidAt", "Paid", "dateTime", "dates"),
    ]),
  }),
  define({
    ...simple(
      "monitoring-incidents",
      "Monitoring incident",
      "Monitoring incidents",
      "Bug",
      "/settings/monitoring/error-logs",
      "/platform/logs/events",
      "support",
      [
        col("traceId", "Reference", 210),
        col("createdAt", "Timestamp", 170, "dateTime"),
        col("severity", "Severity", 120, "status"),
        col("sourceApp", "Source", 100),
        col("tenantId", "Tenant", 200, "lookup"),
        col("supportStatus", "Incident status", 160, "status"),
      ],
    ),
    views: [
      {
        key: "all",
        label: "All incidents",
        description: "Every sanitized incident.",
        kind: "system",
        isSystemDefault: true,
        roles: ALL_PLATFORM_ROLES,
      },
      {
        key: "critical",
        label: "Critical incidents",
        description: "Errors requiring urgent triage.",
        kind: "system",
        roles: ALL_PLATFORM_ROLES,
      },
      {
        key: "new",
        label: "New support intake",
        description: "Incidents not yet triaged.",
        kind: "team",
        roles: ALL_PLATFORM_ROLES,
      },
      {
        key: "investigating",
        label: "Under investigation",
        description: "Incidents actively being investigated.",
        kind: "team",
        roles: ALL_PLATFORM_ROLES,
      },
      {
        key: "resolved",
        label: "Resolved incidents",
        description: "Resolved customer support records.",
        kind: "system",
        roles: ALL_PLATFORM_ROLES,
      },
    ],
    defaultView: "all",
  }),
];

const runtimeDefinitionErrors = definitions.flatMap((definition) => [
  ...validateRuntimeDefinition(definition),
  ...unreachableFormPlacements(definition),
]);

/**
 * A form field that renders nowhere.
 *
 * `validateRuntimeDefinition` checks that a form field exists in the Prisma
 * schema and is readable. It says nothing about whether the operator can ever
 * see it — and the record page draws a section only when its tab is the active
 * one, so a section pinned to a tab the form does not declare is invisible
 * while every existing check stays green. The schema-coverage rule then passes
 * on fields nobody can reach, which is the worst of both: a validation that
 * asserts presence and proves nothing.
 */
function unreachableFormPlacements(definition: PlatformModuleDefinition) {
  return definition.forms.flatMap((formDefinition) => {
    if (!formDefinition.tabs?.length) return [];
    const tabKeys = new Set(formDefinition.tabs.map((tab) => tab.key));
    const sectionKeys = new Set(
      formDefinition.sections
        .filter((section) => !section.tab || tabKeys.has(section.tab))
        .map((section) => section.key),
    );
    return [
      ...formDefinition.sections
        .filter((section) => section.tab && !tabKeys.has(section.tab))
        .map(
          (section) =>
            `${definition.key}: ${formDefinition.key} section ${section.key} is placed on tab ${section.tab}, which the form does not declare`,
        ),
      ...formDefinition.fields
        .filter(
          (item) =>
            !sectionKeys.has(item.section) ||
            (item.tab && !tabKeys.has(item.tab)),
        )
        .map(
          (item) =>
            `${definition.key}: ${formDefinition.key} field ${item.key} renders on no tab (section ${item.section}, tab ${item.tab ?? "none"})`,
        ),
    ];
  });
}
const schemaCoverageModules = new Set<PlatformModuleKey>([
  "leads",
  "customers",
  "customer-onboarding",
  "tenants",
  "partners",
  "contracts",
]);
const schemaCoverageErrors = definitions.flatMap((definition) => {
  if (!schemaCoverageModules.has(definition.key)) return [];
  const schema = getRuntimeSchema(definition.key);
  if (!schema) return [`${definition.key}: generated schema is unavailable`];
  const represented = new Set(
    definition.forms.flatMap((form) => form.fields.map((item) => item.key)),
  );
  return Object.values(schema.fields)
    .filter((item) => item.readable && item.type !== "relation")
    .filter((item) => !represented.has(item.key))
    .map(
      (item) =>
        `${definition.key}: schema field ${item.key} is not represented on a record form`,
    );
});
if (runtimeDefinitionErrors.length || schemaCoverageErrors.length) {
  throw new Error(
    `Platform runtime metadata does not match the generated Prisma registry:\n- ${[
      ...runtimeDefinitionErrors,
      ...schemaCoverageErrors,
    ].join("\n- ")}`,
  );
}

export const PLATFORM_MODULE_REGISTRY = new Map(
  definitions.map((definition) => [definition.key, definition]),
);
export function getPlatformModuleDefinition(key: PlatformModuleKey) {
  const definition = PLATFORM_MODULE_REGISTRY.get(key);
  if (!definition) throw new Error(`Unknown platform module: ${key}`);
  return definition;
}
export function listPlatformModuleDefinitions() {
  return [...PLATFORM_MODULE_REGISTRY.values()];
}
export function listPlatformNavigation(roleKeys: string[]) {
  return definitions
    .filter((definition) => definition.key !== "dashboard" || true)
    .filter(
      (definition) =>
        !definition.views.every(
          (view) =>
            view.roles?.length &&
            !view.roles.some((role) => roleKeys.includes(role)),
        ),
    );
}

function define(
  input: Partial<PlatformModuleDefinition> &
    Pick<
      PlatformModuleDefinition,
      | "key"
      | "entityType"
      | "displayName"
      | "pluralDisplayName"
      | "description"
      | "icon"
      | "routeBase"
      | "navigationGroup"
      | "apiBase"
      | "views"
      | "defaultView"
      | "columns"
    >,
): PlatformModuleDefinition {
  const definition = {
    defaultSort: [{ field: "createdAt", direction: "desc" }],
    searchableFields: input.columns
      .filter(
        (column) => column.format === undefined || column.format === "text",
      )
      .map((column) => column.field),
    filterableFields: input.columns
      .filter((column) => column.filterable !== false)
      .map((column) => column.field),
    forms: input.forms ?? form(input.key, []),
    actions: input.actions ?? READ_ONLY_ACTIONS,
    relatedRecords: input.relatedRecords ?? [],
    permissions: input.permissions ?? modulePermissions(input.key),
    emptyState: input.emptyState ?? {
      title: `No ${input.pluralDisplayName.toLowerCase()} found`,
      description: `Create a ${input.displayName.toLowerCase()} or adjust the current view and filters.`,
      actionLabel: `New ${input.displayName.toLowerCase()}`,
    },
    importExport: input.importExport ?? { export: true, formats: ["csv"] },
    capabilities: MODULE_CAPABILITIES[input.key],
    ...input,
  } as PlatformModuleDefinition;
  definition.actions = withDefaultActions(
    definition.key,
    definition.capabilities,
    definition.actions,
  ).map((action) => ({
    ...action,
    permission:
      action.permission ?? actionPermission(action.key, definition.permissions),
  }));
  definition.recordHeader =
    definition.recordHeader ?? defaultRecordHeader(definition);
  definition.forms = completeFormsFromSchema(definition);
  return definition;
}

/**
 * Owner / Status / Sub-status, resolved from what the module already declares.
 *
 * Nothing is invented. A slot appears only when the module's Prisma model
 * actually carries the field; its label and options are taken from the record
 * form when the module declares one, and from the generated enum otherwise, so
 * the header and the form never disagree about what a value is called.
 *
 * Editing is off by default. A header dropdown that PATCHed a lifecycle column
 * directly would route around whatever the owning service does on a
 * transition, so a slot becomes editable only where the runtime API exposes a
 * governed route for it — named on the slot as `write`.
 */
function defaultRecordHeader(
  definition: PlatformModuleDefinition,
): PlatformModuleDefinition["recordHeader"] {
  const schema = getRuntimeSchema(definition.key);
  if (!schema) return undefined;
  const declared = new Map(
    (definition.forms.find((item) => item.key === "detail")?.fields ?? []).map(
      (item) => [item.key, item] as const,
    ),
  );
  const has = (key: string) => Boolean(schema.fields[key]?.readable);
  const labelFor = (key: string, fallback: string) =>
    declared.get(key)?.label ?? fallback;
  const optionsFor = (key: string) =>
    declared.get(key)?.options ??
    (schema.fields[key]?.enumValues ?? []).map((value) => ({
      value,
      label: title(value),
    }));

  const ownerCandidate = OWNER_FIELD_CANDIDATES.find((candidate) =>
    has(candidate.field),
  );
  const owner: RuntimeRecordHeaderSlot | undefined = ownerCandidate
    ? {
        field: ownerCandidate.field,
        label: labelFor(ownerCandidate.field, "Owner"),
        displayValueField: ownerCandidate.displayValueField,
        lookupPath: OWNER_LOOKUP_PATH,
        ...(ASSIGNABLE_MODULES.has(definition.key)
          ? { write: "assign" as const }
          : {
              readOnlyReason:
                "The runtime API does not expose assignment for this module.",
            }),
      }
    : undefined;

  const statusField = has("status")
    ? "status"
    : has("publicationStatus")
      ? "publicationStatus"
      : undefined;
  const statusEditable =
    statusField === "status" && STATUS_TRANSITION_MODULES.has(definition.key);
  const status: RuntimeRecordHeaderSlot | undefined = statusField
    ? {
        field: statusField,
        label: labelFor(
          statusField,
          statusField === "status" ? "Status" : "Publication",
        ),
        options: optionsFor(statusField),
        ...(statusEditable
          ? { write: "change-status" as const }
          : {
              readOnlyReason:
                RECORD_HEADER_READ_ONLY_REASON[definition.key] ??
                "This status is maintained by the owning service, not edited here.",
            }),
      }
    : undefined;

  /*
   * `subStatus` is a free String on every model that has one, so only Leads
   * gets a real dependent optionset — the one place a curated value list
   * exists. Everywhere else the header shows the stored reason and leaves
   * editing to the form, rather than offering a picker with nothing in it.
   */
  const subStatusOptions =
    definition.key === "leads"
      ? Object.fromEntries(
          Object.entries(LEAD_SUB_STATUS_VALUES).map(([value, reasons]) => [
            value,
            reasons.map((reason) => ({ value: reason, label: reason })),
          ]),
        )
      : undefined;
  const subStatus: RuntimeRecordHeaderSlot | undefined = has("subStatus")
    ? {
        field: "subStatus",
        label: labelFor("subStatus", "Sub-status"),
        ...(subStatusOptions
          ? { optionsByStatus: subStatusOptions }
          : {
              readOnlyReason:
                "This module records a free-text status reason; edit it on the form.",
            }),
        ...(subStatusOptions && statusEditable
          ? { write: "change-status" as const }
          : {}),
      }
    : definition.key === "plans" && has("salesModel")
      ? {
          /*
           * A plan has no sub-status column. Sales model is the secondary
           * classification an operator actually reads next to publication —
           * whether the plan is bought self-service, sold, or quoted — so it
           * takes the slot rather than leaving a gap where D365 would draw
           * one.
           */
          field: "salesModel",
          label: labelFor("salesModel", "Sales model"),
          options: optionsFor("salesModel"),
          readOnlyReason:
            "Sales model is changed on the plan form alongside publication.",
        }
      : undefined;

  return owner || status || subStatus
    ? { owner, status, subStatus }
    : undefined;
}

function completeFormsFromSchema(definition: PlatformModuleDefinition) {
  const schema = getRuntimeSchema(definition.key);
  if (!schema) return definition.forms;
  const excluded = new Set(FORM_EXCLUDED_FIELDS[definition.key] ?? []);
  return definition.forms.map((formDefinition) => {
    const configured = new Set(formDefinition.fields.map((item) => item.key));
    const additional = Object.values(schema.fields)
      .filter(
        (item) =>
          item.readable &&
          !item.sensitive &&
          !item.list &&
          item.type !== "relation" &&
          !excluded.has(item.key) &&
          !configured.has(item.key),
      )
      .map((item) => ({
        key: item.key,
        label: item.label,
        type: runtimeControl(item.defaultControl),
        section: "additional-details",
        tab: "details",
        required: item.required && !item.systemManaged,
        readOnly: item.systemManaged || (!item.creatable && !item.editable),
        options: item.enumValues.map((value) => ({
          value,
          label: title(value),
        })),
        columnSpan: 1 as const,
      }));
    const tabs = formDefinition.tabs?.length
      ? formDefinition.tabs
      : [
          { key: "summary", label: "Summary" },
          { key: "details", label: "Details" },
          { key: "related", label: "Related Records" },
          { key: "documents", label: "Documents" },
          { key: "timeline", label: "Timeline" },
        ];
    const configuredFields = formDefinition.fields.map((item) => ({
      ...item,
      tab: item.tab ?? tabs[0]?.key,
    }));
    const sections = formDefinition.sections.map((item) => ({
      ...item,
      tab: item.tab ?? tabs[0]?.key,
    }));
    if (additional.length) {
      /*
       * Schema-completed fields have to land on a tab that exists. This
       * section was pinned to "details", which only exists in the default tab
       * set — so on any module that declares its own tabs the fields were
       * added, passed the schema-coverage check, and then rendered nowhere.
       * Falling back to the last declared tab puts them behind the System or
       * equivalent tab, which is where an uncurated column belongs anyway.
       */
      const fallbackTab =
        tabs.find((tab) => tab.key === "details")?.key ??
        tabs[tabs.length - 1]?.key ??
        "details";
      sections.push({
        key: "additional-details",
        label: "Additional details",
        columns: 3,
        tab: fallbackTab,
      });
      for (const item of additional) item.tab = fallbackTab;
    }
    return {
      ...formDefinition,
      tabs,
      sections,
      fields: [...configuredFields, ...additional],
    };
  });
}

function runtimeControl(control: string): RuntimeFieldDefinition["type"] {
  if (
    [
      "boolean",
      "dateTime",
      "integer",
      "decimal",
      "option",
      "file",
      "lookup",
    ].includes(control)
  )
    return control as RuntimeFieldDefinition["type"];
  return "text";
}

function actionPermission(
  key: string,
  permissions: PlatformModuleDefinition["permissions"],
) {
  if (["back", "refresh"].includes(key)) return undefined;
  if (key === "new") return permissions.create;
  if (["edit", "save", "save-close"].includes(key)) return permissions.update;
  if (["delete", "bulk-delete"].includes(key)) return permissions.delete;
  if (["assign", "bulk-assign"].includes(key)) return permissions.assign;
  if (key === "export") return permissions.export ?? permissions.read;
  if (["approve", "reject"].includes(key))
    return permissions.approve ?? permissions.update;
  return permissions.update;
}
function simple(
  key: PlatformModuleKey,
  displayName: string,
  pluralDisplayName: string,
  icon: string,
  routeBase: string,
  apiBase: string,
  navigationGroup: PlatformModuleDefinition["navigationGroup"],
  columns: PlatformModuleDefinition["columns"],
): Parameters<typeof define>[0] {
  return {
    key,
    entityType: displayName.replaceAll(" ", ""),
    displayName,
    pluralDisplayName,
    description: `Manage ${pluralDisplayName.toLowerCase()} and their business lifecycle.`,
    icon,
    routeBase,
    navigationGroup,
    apiBase,
    /*
     * Offer only the tabs this module can honour. Handing every module the
     * same three left several with a personal view filtering on a column their
     * model does not have, and an "Active" view matching a status they never
     * use — both rendered as tabs that changed nothing when clicked.
     */
    views: views(key, listRuntimeViewKeys(key)),
    defaultView: "all",
    columns,
    permissions: modulePermissions(key),
    actions: READ_ONLY_ACTIONS,
  };
}
function modulePermissions(
  key: PlatformModuleKey,
): PlatformModuleDefinition["permissions"] {
  const domain = [
    "partners",
    "partner-inquiries",
    "partner-onboarding",
    "commissions",
  ].includes(key)
    ? "partners"
    : ["contracts", "contract-templates", "signature-requests"].includes(key)
      ? "contracts"
      : key === "support-cases"
        ? "support"
        : key === "monitoring-incidents"
          ? "monitoring"
          : key === "customer-onboarding"
            ? "onboarding"
            : ["subscriptions", "plans", "invoices", "payments"].includes(key)
              ? "billing"
              : key;
  if (domain === "dashboard") return { read: "dashboard.read" };
  if (
    ["partners", "contracts", "support", "monitoring", "billing"].includes(
      domain,
    )
  )
    return {
      read: `${domain}.read`,
      create: `${domain}.manage`,
      update: `${domain}.manage`,
      delete: `${domain}.manage`,
      assign: `${domain}.manage`,
      approve:
        domain === "contracts" ? "contracts.approve" : `${domain}.manage`,
      export: `${domain}.read`,
    };
  return {
    read: `${domain}.read`,
    create: `${domain}.create`,
    update: `${domain}.update`,
    delete: `${domain}.update`,
    assign: `${domain}.update`,
    export: `${domain}.read`,
  };
}
function views(module: string, keys: string[]): RuntimeViewDefinition[] {
  const plural = module.replaceAll("-", " ");
  return keys.map((key, index) => {
    /*
     * Shared views carry a label describing what they actually select —
     * "Outstanding" invoices rather than "Active" ones. Bespoke keys such as
     * the lead pipeline stages have no rule and keep their titled key.
     */
    const label = runtimeViewLabel(module, key) ?? title(key);
    return {
      key,
      label,
      description: `${label} ${plural}.`,
      kind: "system" as const,
      isSystemDefault: index === 0,
      roles: ALL_PLATFORM_ROLES,
    };
  });
}
function col(
  fieldName: string,
  label: string,
  width = 160,
  format: RuntimeColumnDefinition["format"] = "text",
  /**
   * Makes the cell open the record it names. `fieldName` holds the label, so
   * the id has to be given separately — a column showing a customer's name has
   * no way to address that customer otherwise.
   */
  link?: RuntimeColumnDefinition["link"],
) {
  return {
    key: fieldName,
    field: fieldName,
    label,
    width,
    minWidth: Math.min(width, 120),
    maxWidth: Math.max(width, 240),
    format,
    sortable: true,
    filterable: true,
    visible: true,
    ...(link ? { link } : {}),
  } as const;
}
/**
 * Country, as a lookup over the one list that is real.
 *
 * There were three answers to "which countries exist": `PLATFORM_COUNTRIES` in
 * this app, `COUNTRY_OPTIONS` in the landing site, and the `Country` table the
 * API actually stores against — 250 rows, refreshed from an ISO source. The
 * admin forms rendered it as a free-text input, so an operator could type
 * "UAE", "U.A.E." and "United Arab Emirates" into three customer records and
 * no report could tell they were the same place.
 *
 * `/public/geography/countries` rather than `/lookups/countries`: the latter is
 * behind the tenant permission matrix, and a reference list of countries is not
 * a tenant-scoped decision. One endpoint serves admin and the public subscribe
 * wizard, which is what stops the fourth copy from appearing.
 */
function countryField(
  section: string,
  required = false,
  label = "Country",
): RuntimeFieldDefinition {
  return {
    ...field("country", label, "lookup", section, required),
    lookupPath: COUNTRY_LOOKUP_PATH,
    /*
     * The column holds a country name, not a country id — see BUG-1578, where
     * an id reached a legal agreement as the counterparty's registered address.
     * Public signup has always written the name here; this makes the admin form
     * agree with it.
     */
    submitsLabel: true,
  };
}

function field(
  key: string,
  label: string,
  type: RuntimeFieldDefinition["type"],
  section: string,
  required = false,
  options?: string[],
): RuntimeFieldDefinition {
  return {
    key,
    label,
    type,
    section,
    required,
    options: options?.map((value) => ({ value, label: title(value) })),
    columnSpan:
      type === "longText" || type === "richText" || type === "documentEditor"
        ? 2
        : 1,
  };
}
function form(key: string, fields: RuntimeFieldDefinition[]) {
  const sections = [...new Set(fields.map((item) => item.section))].map(
    (section) => ({ key: section, label: title(section), columns: 2 as const }),
  );
  return [
    { key: "create" as const, sections, fields },
    { key: "detail" as const, sections, fields },
    { key: "edit" as const, sections, fields },
  ];
}

function lifecycleForms(
  _key: string,
  fields: RuntimeFieldDefinition[],
  labels: string[],
  sectionTabs: Record<string, string>,
) {
  /*
   * "Access & Security" and "Access and Security" have to produce the same tab
   * key, because the key is what section placement is written against. Slugging
   * the label rather than doing two targeted replacements means the displayed
   * wording can change without silently orphaning every section on that tab.
   */
  const tabs = labels.map((label) => ({
    key: label
      .toLowerCase()
      .replace(/\s*&\s*|\s+and\s+/g, "-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    label,
  }));
  const defaultTab = tabs[0]?.key ?? "summary";
  const sections = [...new Set(fields.map((item) => item.section))].map(
    (section) => ({
      key: section,
      label: title(section),
      columns: 2 as const,
      tab: sectionTabs[section] ?? defaultTab,
    }),
  );
  const tabbedFields = fields.map((item) => ({
    ...item,
    tab: sectionTabs[item.section] ?? defaultTab,
    hideOnCreate: item.hideOnCreate ?? item.readOnly ?? false,
  }));
  return (["create", "detail", "edit"] as const).map((key) => ({
    key,
    tabs,
    sections,
    fields: tabbedFields,
  }));
}

function contractForms(fields: RuntimeFieldDefinition[]) {
  const tabs = [
    { key: "overview", label: "Summary" },
    { key: "document", label: "Document" },
    { key: "parties", label: "Parties and Signers" },
    { key: "fields", label: "Fields" },
    { key: "signatures", label: "Signatures" },
    { key: "related", label: "Related Records" },
    { key: "versions", label: "Versions" },
    { key: "timeline", label: "Timeline" },
    { key: "system", label: "System" },
  ];
  const sectionTabs: Record<string, string> = {
    identity: "overview",
    counterparty: "parties",
    ownership: "parties",
    commercial: "overview",
    legal: "overview",
    document: "document",
    system: "system",
  };
  const sections = [...new Set(fields.map((item) => item.section))].map(
    (section) => ({
      key: section,
      label: title(section),
      columns: 2 as const,
      tab: sectionTabs[section] ?? "overview",
    }),
  );
  const tabbedFields = fields.map((field) => ({
    ...field,
    tab: field.tab ?? sectionTabs[field.section] ?? "overview",
  }));
  return [
    { key: "create" as const, tabs, sections, fields: tabbedFields },
    { key: "detail" as const, tabs, sections, fields: tabbedFields },
    { key: "edit" as const, tabs, sections, fields: tabbedFields },
  ];
}

function partnerForms(fields: RuntimeFieldDefinition[]) {
  const tabs = [
    { key: "summary", label: "Summary" },
    { key: "application", label: "Application" },
    { key: "contacts", label: "Contacts and Users" },
    { key: "agreements", label: "Agreements" },
    { key: "referral-links", label: "Referral Links" },
    { key: "referred-leads", label: "Referred Leads" },
    { key: "customers", label: "Customers" },
    { key: "tenants", label: "Tenants" },
    { key: "documents", label: "Documents" },
    { key: "timeline", label: "Timeline" },
    { key: "system", label: "System" },
  ];
  const sectionTabs: Record<string, string> = {
    identity: "summary",
    contact: "contacts",
    commercial: "summary",
    notes: "application",
    application: "application",
    system: "system",
  };
  const sections = [...new Set(fields.map((item) => item.section))].map(
    (section) => ({
      key: section,
      label: title(section),
      columns: 2 as const,
      tab: sectionTabs[section] ?? "summary",
    }),
  );
  const tabbedFields = fields.map((item) => ({
    ...item,
    tab: sectionTabs[item.section] ?? "summary",
  }));
  return (["create", "detail", "edit"] as const).map((key) => ({
    key,
    tabs,
    sections,
    fields: tabbedFields,
  }));
}

/**
 * The plan record form.
 *
 * Two rules shape this. First, **every field the form leaves writable must be
 * one `UpdatePlanDto` accepts** — the API validates with
 * `forbidNonWhitelisted`, so a single extra key fails the whole save with a
 * 400. The runtime completes a form from the Prisma schema, and the schema
 * says `isPublic`, `publicationStatus`, `salesModel` and the publication
 * timestamps are editable columns; the API does not take any of them. Every
 * plan save from this screen returned 400 until each was declared read-only
 * here.
 *
 * Second, publication is **shown but not changed here**. Making a plan buyable
 * is a commercial act that ITEM-0022 exists to give governed, audited actions;
 * a checkbox on an edit form is not that, so this form reports the state and
 * says where it is decided.
 */
function planForms() {
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "pricing", label: "Pricing" },
    { key: "entitlements", label: "Entitlements" },
    { key: "commercial", label: "Publication" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "customers", label: "Customers" },
    { key: "stripe", label: "Stripe" },
    { key: "system", label: "System" },
  ];
  const readOnly = (
    item: RuntimeFieldDefinition,
    description?: string,
  ): RuntimeFieldDefinition => ({ ...item, readOnly: true, description });
  const fields: RuntimeFieldDefinition[] = [
    {
      ...field("name", "Plan name", "text", "identity", true),
      tab: "overview",
    },
    {
      ...field("key", "Plan key", "text", "identity", true),
      tab: "overview",
      description:
        "Stable identifier used by checkout, provisioning and the public catalogue.",
    },
    {
      ...field("description", "Description", "longText", "identity"),
      tab: "overview",
      description: "Shown to customers wherever the plan is offered.",
    },
    {
      ...field("isActive", "Active", "boolean", "availability"),
      tab: "overview",
      description:
        "Whether the plan is still sold. Publication, not this flag, decides whether it reaches the public catalogue.",
    },
    {
      ...field("sortOrder", "Display order", "integer", "availability"),
      tab: "overview",
      description: "Lower numbers appear first in the plan catalogue.",
    },
    {
      ...readOnly(
        field(
          "publicationStatus",
          "Publication status",
          "option",
          "publication",
        ),
        "Set through the governed publish and archive actions tracked as ITEM-0022, not from this form.",
      ),
      tab: "commercial",
    },
    {
      ...readOnly(
        field("salesModel", "Sales model", "option", "publication"),
        "How the plan is bought: self-service checkout, sales-assisted, or custom quote only.",
      ),
      tab: "commercial",
    },
    {
      ...readOnly(
        field("isPublic", "Public", "boolean", "publication"),
        "Gates self-service checkout alongside publication. The runtime API does not currently accept a change to it.",
      ),
      tab: "commercial",
    },
    {
      ...readOnly(
        field("publishedAt", "Published", "dateTime", "publication"),
        "When this plan first became buyable. Stamped by the publish transition.",
      ),
      tab: "commercial",
    },
    {
      ...readOnly(
        field("archivedAt", "Archived", "dateTime", "publication"),
        "When the plan was withdrawn from sale. Existing subscriptions keep the terms they bought.",
      ),
      tab: "commercial",
    },
    {
      ...readOnly(
        field("publishedById", "Published by", "text", "publication"),
        "The platform user who published it.",
      ),
      renderAs: "identifier",
      tab: "commercial",
    },
    /*
     * The legacy pricing fields are gone from this form.
     *
     * `currency`, `monthlyBasePrice` and `annualBasePrice` are the pre-PlanPrice
     * shape, kept visible "for compatibility" — and their own description said
     * what a customer is actually charged comes from the checkout prices below.
     * A form that offers editable money fields which bill nobody is an invitation
     * to set a price that does nothing, which is BUG-0027 read forwards.
     *
     * The columns stay on the model: existing rows carry values, and dropping
     * them is a destructive migration with its own backfill question. What is
     * removed is the pretence that they are something an operator should set.
     */
    {
      ...readOnly(
        field("stripeProductId", "Stripe product ID", "text", "stripe"),
        "Created by Stripe synchronisation. Per-price Stripe state is on each checkout price.",
      ),
      renderAs: "identifier",
      tab: "stripe",
    },
    {
      ...readOnly(field("id", "Plan ID", "text", "system")),
      renderAs: "identifier",
      tab: "system",
    },
    {
      ...readOnly(field("tenantId", "Owning tenant", "text", "system")),
      renderAs: "identifier",
      hideWhenEmpty: true,
      tab: "system",
    },
    {
      ...readOnly(field("createdAt", "Created", "dateTime", "system")),
      tab: "system",
    },
    {
      ...readOnly(field("createdById", "Created by", "text", "system")),
      renderAs: "identifier",
      tab: "system",
    },
    {
      ...readOnly(field("updatedAt", "Last updated", "dateTime", "system")),
      tab: "system",
    },
    {
      ...readOnly(field("updatedById", "Updated by", "text", "system")),
      renderAs: "identifier",
      tab: "system",
    },
  ];
  const sections = [
    {
      key: "identity",
      label: "Plan",
      columns: 2 as const,
      tab: "overview",
    },
    {
      key: "availability",
      label: "Availability",
      description:
        "Whether the plan is still sold, and where it sits in the catalogue.",
      columns: 2 as const,
      tab: "overview",
    },
    {
      key: "publication",
      label: "Publication and sales model",
      description:
        "The state that governs whether customers can see and buy this plan. Read-only here by design.",
      columns: 3 as const,
      tab: "commercial",
    },
    {
      key: "stripe",
      label: "Stripe product",
      columns: 2 as const,
      tab: "stripe",
    },
    {
      key: "system",
      label: "System",
      columns: 3 as const,
      tab: "system",
    },
  ];
  return (["create", "detail", "edit"] as const).map((key) => ({
    key,
    tabs,
    sections,
    fields,
  }));
}

function status(value: string): RuntimeStatusDefinition {
  return {
    value,
    label: title(value),
    tone:
      value.includes("ACTIVE") ||
      value.includes("SIGNED") ||
      value === "RESOLVED" ||
      value === "CLOSED"
        ? "success"
        : value.includes("REJECT") ||
            value.includes("TERMINATED") ||
            value.includes("CANCEL")
          ? "danger"
          : value.includes("WAIT") ||
              value.includes("REVIEW") ||
              value.includes("PROGRESS")
            ? "warning"
            : "neutral",
  };
}
function title(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
