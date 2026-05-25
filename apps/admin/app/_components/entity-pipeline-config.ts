import type { LifecycleStatusOption } from "@/app/_components/platform-lifecycle-types";

export type PipelineEntity = "lead" | "customer" | "onboarding" | "tenant";

export type PipelineFieldRequirement = {
  key: string;
  label: string;
  required: boolean;
  tab?: string;
  section?: string;
};

export type PipelineStage = {
  key: string;
  label: string;
  statusValue: string;
  subStatusValue?: string;
  requiredFields: PipelineFieldRequirement[];
  optionalFields?: PipelineFieldRequirement[];
};

export type EntityPipelineConfig = {
  entity: PipelineEntity;
  stages: PipelineStage[];
};

export const entityPipelineConfigs = {
  lead: {
    entity: "lead",
    stages: [
      {
        key: "new",
        label: "New",
        statusValue: "NEW",
        subStatusValue: "Awaiting response",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "workEmail", label: "Work email", required: true, tab: "overview" },
        ],
        optionalFields: [
          { key: "contactFirstName", label: "First name", required: false, tab: "overview" },
          { key: "contactLastName", label: "Last name", required: false, tab: "overview" },
          { key: "source", label: "Source", required: false, tab: "overview" },
          { key: "industry", label: "Industry", required: false, tab: "overview" },
          { key: "companySize", label: "Company size", required: false, tab: "overview" },
        ],
      },
      {
        key: "contacted",
        label: "Contacted",
        statusValue: "CONTACTED",
        subStatusValue: "Discovery done",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "workEmail", label: "Work email", required: true, tab: "overview" },
          { key: "source", label: "Source", required: true, tab: "overview" },
        ],
        optionalFields: [
          { key: "phoneNumber", label: "Phone", required: false, tab: "overview" },
          { key: "requirementsSummary", label: "Requirements summary", required: false, tab: "overview" },
        ],
      },
      {
        key: "qualified",
        label: "Qualified",
        statusValue: "QUALIFIED",
        subStatusValue: "Commercial review",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "workEmail", label: "Work email", required: true, tab: "overview" },
          { key: "interestedPlan", label: "Interested plan", required: true, tab: "overview" },
        ],
        optionalFields: [
          { key: "requirementsSummary", label: "Requirements summary", required: false, tab: "overview" },
          { key: "notes", label: "Internal notes", required: false, tab: "overview" },
        ],
      },
      {
        key: "converted",
        label: "Converted",
        statusValue: "CONVERTED",
        subStatusValue: "Converted to customer",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "contactFirstName", label: "First name", required: true, tab: "overview" },
          { key: "contactLastName", label: "Last name", required: true, tab: "overview" },
          { key: "workEmail", label: "Work email", required: true, tab: "overview" },
          { key: "industry", label: "Industry", required: true, tab: "overview" },
          { key: "companySize", label: "Company size", required: true, tab: "overview" },
        ],
        optionalFields: [
          { key: "notes", label: "Internal notes", required: false, tab: "overview" },
        ],
      },
      {
        key: "archived",
        label: "Archived",
        statusValue: "ARCHIVED",
        subStatusValue: "Archived",
        requiredFields: [],
        optionalFields: [
          { key: "notes", label: "Internal notes", required: false, tab: "overview" },
        ],
      },
    ],
  },
  customer: {
    entity: "customer",
    stages: [
      {
        key: "prospect",
        label: "Prospect",
        statusValue: "PROSPECT",
        subStatusValue: "Commercial review",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "primaryContactEmail", label: "Primary email", required: true, tab: "overview" },
        ],
        optionalFields: [
          { key: "industry", label: "Industry", required: false, tab: "overview" },
          { key: "companySize", label: "Company size", required: false, tab: "overview" },
        ],
      },
      {
        key: "onboarding",
        label: "Onboarding",
        statusValue: "ONBOARDING",
        subStatusValue: "Ready for onboarding",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "primaryContactFirstName", label: "Primary first name", required: true, tab: "overview" },
          { key: "primaryContactLastName", label: "Primary last name", required: true, tab: "overview" },
          { key: "primaryContactEmail", label: "Primary email", required: true, tab: "overview" },
          { key: "selectedPlanId", label: "Selected plan", required: true, tab: "overview" },
          { key: "preferredBillingCycle", label: "Billing cycle", required: true, tab: "overview" },
        ],
      },
      {
        key: "active",
        label: "Active",
        statusValue: "ACTIVE",
        subStatusValue: "Live",
        requiredFields: [
          { key: "companyName", label: "Company", required: true, tab: "overview" },
          { key: "primaryContactEmail", label: "Primary email", required: true, tab: "overview" },
          { key: "selectedPlanId", label: "Selected plan", required: true, tab: "overview" },
        ],
      },
      {
        key: "suspended",
        label: "Suspended",
        statusValue: "SUSPENDED",
        subStatusValue: "Ops hold",
        requiredFields: [],
      },
      {
        key: "archived",
        label: "Archived",
        statusValue: "ARCHIVED",
        subStatusValue: "Archived",
        requiredFields: [],
      },
    ],
  },
  onboarding: {
    entity: "onboarding",
    stages: [
      {
        key: "not-started",
        label: "Not started",
        statusValue: "NOT_STARTED",
        subStatusValue: "Awaiting kickoff",
        requiredFields: [
          { key: "primaryOwnerFirstName", label: "Owner first name", required: true, tab: "overview" },
          { key: "primaryOwnerLastName", label: "Owner last name", required: true, tab: "overview" },
          { key: "primaryOwnerWorkEmail", label: "Owner email", required: true, tab: "overview" },
        ],
      },
      {
        key: "in-progress",
        label: "In progress",
        statusValue: "IN_PROGRESS",
        subStatusValue: "Configuration in progress",
        requiredFields: [
          { key: "selectedPlanId", label: "Plan", required: true, tab: "overview" },
          { key: "billingCycle", label: "Billing cycle", required: true, tab: "overview" },
          { key: "tenantSlug", label: "Tenant slug", required: true, tab: "tenant" },
        ],
        optionalFields: [
          { key: "notes", label: "Notes", required: false, tab: "activity" },
        ],
      },
      {
        key: "ready",
        label: "Ready",
        statusValue: "READY_FOR_TENANT_CREATION",
        subStatusValue: "Go-live ready",
        requiredFields: [
          { key: "contractSigned", label: "Contract signed", required: true, tab: "provisioning" },
          { key: "paymentConfirmed", label: "Payment confirmed", required: true, tab: "provisioning" },
          { key: "configurationReady", label: "Configuration ready", required: true, tab: "provisioning" },
          { key: "trainingPlanned", label: "Training planned", required: true, tab: "provisioning" },
          { key: "tenantSlug", label: "Tenant slug", required: true, tab: "tenant" },
        ],
      },
      {
        key: "completed",
        label: "Completed",
        statusValue: "COMPLETED",
        subStatusValue: "Tenant created",
        requiredFields: [
          { key: "tenantSlug", label: "Tenant slug", required: true, tab: "tenant" },
        ],
      },
      {
        key: "blocked",
        label: "Blocked",
        statusValue: "BLOCKED",
        subStatusValue: "Blocked internally",
        requiredFields: [],
        optionalFields: [
          { key: "notes", label: "Notes", required: false, tab: "activity" },
        ],
      },
    ],
  },
  tenant: {
    entity: "tenant",
    stages: [
      {
        key: "pending-setup",
        label: "Pending setup",
        statusValue: "PENDING_SETUP",
        requiredFields: [
          { key: "name", label: "Tenant name", required: true },
          { key: "slug", label: "Tenant slug", required: true },
        ],
        optionalFields: [
          { key: "customerAccount", label: "Customer account", required: false },
          { key: "owner", label: "Tenant owner", required: false },
        ],
      },
      {
        key: "onboarding",
        label: "Onboarding",
        statusValue: "ONBOARDING",
        requiredFields: [
          { key: "name", label: "Tenant name", required: true },
          { key: "slug", label: "Tenant slug", required: true },
          { key: "customerAccount", label: "Customer account", required: true },
          { key: "owner", label: "Tenant owner", required: true },
        ],
        optionalFields: [
          { key: "subscription", label: "Subscription", required: false },
        ],
      },
      {
        key: "active",
        label: "Active",
        statusValue: "ACTIVE",
        requiredFields: [
          { key: "name", label: "Tenant name", required: true },
          { key: "slug", label: "Tenant slug", required: true },
          { key: "owner", label: "Tenant owner", required: true },
          { key: "subscription", label: "Subscription", required: true },
        ],
      },
      {
        key: "suspended",
        label: "Suspended",
        statusValue: "SUSPENDED",
        requiredFields: [],
      },
      {
        key: "inactive",
        label: "Inactive",
        statusValue: "INACTIVE",
        requiredFields: [],
      },
      {
        key: "archived",
        label: "Archived",
        statusValue: "ARCHIVED",
        requiredFields: [],
      },
      {
        key: "churned",
        label: "Churned",
        statusValue: "CHURNED",
        requiredFields: [],
      },
    ],
  },
} satisfies Record<PipelineEntity, EntityPipelineConfig>;

