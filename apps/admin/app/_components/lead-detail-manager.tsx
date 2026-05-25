"use client";

import {
  ArrowLeft,
  Power,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LeadCrmShell,
  LeadField,
  LeadFormShell,
  type LeadFormMode,
  LeadReadOnlyField,
  LeadRecordHeader,
  LeadRibbon,
  LeadRibbonButton,
  OwnerStatusDropdown,
  LeadSelectField,
  LeadTabs,
  LeadTextarea,
} from "@/app/_components/lead-crm-form";
import { StickyNotification } from "@/app/_components/notifications/app-notification";
import { CrmStatusPipeline } from "@/app/_components/crm-status-pipeline";
import {
  buildPipelineStagesFromLifecycle,
  entityPipelineConfigs,
  type PipelineStage,
} from "@/app/_components/entity-pipeline-config";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { getLifecycleLabel, isLeadReadOnly } from "@/lib/lifecycle";
import type {
  LeadRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "./platform-lifecycle-types";

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
  status: string;
  subStatus: string;
  notes: string;
  requirementsSummary: string;
};

type LeadTab = "overview" | "qualification" | "conversion" | "audit";

const FORM_ID = "lead-detail-form";

function buildInitialForm(lead: LeadRecord): LeadFormState {
  return {
    contactFirstName: lead.contactFirstName ?? "",
    contactLastName: lead.contactLastName ?? "",
    companyName: lead.companyName ?? "",
    workEmail: lead.workEmail ?? "",
    phoneNumber: lead.phoneNumber ?? "",
    industry: lead.industry ?? "",
    companySize: lead.companySize ?? "",
    source: lead.source ?? "",
    interestedPlan: lead.interestedPlan ?? "",
    assignedToUserId: lead.assignedToUserId ?? "",
    status: lead.status,
    subStatus: lead.subStatus ?? "",
    notes: lead.notes ?? "",
    requirementsSummary: lead.requirementsSummary ?? "",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function getPipelineStages(
  lifecycleOptions: LifecycleOptions,
  current: string,
) {
  const statuses = lifecycleOptions.lead.statuses ?? [];
  const visibleStatuses = statuses.some((status) => status.value === current)
    ? statuses
    : [
        ...statuses,
        {
          value: current,
          label: getLifecycleLabel(current),
          tone: "default" as const,
          sortOrder: statuses.length + 1,
          isActive: true,
          isSystem: false,
          isTerminal: false,
          allowedNextStatuses: [],
          criteria: [],
        },
      ];

  return visibleStatuses.map((status) => ({
    value: status.value,
    label: status.label,
  }));
}

function getStatusOptions(lifecycleOptions: LifecycleOptions, current: string) {
  return getPipelineStages(lifecycleOptions, current);
}

function getSubStatusOptions(
  lifecycleOptions: LifecycleOptions,
  status: string,
  currentSubStatus: string,
) {
  const configuredOptions = lifecycleOptions.lead.subStatuses[status] ?? [];
  const options =
    configuredOptions.includes(currentSubStatus) || !currentSubStatus
      ? configuredOptions
      : [currentSubStatus, ...configuredOptions];

  return [
    { value: "", label: "None" },
    ...options.map((value) => ({ value, label: value })),
  ];
}

export function LeadDetailManager({
  lead,
  lifecycleOptions,
  operators,
  plans,
}: {
  lead: LeadRecord;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LeadTab>("overview");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const initialForm = useMemo(() => buildInitialForm(lead), [lead]);
  const [form, setForm] = useState(initialForm);

  const isCompleted = isLeadReadOnly(form.status, lead.convertedCustomer?.id);
  const formMode: LeadFormMode = isCompleted ? "COMPLETED" : "UPDATE";
  const editable = formMode === "UPDATE";
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const saveStateLabel = isDirty
    ? "Unsaved changes"
    : lastSaveSucceeded
      ? "Saved"
      : "";
  const fullName = [form.contactFirstName, form.contactLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const ownerName =
    operators.find((operator) => operator.id === form.assignedToUserId)
      ?.fullName ??
    (form.assignedToUserId ? "Unknown owner" : null) ??
    "Unassigned";

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
    setLastSaveSucceeded(false);
    setMessage(null);
  }

  function updateStatus(value: string) {
    setForm((current) => ({
      ...current,
      status: value,
      subStatus: lifecycleOptions.lead.subStatuses[value]?.[0] ?? "",
    }));
    setLastSaveSucceeded(false);
    setMessage(null);
  }

  function buildLeadPayload(nextForm: LeadFormState) {
    return {
      ...nextForm,
      interestedPlan: nextForm.interestedPlan || undefined,
      assignedToUserId: nextForm.assignedToUserId || undefined,
      subStatus: nextForm.subStatus || undefined,
      notes: nextForm.notes || undefined,
      requirementsSummary: nextForm.requirementsSummary || undefined,
    };
  }

  function handleSave() {
    if (!editable || !isDirty) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLeadPayload(form)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update lead.");
        return;
      }
      setMessage("Lead updated.");
      setLastSaveSucceeded(true);
      router.refresh();
    });
  }

  function focusField(key: string) {
    window.setTimeout(() => {
      const field = document.querySelector<HTMLElement>(
        `[data-field-key="${key}"]`,
      );
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus();
    }, 80);
  }

  function applyMissingFieldErrors(keys: string[]) {
    const nextErrors = keys.reduce<Record<string, string>>((errors, key) => {
      errors[key] = "Required for this stage.";
      return errors;
    }, {});
    setFieldErrors(nextErrors);
    setActiveTab("overview");
    if (keys[0]) focusField(keys[0]);
  }

  function handleStageChange(stage: PipelineStage, missing: string[]) {
    if (missing.length) {
      applyMissingFieldErrors(missing);
      setMessage("Complete missing required fields before moving stages.");
      return;
    }
    const nextForm = {
      ...form,
      status: stage.statusValue,
      subStatus:
        stage.subStatusValue ??
        lifecycleOptions.lead.subStatuses[stage.statusValue]?.[0] ??
        "",
    };
    setForm(nextForm);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLeadPayload(nextForm)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update lead stage.");
        return;
      }
      setLastSaveSucceeded(true);
      setMessage("Lead stage updated.");
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleSave();
  }

  function handleReset() {
    setForm(initialForm);
    setFieldErrors({});
    setLastSaveSucceeded(false);
    setMessage(null);
  }

  function handleConvert() {
    if (isCompleted) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/leads/${lead.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: form.companyName,
            primaryContactFirstName: form.contactFirstName,
            primaryContactLastName: form.contactLastName,
            primaryContactEmail: form.workEmail,
            primaryContactPhone: form.phoneNumber || undefined,
            industry: form.industry,
            companySize: form.companySize,
            selectedPlanId:
              plans.find((plan) => plan.name === form.interestedPlan)?.id ??
              undefined,
            accountManagerUserId: form.assignedToUserId || undefined,
            status: "PROSPECT",
            subStatus: "Commercial review",
            leadSubStatus: "Converted to customer",
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to convert lead.");
        return;
      }
      router.push(`/customers/${payload.id}`);
    });
  }

  function handleDelete() {
    if (isCompleted || !window.confirm("Delete this lead?")) return;
    startTransition(async () => {
      const response = await fetch("/api/super-admin/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [lead.id] }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete lead.");
        return;
      }
      router.push("/leads");
    });
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Record link copied.");
    } catch {
      setMessage("Unable to copy record link.");
    }
  }

  const lifecycleLabel = isCompleted ? "Completed" : "Active";
  const canClickPipeline = editable && !isCompleted;

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
              disabled={isPending || !editable || !isDirty}
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
              label={editable || isDirty ? "Reset" : "Refresh"}
              onClick={
                editable || isDirty ? handleReset : () => router.refresh()
              }
            >
              {editable || isDirty ? "Reset" : "Refresh"}
            </LeadRibbonButton>
            <LeadRibbonButton
              icon={Plus}
              label="New"
              onClick={() => router.push("/leads/new")}
            >
              New
            </LeadRibbonButton>
            <LeadRibbonButton
              disabled={isPending}
              icon={Power}
              label={isCompleted ? "Activate" : "Deactivate"}
              onClick={() => {
                const nextStatus = isCompleted ? "NEW" : "ARCHIVED";
                const nextStage = entityPipelineConfigs.lead.stages.find(
                  (stage) => stage.statusValue === nextStatus,
                );
                if (nextStage) handleStageChange(nextStage, []);
              }}
            >
              {isCompleted ? "Activate" : "Deactivate"}
            </LeadRibbonButton>
            <LeadRibbonButton
              disabled={isPending || isCompleted}
              icon={Trash2}
              label="Delete"
              onClick={handleDelete}
            >
              Delete
            </LeadRibbonButton>
            <LeadRibbonButton icon={Share2} label="Share" onClick={handleShare}>
              Share
            </LeadRibbonButton>
            {saveStateLabel ? (
              <span
                className={[
                  "ml-1 inline-flex h-9 items-center rounded-lg px-2 text-sm font-semibold",
                  saveStateLabel === "Unsaved changes"
                    ? "text-amber-700"
                    : "text-emerald-700",
                ].join(" ")}
              >
                {saveStateLabel}
              </span>
            ) : null}
          </>
        }
        right={
          <>
            <OwnerStatusDropdown
              disabled={!editable}
              ownerLabel={ownerName}
              ownerOptions={ownerOptions}
              ownerValue={form.assignedToUserId}
              onOwnerChange={(value) => updateForm("assignedToUserId", value)}
              onStatusChange={updateStatus}
              onSubStatusChange={(value) => updateForm("subStatus", value)}
              statusOptions={getStatusOptions(lifecycleOptions, form.status)}
              statusValue={form.status}
              subStatusOptions={getSubStatusOptions(
                lifecycleOptions,
                form.status,
                form.subStatus,
              )}
              subStatusValue={form.subStatus}
            />
          </>
        }
      />

      <CrmStatusPipeline
        currentStatus={form.status}
        disabled={!canClickPipeline}
        form={form}
        onFieldFocus={focusField}
        onStageChange={canClickPipeline ? handleStageChange : undefined}
        stages={buildPipelineStagesFromLifecycle(
          "lead",
          lifecycleOptions.lead.statuses,
        )}
      />

      {formMode === "COMPLETED" ? (
        <StickyNotification
          storageKey={`lead-read-only-${lead.id}`}
          title="Read-only completed lead"
          tone="info"
        >
          This lead is complete and read-only. Historical details, conversion
          state, and audit information remain available for traceability.
        </StickyNotification>
      ) : null}

      <LeadRecordHeader
        badge={<TenantStatusBadge value={form.status} />}
        helperText="Review lead context and complete required fields before moving stages."
        metadata={[
          { label: "Contact", value: fullName },
          { label: "Email", value: form.workEmail },
          { label: "Source", value: form.source },
          { label: "Created", value: formatDate(lead.createdAt) },
          { label: "Lifecycle", value: lifecycleLabel },
        ]}
        title={form.companyName || fullName || lead.companyName || "Lead"}
      />

      <LeadTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "qualification", label: "Qualification" },
          { key: "conversion", label: "Conversion" },
          { key: "audit", label: "Audit Log" },
        ]}
      />

      {activeTab === "overview" ? (
        <LeadFormShell
          footer={
            <>
              <div className="text-sm text-slate-600">
                {message ??
                  (isCompleted
                    ? "This lead is complete."
                    : editable
                      ? "Save changes before converting the lead."
                      : "Select Edit to update this lead.")}
              </div>
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                disabled={isPending || isCompleted}
                onClick={handleConvert}
                type="button"
              >
                {isCompleted ? "Converted" : "Convert to customer"}
              </button>
            </>
          }
          formId={FORM_ID}
          onSubmit={handleSubmit}
        >
          <LeadField
            disabled={!editable}
            error={fieldErrors.contactFirstName}
            fieldKey="contactFirstName"
            label="First name"
            onChange={(value) => updateForm("contactFirstName", value)}
            value={form.contactFirstName}
          />
          <LeadField
            disabled={!editable}
            error={fieldErrors.contactLastName}
            fieldKey="contactLastName"
            label="Last name"
            onChange={(value) => updateForm("contactLastName", value)}
            value={form.contactLastName}
          />
          <LeadField
            disabled={!editable}
            error={fieldErrors.companyName}
            fieldKey="companyName"
            label="Company"
            onChange={(value) => updateForm("companyName", value)}
            required
            value={form.companyName}
          />
          <LeadField
            disabled={!editable}
            error={fieldErrors.workEmail}
            fieldKey="workEmail"
            label="Work email"
            onChange={(value) => updateForm("workEmail", value)}
            required
            type="email"
            value={form.workEmail}
          />
          <LeadField
            disabled={!editable}
            error={fieldErrors.phoneNumber}
            fieldKey="phoneNumber"
            label="Phone"
            onChange={(value) =>
              updateForm("phoneNumber", value.replace(/[^+()\-.\s0-9]/g, ""))
            }
            value={form.phoneNumber}
          />
          <LeadSelectField
            disabled={!editable}
            error={fieldErrors.industry}
            fieldKey="industry"
            label="Industry"
            onChange={(value) => updateForm("industry", value)}
            options={lifecycleOptions.industries}
            value={form.industry}
          />
          <LeadSelectField
            disabled={!editable}
            error={fieldErrors.companySize}
            fieldKey="companySize"
            label="Company size"
            onChange={(value) => updateForm("companySize", value)}
            options={lifecycleOptions.companySizes}
            value={form.companySize}
          />
          <LeadSelectField
            disabled={!editable}
            error={fieldErrors.source}
            fieldKey="source"
            label="Source"
            onChange={(value) => updateForm("source", value)}
            options={[
              { value: "", label: "Select source" },
              ...lifecycleOptions.lead.sources,
            ]}
            value={form.source}
          />
          <LeadSelectField
            disabled={!editable}
            error={fieldErrors.interestedPlan}
            fieldKey="interestedPlan"
            label="Interested plan"
            onChange={(value) => updateForm("interestedPlan", value)}
            options={[
              { value: "", label: "Not specified" },
              ...plans.map((plan) => ({ value: plan.name, label: plan.name })),
            ]}
            value={form.interestedPlan}
          />
          <LeadTextarea
            disabled={!editable}
            error={fieldErrors.requirementsSummary}
            fieldKey="requirementsSummary"
            label="Requirements summary"
            onChange={(value) => updateForm("requirementsSummary", value)}
            value={form.requirementsSummary}
          />
          <LeadTextarea
            disabled={!editable}
            error={fieldErrors.notes}
            fieldKey="notes"
            label="Internal notes"
            onChange={(value) => updateForm("notes", value)}
            value={form.notes}
          />
        </LeadFormShell>
      ) : null}

      {activeTab === "qualification" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <LeadReadOnlyField
              label="Interested plan"
              value={form.interestedPlan}
            />
            <LeadReadOnlyField label="Owner" value={ownerName} />
            <LeadReadOnlyField label="Sub-status" value={form.subStatus} />
            <LeadReadOnlyField
              label="Requirements summary"
              value={form.requirementsSummary}
              wide
            />
          </div>
        </section>
      ) : null}

      {activeTab === "conversion" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <LeadReadOnlyField
              label="Conversion state"
              value={
                isCompleted ? "Converted / completed" : "Ready when qualified"
              }
            />
            <LeadReadOnlyField
              label="Linked customer"
              value={lead.convertedCustomer?.companyName ?? "Not converted yet"}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 lg:col-span-2">
              <div className="text-sm text-slate-600">
                {message ??
                  (isCompleted
                    ? "Conversion has already been completed."
                    : "Conversion creates the linked customer record.")}
              </div>
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                disabled={isPending || isCompleted}
                onClick={handleConvert}
                type="button"
              >
                {isCompleted ? "Converted" : "Convert to customer"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Audit events will appear here as lifecycle actions are recorded.
          </div>
        </section>
      ) : null}
    </LeadCrmShell>
  );
}
