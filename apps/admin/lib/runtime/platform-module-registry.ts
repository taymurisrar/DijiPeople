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
  getRuntimeSchema,
  listRuntimeViewKeys,
  runtimeViewLabel,
  validateRuntimeDefinition,
} from "@repo/config";

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

const STANDARD_LIST_ACTIONS: RuntimeActionDefinition[] = [
  {
    key: "new",
    label: "New",
    placement: "primary",
    scope: "list",
    selection: "none",
  },
  {
    key: "refresh",
    label: "Refresh",
    placement: "secondary",
    scope: "list",
    selection: "none",
  },
  {
    key: "export",
    label: "Export",
    placement: "overflow",
    scope: "list",
    selection: "none",
  },
  {
    key: "bulk-assign",
    label: "Assign",
    placement: "secondary",
    scope: "list",
    selection: "any",
  },
  {
    key: "bulk-delete",
    label: "Delete",
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
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "edit",
    label: "Edit",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "save",
    label: "Save",
    placement: "primary",
    scope: "record",
    selection: "none",
  },
  {
    key: "save-close",
    label: "Save and close",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "delete",
    label: "Delete",
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
      "new",
      "contacted",
      "qualified",
      "unqualified",
      "converted",
      "closed-lost",
      "direct-leads",
      "partner-referred-leads",
      "my-assigned-leads",
      "unassigned-leads",
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
    forms: lifecycleForms("lead", [
      field("contactFirstName", "First name", "text", "contact", true),
      field("contactLastName", "Last name", "text", "contact", true),
      field("companyName", "Company", "text", "company", true),
      field("workEmail", "Work email", "email", "contact", true),
      field("industry", "Industry", "text", "company", true),
      field("companySize", "Company size", "text", "company", true),
      field("source", "Source", "text", "qualification", true),
      field("partnerId", "Referral partner", "lookup", "qualification"),
      field(
        "status",
        "Status",
        "option",
        "qualification",
        true,
        LEAD_STATUSES.map((item) => item.value),
      ),
      field("notes", "Notes", "longText", "notes"),
    ], [
      "Summary",
      "Qualification",
      "Contact and Company",
      "Attribution",
      "Activities",
      "Agreements",
      "Conversion",
      "Documents",
      "Timeline",
    ], {
      contact: "contact-and-company",
      company: "contact-and-company",
      qualification: "qualification",
      notes: "activities",
    }),
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
        { key: "CONVERTED", label: "Conversion" },
      ],
      terminalOutcomes: [
        { key: "UNQUALIFIED", label: "Unqualified", tone: "danger" },
        { key: "CLOSED_LOST", label: "Closed Lost", tone: "danger" },
        { key: "ARCHIVED", label: "Cancelled / Archived", tone: "neutral" },
      ],
    },
    relatedRecords: [
      {
        key: "agreements",
        label: "Lead agreements",
        module: "contracts",
        foreignKey: "leadId",
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
        states: ["INQUIRY", "NEW_INQUIRY", "UNDER_REVIEW", "APPROVED_AWAITING_AGREEMENT"],
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
        foreignKey: "partnerId",
      },
      {
        key: "inquiries",
        label: "Application submissions",
        foreignKey: "partnerId",
      },
      {
        key: "portalUsers",
        label: "Contacts and users",
        foreignKey: "partnerId",
      },
      {
        key: "attributedCustomers",
        label: "Converted customers",
        module: "customers",
        foreignKey: "originatingPartnerId",
      },
      {
        key: "attributedTenants",
        label: "Attributed tenants",
        module: "tenants",
        foreignKey: "originatingPartnerId",
      },
      {
        key: "commissions",
        label: "Commissions",
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
    forms: lifecycleForms("customer", [
      field("companyName", "Company name", "text", "company", true),
      field("legalCompanyName", "Legal company name", "text", "company"),
      field("industry", "Industry", "text", "company"),
      field("companySize", "Company size", "text", "company"),
      field("website", "Website", "url", "company"),
      field(
        "estimatedEmployeeCount",
        "Estimated employees",
        "integer",
        "company",
      ),
      field(
        "primaryContactFirstName",
        "Primary contact first name",
        "text",
        "contact",
        true,
      ),
      field(
        "primaryContactLastName",
        "Primary contact last name",
        "text",
        "contact",
        true,
      ),
      field(
        "primaryContactEmail",
        "Primary contact email",
        "email",
        "contact",
        true,
      ),
      field("primaryContactPhone", "Primary contact phone", "phone", "contact"),
      field("billingContactEmail", "Billing contact email", "email", "contact"),
      field("country", "Country", "text", "address", true),
      field("stateProvince", "State or province", "text", "address"),
      field("city", "City", "text", "address"),
      field("addressLine1", "Address line 1", "text", "address"),
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
        ["MONTHLY", "QUARTERLY", "ANNUAL"],
      ),
      {
        ...field(
          "assignedToUserId",
          "Assigned owner",
          "userLookup",
          "ownership",
        ),
        lookupPath: "/platform-users/owner-candidates",
      },
      field("status", "Status", "option", "ownership", false, [
        "LEAD",
        "PROSPECT",
        "ONBOARDING",
        "ACTIVE",
        "SUSPENDED",
        "CHURNED",
        "ARCHIVED",
      ]),
      field("subStatus", "Sub-status", "text", "ownership"),
    ], [
      "Summary",
      "Company and Contacts",
      "Agreements",
      "Onboarding",
      "Tenants",
      "Subscriptions",
      "Invoices",
      "Support",
      "Documents",
      "Timeline",
    ], {
      company: "company-and-contacts",
      contact: "company-and-contacts",
      address: "company-and-contacts",
      commercial: "summary",
      ownership: "summary",
    }),
    actions: [...STANDARD_LIST_ACTIONS, ...STANDARD_RECORD_ACTIONS],
    relatedRecords: [
      {
        key: "contracts",
        label: "Customer agreements",
        module: "contracts",
        foreignKey: "customerAccountId",
      },
      {
        key: "supportCases",
        label: "Support cases",
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
    actions: [
      ...CREATE_LIST_ACTIONS,
      STANDARD_LIST_ACTIONS[4]!,
      ...EDIT_RECORD_ACTIONS,
      STANDARD_RECORD_ACTIONS[4]!,
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
        col("name", "Tenant", 220),
        col("customerAccount.companyName", "Customer", 210, "lookup"),
        col("status", "Status", 130, "status"),
        col("subscription.status", "Subscription", 150, "status"),
        col("subscription.plan.name", "Plan", 150, "lookup"),
        col("createdAt", "Created", 160, "dateTime"),
      ],
    ),
    forms: lifecycleForms("tenants", [
      field("name", "Tenant name", "text", "profile", true),
      field("legalName", "Legal name", "text", "profile"),
      field("status", "Lifecycle status", "option", "profile", true, [
        "PROVISIONING",
        "ACTIVE",
        "INACTIVE",
        "SUSPENDED",
        "ARCHIVED",
        "CHURNED",
      ]),
      {
        ...field("tenantCode", "Tenant code", "text", "identity"),
        readOnly: true,
      },
      {
        ...field("slug", "Workspace slug", "text", "identity"),
        readOnly: true,
      },
      { ...field("createdAt", "Created", "dateTime", "dates"), readOnly: true },
      { ...field("updatedAt", "Updated", "dateTime", "dates"), readOnly: true },
    ], [
      "Summary",
      "Organization",
      "Provisioning",
      "Branding",
      "Domains",
      "Features",
      "Users",
      "Security and SSO",
      "Subscription",
      "Billing",
      "Integrations",
      "Agreements",
      "Support",
      "Documents",
      "Timeline",
    ], {
      profile: "organization",
      identity: "organization",
      dates: "summary",
    }),
    actions: [
      STANDARD_LIST_ACTIONS[1]!,
      STANDARD_LIST_ACTIONS[2]!,
      ...EDIT_RECORD_ACTIONS,
      {
        key: "tenant-operations",
        label: "Tenant operations",
        placement: "primary",
        scope: "record",
        selection: "none",
      },
    ],
    relatedRecords: [
      {
        key: "contracts",
        label: "Contracts",
        module: "contracts",
        foreignKey: "tenantId",
      },
      {
        key: "supportCases",
        label: "Support cases",
        module: "support-cases",
        foreignKey: "tenantId",
      },
      {
        key: "invoices",
        label: "Invoices",
        module: "invoices",
        foreignKey: "tenantId",
      },
    ],
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
      field("agreementCategory", "Agreement category", "text", "identity"),
      field(
        "counterpartyType",
        "Counterparty type",
        "option",
        "identity",
        false,
        ["PARTNER", "CUSTOMER", "TENANT", "OTHER"],
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
        visibleWhen: { field: "contractType", equals: "PARTNER_AGREEMENT" },
      },
      {
        ...field("customerAccountId", "Customer", "lookup", "counterparty"),
        lookupPath: "/super-admin/customers",
        visibleWhen: { field: "contractType", equals: "CUSTOMER_AGREEMENT" },
      },
      {
        ...field(
          "customerOnboardingId",
          "Related onboarding",
          "lookup",
          "counterparty",
        ),
        lookupPath: "/super-admin/customer-onboarding?pageSize=100",
        visibleWhen: { field: "contractType", equals: "CUSTOMER_AGREEMENT" },
      },
      {
        ...field("tenantId", "Tenant", "lookup", "counterparty"),
        lookupPath: "/super-admin/tenants",
      },
      {
        ...field("relatedLeadId", "Related lead", "lookup", "counterparty"),
        lookupPath: "/super-admin/leads?pageSize=100",
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
      field("currencyCode", "Currency", "text", "commercial"),
      field("contractValue", "Contract value", "currency", "commercial"),
      field(
        "commissionPercentage",
        "Commission percentage",
        "percentage",
        "commercial",
      ),
      field("commissionBasis", "Commission basis", "text", "commercial"),
      field("paymentTerms", "Payment terms", "longText", "commercial"),
      field("effectiveDate", "Effective date", "date", "commercial"),
      field("expiryDate", "Expiry date", "date", "commercial"),
      field("autoRenewal", "Auto renewal", "boolean", "commercial"),
      field(
        "renewalNoticeDays",
        "Renewal notice days",
        "integer",
        "commercial",
      ),
      field(
        "terminationNoticeDays",
        "Termination notice days",
        "integer",
        "commercial",
      ),
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
      ...EDIT_RECORD_ACTIONS,
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
        states: ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED", "SIGNATURE_IN_PROGRESS", "PARTIALLY_SIGNED"],
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
        states: ["DRAFT", "INTERNAL_REVIEW", "APPROVED_FOR_SENDING", "SENT", "VIEWED", "SIGNATURE_IN_PROGRESS", "PARTIALLY_SIGNED"],
        destructive: true,
        confirmTitle: "Void this agreement?",
      },
    ],
    relatedRecords: [
      {
        key: "signatureRequests",
        label: "Signature requests",
        module: "signature-requests",
        foreignKey: "contractId",
      },
      {
        key: "documents",
        label: "Contract documents",
        foreignKey: "contractId",
      },
      {
        key: "approvalRequests",
        label: "Approval history",
        foreignKey: "contractId",
      },
      {
        key: "parties",
        label: "Parties and signers",
        foreignKey: "contractId",
      },
      {
        key: "fieldPlacements",
        label: "Placed fields",
        foreignKey: "contractId",
      },
      {
        key: "relatedRecords",
        label: "Related records",
        foreignKey: "contractId",
      },
      {
        key: "versions",
        label: "Versions",
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
      "/contract-templates",
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
      field("tenantId", "Tenant ID", "text", "subscription"),
      field("planId", "Plan ID", "text", "subscription"),
      field("status", "Status", "text", "subscription"),
      field("billingCycle", "Billing cycle", "text", "subscription"),
      field("currency", "Currency", "text", "commercial"),
      field("basePrice", "Base price", "currency", "commercial"),
      field("finalPrice", "Final price", "currency", "commercial"),
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
        col("isActive", "Active", 130, "status"),
        col("prices", "Prices", 100, "number"),
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
if (runtimeDefinitionErrors.length) {
  throw new Error(
    `Platform runtime metadata does not match the generated Prisma registry:\n- ${runtimeDefinitionErrors.join("\n- ")}`,
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
    description: `Manage ${pluralDisplayName.toLowerCase()} through the shared platform runtime.`,
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
  const tabs = labels.map((label) => ({
    key: label.toLowerCase().replaceAll(" and ", "-").replaceAll(" ", "-"),
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
  ];
  const sectionTabs: Record<string, string> = {
    identity: "overview",
    counterparty: "parties",
    ownership: "parties",
    commercial: "overview",
    legal: "overview",
    document: "document",
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
  ];
  const sectionTabs: Record<string, string> = {
    identity: "summary",
    contact: "contacts",
    commercial: "summary",
    notes: "application",
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
