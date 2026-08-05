"use client";

import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LeadCrmShell,
  LeadField,
  LeadFormShell,
  type LeadFormMode,
  LeadRecordHeader,
  LeadRibbon,
  LeadRibbonButton,
  OwnerStatusDropdown,
  LeadSelectField,
  LeadTextarea,
} from "@/app/_components/lead-crm-form";
import { CrmStatusPipeline } from "@/app/_components/crm-status-pipeline";
import { buildPipelineStagesFromLifecycle } from "@/app/_components/entity-pipeline-config";
import type {
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import type { AdminSessionUser } from "@/lib/auth";

type LeadFormState = {
  contactFirstName: string;
  contactLastName: string;
  companyName: string;
  workEmail: string;
  phoneNumber: string;
  industry: string;
  companySize: string;
  source: string;
  interestedPlan: string;
  assignedToUserId: string;
  partnerId: string;
  status: string;
  subStatus: string;
  notes: string;
  requirementsSummary: string;
};

type SelectOption = {
  value: string;
  label: string;
};

const FALLBACK_LEAD_STATUS = "NEW";
const FORM_ID = "lead-create-form";

function toSelectOptions(options?: SelectOption[]) {
  return Array.isArray(options) ? options : [];
}

function getLeadLifecycle(lifecycleOptions: LifecycleOptions) {
  const lead = lifecycleOptions.lead;

  const statuses =
    Array.isArray(lead?.statuses) && lead.statuses.length > 0
      ? lead.statuses
      : [
          {
            value: FALLBACK_LEAD_STATUS,
            label: "New",
            tone: "info" as const,
            sortOrder: 10,
            isActive: true,
            isSystem: true,
            isTerminal: false,
            allowedNextStatuses: [],
            criteria: [],
          },
        ];

  const sources = Array.isArray(lead?.sources) ? lead.sources : [];

  const subStatuses =
    lead?.subStatuses && typeof lead.subStatuses === "object"
      ? lead.subStatuses
      : {};

  return {
    statuses,
    sources,
    subStatuses,
  };
}

function getDefaultOwnerId(
  currentUser: AdminSessionUser,
  operators: OperatorOption[],
) {
  const matchingOperator = operators.find(
    (operator) =>
      operator.id === currentUser.userId ||
      operator.email.toLowerCase() === currentUser.email.toLowerCase(),
  );

  return matchingOperator?.id ?? "";
}

function buildInitialForm(
  lifecycleOptions: LifecycleOptions,
  operators: OperatorOption[],
  currentUser: AdminSessionUser,
  initialPartnerId = "",
): LeadFormState {
  const leadLifecycle = getLeadLifecycle(lifecycleOptions);
  const defaultStatus =
    leadLifecycle.statuses.find((status) => status.value === FALLBACK_LEAD_STATUS)
      ?.value ??
    leadLifecycle.statuses[0]?.value ??
    FALLBACK_LEAD_STATUS;

  return {
    contactFirstName: "",
    contactLastName: "",
    companyName: "",
    workEmail: "",
    phoneNumber: "",
    industry: lifecycleOptions.industries?.[0]?.value ?? "",
    companySize: lifecycleOptions.companySizes?.[0]?.value ?? "",
    source: leadLifecycle.sources[0]?.value ?? "",
    interestedPlan: "",
    assignedToUserId: getDefaultOwnerId(currentUser, operators),
    partnerId: initialPartnerId,
    status: defaultStatus,
    subStatus: leadLifecycle.subStatuses[defaultStatus]?.[0] ?? "",
    notes: "",
    requirementsSummary: "",
  };
}

export function LeadCreateManager({
  currentUser,
  lifecycleOptions,
  operators,
  plans,
  partners,
  initialPartnerId = "",
}: {
  currentUser: AdminSessionUser;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
  partners: Array<{ id: string; code: string; displayName: string }>;
  initialPartnerId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formMode: LeadFormMode = "CREATE";

  const leadLifecycle = useMemo(
    () => getLeadLifecycle(lifecycleOptions),
    [lifecycleOptions],
  );

  const initialForm = useMemo(
    () => buildInitialForm(lifecycleOptions, operators, currentUser, initialPartnerId),
    [currentUser, lifecycleOptions, operators, initialPartnerId],
  );

  const [form, setForm] = useState<LeadFormState>(initialForm);

  const ownerOptions = useMemo(() => {
    return [
      { value: "", label: "Unassigned" },
      ...operators.map((operator) => ({
        value: operator.id,
        label: operator.fullName,
      })),
    ];
  }, [operators]);

  function updateForm<K extends keyof LeadFormState>(
    key: K,
    value: LeadFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[String(key)];
      return next;
    });
    setMessage(null);
  }

  function updateStatus(value: string) {
    setForm((current) => ({
      ...current,
      status: value,
      subStatus: leadLifecycle.subStatuses[value]?.[0] ?? "",
    }));
    setMessage(null);
  }

  function focusField(key: string) {
    window.setTimeout(() => {
      const field = document.querySelector<HTMLElement>(`[data-field-key="${key}"]`);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus();
    }, 50);
  }

  function applyMissingFieldErrors(keys: string[]) {
    const nextErrors = keys.reduce<Record<string, string>>((errors, key) => {
      errors[key] = "Required for this stage.";
      return errors;
    }, {});
    setFieldErrors(nextErrors);
    if (keys[0]) focusField(keys[0]);
  }

  function handleCreate() {
    setMessage(null);
    setFieldErrors({});

    startTransition(async () => {
      const response = await fetch("/api/super-admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          interestedPlan: form.interestedPlan || undefined,
          assignedToUserId: form.assignedToUserId || undefined,
          partnerId: form.partnerId || undefined,
          subStatus: form.subStatus || undefined,
          notes: form.notes || undefined,
          requirementsSummary: form.requirementsSummary || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create lead.");
        return;
      }

      router.push(`/leads/${payload.id}`);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleCreate();
  }

  function handleReset() {
    setForm(buildInitialForm(lifecycleOptions, operators, currentUser, initialPartnerId));
    setFieldErrors({});
    setMessage(null);
  }

  return (
    <LeadCrmShell>
      <LeadRibbon
        left={
          <>
            <LeadRibbonButton
              icon={ArrowLeft}
              label="Back"
              onClick={() => router.push("/leads")}
            />
            <LeadRibbonButton
              disabled={isPending}
              form={FORM_ID}
              icon={Save}
              label="Save"
              type="submit"
            >
              Save
            </LeadRibbonButton>
            <LeadRibbonButton
              disabled={isPending}
              icon={RefreshCw}
              label="Reset"
              onClick={handleReset}
            >
              Reset
            </LeadRibbonButton>
          </>
        }
        right={
          <>
            <OwnerStatusDropdown
              ownerOptions={ownerOptions}
              ownerValue={form.assignedToUserId}
              onOwnerChange={(value) => updateForm("assignedToUserId", value)}
              onStatusChange={updateStatus}
              onSubStatusChange={(value) => updateForm("subStatus", value)}
              statusOptions={leadLifecycle.statuses.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
              statusValue={form.status}
              subStatusOptions={[
                { value: "", label: "None" },
                ...(leadLifecycle.subStatuses[form.status] ?? []).map((value) => ({
                  value,
                  label: value,
                })),
              ]}
              subStatusValue={form.subStatus}
            />
          </>
        }
      />

      <CrmStatusPipeline
        currentStatus={form.status}
        disabled={isPending}
        form={form}
        onFieldFocus={focusField}
        onStageChange={(stage, missing) => {
          if (missing.length) {
            applyMissingFieldErrors(missing);
            setMessage("Complete missing required fields before moving stages.");
            return;
          }
          updateStatus(stage.statusValue);
          if (stage.subStatusValue) updateForm("subStatus", stage.subStatusValue);
        }}
        stages={buildPipelineStagesFromLifecycle("lead", leadLifecycle.statuses)}
      />

      <LeadRecordHeader
        helperText="Capture the first required details and qualify the lead as it progresses."
        metadata={[
          { label: "Type", value: "LEAD" },
          { label: "Lifecycle", value: "Draft" },
          { label: "Form", value: formMode },
        ]}
        title="New lead"
      />

      <LeadFormShell
        footer={
          <>
            <div className="text-sm text-slate-600">
              {message ?? "Fill in the details and create the lead."}
            </div>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving..." : "Save lead"}
            </button>
          </>
        }
        formId={FORM_ID}
        onSubmit={handleSubmit}
      >
        <LeadField
          label="First name"
          error={fieldErrors.contactFirstName}
          fieldKey="contactFirstName"
          onChange={(value) => updateForm("contactFirstName", value)}
          value={form.contactFirstName}
        />
        <LeadField
          label="Last name"
          error={fieldErrors.contactLastName}
          fieldKey="contactLastName"
          onChange={(value) => updateForm("contactLastName", value)}
          value={form.contactLastName}
        />
        <LeadField
          label="Company"
          error={fieldErrors.companyName}
          fieldKey="companyName"
          onChange={(value) => updateForm("companyName", value)}
          required
          value={form.companyName}
        />
        <LeadField
          label="Work email"
          error={fieldErrors.workEmail}
          fieldKey="workEmail"
          onChange={(value) => updateForm("workEmail", value)}
          required
          type="email"
          value={form.workEmail}
        />
        <LeadField
          label="Phone"
          error={fieldErrors.phoneNumber}
          fieldKey="phoneNumber"
          onChange={(value) => updateForm("phoneNumber", value)}
          value={form.phoneNumber}
        />
        <LeadSelectField
          label="Industry"
          error={fieldErrors.industry}
          fieldKey="industry"
          onChange={(value) => updateForm("industry", value)}
          options={toSelectOptions(lifecycleOptions.industries)}
          value={form.industry}
        />
        <LeadSelectField
          label="Company size"
          error={fieldErrors.companySize}
          fieldKey="companySize"
          onChange={(value) => updateForm("companySize", value)}
          options={toSelectOptions(lifecycleOptions.companySizes)}
          value={form.companySize}
        />
        <LeadSelectField
          label="Source"
          error={fieldErrors.source}
          fieldKey="source"
          onChange={(value) => updateForm("source", value)}
          options={[
            { value: "", label: "Select source" },
            ...leadLifecycle.sources,
          ]}
          value={form.source}
        />
        <LeadSelectField
          label="Interested plan"
          error={fieldErrors.interestedPlan}
          fieldKey="interestedPlan"
          onChange={(value) => updateForm("interestedPlan", value)}
          options={[
            { value: "", label: "Not specified" },
            ...plans.map((plan) => ({
              value: plan.name,
              label: plan.name,
            })),
          ]}
          value={form.interestedPlan}
        />
        <LeadSelectField
          label="Referral partner"
          fieldKey="partnerId"
          onChange={(value) => updateForm("partnerId", value)}
          options={[{ value: "", label: "Direct / no partner" }, ...partners.map((partner) => ({ value: partner.id, label: `${partner.displayName} (${partner.code})` }))]}
          value={form.partnerId}
        />
        <LeadTextarea
          label="Requirements summary"
          error={fieldErrors.requirementsSummary}
          fieldKey="requirementsSummary"
          onChange={(value) => updateForm("requirementsSummary", value)}
          value={form.requirementsSummary}
        />
        <LeadTextarea
          label="Internal notes"
          error={fieldErrors.notes}
          fieldKey="notes"
          onChange={(value) => updateForm("notes", value)}
          value={form.notes}
        />
      </LeadFormShell>
    </LeadCrmShell>
  );
}
