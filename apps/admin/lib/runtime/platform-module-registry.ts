import type {
  PlatformModuleDefinition,
  PlatformModuleKey,
  RuntimeActionDefinition,
  RuntimeColumnDefinition,
  RuntimeFieldDefinition,
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

const STANDARD_LIST_ACTIONS: RuntimeActionDefinition[] = [
  {
    key: "new",
    label: "New",
    icon: "new",
    placement: "primary",
    scope: "list",
    selection: "none",
  },
  {
    key: "refresh",
    label: "Refresh",
    icon: "refresh",
    placement: "secondary",
    scope: "list",
    selection: "none",
  },
  {
    key: "export",
    label: "Export",
    icon: "export",
    placement: "overflow",
    scope: "list",
    selection: "none",
  },
  {
    key: "bulk-assign",
    label: "Assign",
    icon: "approve",
    placement: "secondary",
    scope: "list",
    selection: "any",
  },
  {
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
];
const STANDARD_RECORD_ACTIONS: RuntimeActionDefinition[] = [
  {
    key: "back",
    label: "Back",
    icon: "back",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "edit",
    label: "Edit",
    icon: "edit",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "save",
    label: "Save",
    icon: "save",
    placement: "primary",
    scope: "record",
    selection: "none",
  },
  {
    key: "save-close",
    label: "Save and close",
    icon: "save",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "delete",
    label: "Delete",
    icon: "delete",
    placement: "overflow",
    scope: "record",
    selection: "none",
    destructive: true,
    confirmTitle: "Delete this record?",
  },
];
const READ_ONLY_ACTIONS: RuntimeActionDefinition[] = [
  STANDARD_LIST_ACTIONS[1]!,
  STANDARD_LIST_ACTIONS[2]!,
  STANDARD_RECORD_ACTIONS[0]!,
];
const CREATE_LIST_ACTIONS: RuntimeActionDefinition[] = [
  STANDARD_LIST_ACTIONS[0]!,
  STANDARD_LIST_ACTIONS[1]!,
  STANDARD_LIST_ACTIONS[2]!,
];
const EDIT_RECORD_ACTIONS: RuntimeActionDefinition[] = [
  STANDARD_RECORD_ACTIONS[0]!,
  STANDARD_RECORD_ACTIONS[1]!,
  STANDARD_RECORD_ACTIONS[2]!,
  STANDARD_RECORD_ACTIONS[3]!,
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

const TENANT_STATUS_TONES: Record<
  string,
  RuntimeStatusDefinition["tone"]
> = {
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
  STANDARD_LIST_ACTIONS[1]!,
  STANDARD_LIST_ACTIONS[2]!,
  STANDARD_RECORD_ACTIONS[0]!,
  STANDARD_RECORD_ACTIONS[1]!,
  STANDARD_RECORD_ACTIONS[2]!,
  STANDARD_RECORD_ACTIONS[3]!,
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
  field("country", "Country", "text", "contact"),
  field(
    "defaultCommissionRate",
    "Default commission",
    "percentage",
    "commercial",
    true,
  ),
  field("currencyCode", "Currency", "currency", "commercial", true),
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
        field("country", "Country", "text", "company"),
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
        field(
          "legalCompanyName",
          "Legal company name",
          "text",
          "legal-entity",
        ),
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
      { ...STANDARD_LIST_ACTIONS[0]!, label: "New Lead" },
      STANDARD_LIST_ACTIONS[1]!,
      STANDARD_LIST_ACTIONS[2]!,
      STANDARD_LIST_ACTIONS[3]!,
      {
        key: "bulk-change-status",
        label: "Change Status",
        placement: "secondary",
        scope: "list",
        selection: "any",
      },
      STANDARD_LIST_ACTIONS[4]!,
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
      STANDARD_LIST_ACTIONS[3]!,
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
        field(
          "registrationNumber",
          "Registration number",
          "text",
          "identity",
        ),
        field("taxId", "Tax ID", "text", "identity"),
        field(
          "billingContactEmail",
          "Billing contact email",
          "email",
          "contacts",
        ),
        field("financeContactName", "Finance contact", "text", "contacts"),
        field("financeContactEmail", "Finance email", "email", "contacts"),
        field("country", "Country", "text", "address", true),
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
      { ...STANDARD_LIST_ACTIONS[0]!, label: "New Customer" },
      ...STANDARD_LIST_ACTIONS.slice(1),
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
        col("email", "Business email", 220),
        col("type", "Partner type", 140),
        col("status", "Status", 150, "status"),
        col("createdAt", "Received", 170, "dateTime"),
      ],
    ),
    actions: READ_ONLY_ACTIONS,
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
    actions: READ_ONLY_ACTIONS,
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
      STANDARD_LIST_ACTIONS[3]!,
      STANDARD_LIST_ACTIONS[4]!,
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
      [
        col("displayName", "Tenant", 220),
        /*
         * Every lookup on this module opens the record it names. These two read
         * as a customer and a plan and used to be plain text, so the only way to
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
        col("createdAt", "Created", 160, "dateTime"),
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
          ...field("ownerUserId", "Primary Tenant Owner", "text", "identifiers"),
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
      STANDARD_RECORD_ACTIONS[0]!,
      {
        ...STANDARD_RECORD_ACTIONS[1]!,
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
      STANDARD_RECORD_ACTIONS[2]!,
      STANDARD_RECORD_ACTIONS[3]!,
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
          { key: "record", field: "displayName", label: "Record", minWidth: 220 },
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
      STANDARD_RECORD_ACTIONS[0]!,
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
      STANDARD_LIST_ACTIONS[3]!,
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
    relatedRecords: [
      {
        key: "subscriptions",
        label: "Subscriptions",
        module: "subscriptions",
        foreignKey: "planId",
      },
      {
        key: "selectedByCustomers",
        label: "Customers",
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
      field("currencyCode", "Currency", "text", "commercial"),
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

const runtimeDefinitionErrors = definitions.flatMap((definition) =>
  validateRuntimeDefinition(definition),
);
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
    ...input,
  } as PlatformModuleDefinition;
  definition.actions = definition.actions.map((action) => ({
    ...action,
    permission:
      action.permission ?? actionPermission(action.key, definition.permissions),
  }));
  definition.forms = completeFormsFromSchema(definition);
  return definition;
}

function completeFormsFromSchema(definition: PlatformModuleDefinition) {
  const schema = getRuntimeSchema(definition.key);
  if (!schema) return definition.forms;
  return definition.forms.map((formDefinition) => {
    const configured = new Set(formDefinition.fields.map((item) => item.key));
    const additional = Object.values(schema.fields)
      .filter(
        (item) =>
          item.readable &&
          !item.sensitive &&
          !item.list &&
          item.type !== "relation" &&
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
    if (additional.length)
      sections.push({
        key: "additional-details",
        label: "Additional details",
        columns: 3,
        tab: "details",
      });
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

function planForms() {
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "pricing", label: "Pricing" },
    { key: "features", label: "Features" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "stripe", label: "Stripe" },
    { key: "tenants", label: "Tenants" },
    { key: "audit", label: "Audit" },
  ];
  const fields = [
    { ...field("key", "Plan key", "text", "overview", true), tab: "overview" },
    {
      ...field("name", "Plan name", "text", "overview", true),
      tab: "overview",
    },
    {
      ...field("description", "Description", "longText", "overview"),
      tab: "overview",
    },
    { ...field("isActive", "Active", "boolean", "overview"), tab: "overview" },
    { ...field("isPublic", "Public", "boolean", "overview"), tab: "overview" },
    {
      ...field("currency", "Legacy currency", "text", "legacy-pricing"),
      tab: "pricing",
    },
    {
      ...field(
        "monthlyBasePrice",
        "Legacy flat monthly price",
        "currency",
        "legacy-pricing",
      ),
      tab: "pricing",
      description:
        "Compatibility only. New checkout prices are configured per seat below.",
    },
    {
      ...field(
        "annualBasePrice",
        "Legacy flat annual price",
        "currency",
        "legacy-pricing",
      ),
      tab: "pricing",
    },
    {
      ...field("stripeProductId", "Stripe product ID", "text", "stripe"),
      tab: "stripe",
      readOnly: true,
    },
  ];
  const sections = [
    {
      key: "overview",
      label: "Plan overview",
      columns: 2 as const,
      tab: "overview",
    },
    {
      key: "legacy-pricing",
      label: "Legacy pricing compatibility",
      columns: 3 as const,
      tab: "pricing",
    },
    {
      key: "stripe",
      label: "Stripe product",
      columns: 2 as const,
      tab: "stripe",
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