export type PipelineFormState = Record<string, unknown>;

export function isPipelineFieldComplete(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export function getMissingPipelineFields(
  stage: PipelineStage,
  form: PipelineFormState,
) {
  return stage.requiredFields.filter(
    (field) => !isPipelineFieldComplete(form[field.key]),
  );
}

export function buildPipelineStagesFromLifecycle(
  entity: Exclude<PipelineEntity, "tenant">,
  statuses: LifecycleStatusOption[],
) {
  const defaults = entityPipelineConfigs[entity].stages;

  return statuses
    .filter((status) => status.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((status) => {
      const defaultStage = defaults.find(
        (stage) => stage.statusValue === status.value,
      );
      const criteria = status.criteria
        .filter((criterion) => criterion.isActive && criterion.fieldKey)
        .sort((first, second) => first.sortOrder - second.sortOrder);

      return {
        key: status.value.toLowerCase().replaceAll("_", "-"),
        label: status.label,
        statusValue: status.value,
        subStatusValue: defaultStage?.subStatusValue,
        requiredFields: criteria
          .filter((criterion) => criterion.severity === "required")
          .map((criterion) => ({
            key: criterion.fieldKey!,
            label: criterion.label,
            required: true,
            tab: defaultStage?.requiredFields.find(
              (field) => field.key === criterion.fieldKey,
            )?.tab,
          })),
        optionalFields: criteria
          .filter((criterion) => criterion.severity === "recommended")
          .map((criterion) => ({
            key: criterion.fieldKey!,
            label: criterion.label,
            required: false,
            tab: defaultStage?.optionalFields?.find(
              (field) => field.key === criterion.fieldKey,
            )?.tab,
          })),
      } satisfies PipelineStage;
    });
}
