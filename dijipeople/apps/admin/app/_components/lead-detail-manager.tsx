"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Save,
  RefreshCw,
  Trash2,
  Share2,
} from "lucide-react";
import { ModuleDetailLayout } from "@/app/_components/crm/module-detail-layout";
import { OwnerSelector } from "@/app/_components/crm/owner-selector";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { SubStatusSelector } from "@/app/_components/crm/sub-status-selector";
import type {
  LeadRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "./platform-lifecycle-types";

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
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const initialForm = useMemo(
    () => ({
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
    }),
    [lead],
  );

  const [form, setForm] = useState(initialForm);

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLastSaveSucceeded(false);
    setMessage(null);
  };

  const fullName = [form.contactFirstName, form.contactLastName]
    .filter((value) => value?.trim())
    .join(" ")
    .trim();

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const saveStateLabel = isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : "";

  const entityLogicalName = "lead";
  const formDisplayName = "Default";

  function handleSave() {
    setMessage(null);
    setLastSaveSucceeded(false);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          interestedPlan: form.interestedPlan || undefined,
          assignedToUserId: form.assignedToUserId || undefined,
          subStatus: form.subStatus || undefined,
          notes: form.notes || undefined,
          requirementsSummary: form.requirementsSummary || undefined,
        }),
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

  function handleConvert() {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}/convert`, {
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
            plans.find((plan) => plan.name === form.interestedPlan)?.id ?? undefined,
          accountManagerUserId: form.assignedToUserId || undefined,
          status: "PROSPECT",
          subStatus: "Commercial review",
          leadSubStatus: "Converted to customer",
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to convert lead.");
        return;
      }

      router.push(`/customers/${payload.id}`);
    });
  }

  function handleDelete() {
    const confirmed = window.confirm("Delete this lead?");
    if (!confirmed) return;

    setMessage(null);

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

  return (
    <ModuleDetailLayout
      description={`${lead.fullName} • ${lead.workEmail} • ${lead.status.replaceAll("_", " ")}`}
      title={lead.companyName}
      ribbon={
        <div className="flex flex-col gap-3">
          <RecordRibbonBar
            left={
              <>
                <button
                  aria-label="Back"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/leads")}
                  title="Back"
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/leads")}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  <span>New</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setIsEditing((current) => !current)}
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                  <span>{isEditing ? "View" : "Edit"}</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  disabled={isPending}
                  onClick={handleSave}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.refresh()}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  disabled={isPending || Boolean(lead.convertedCustomer)}
                  onClick={handleDelete}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={handleShare}
                  type="button"
                >
                  <Share2 className="h-4 w-4" />
                  <span>Share</span>
                </button>
              </>
            }
            right={<></>}
          />

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900">
                  {fullName || "Unnamed lead"}
                </h2>

                {saveStateLabel ? (
                  <>
                    <span className="text-slate-300">-</span>
                    <span
                      className={
                        saveStateLabel === "Unsaved changes"
                          ? "text-sm font-medium text-amber-600"
                          : "text-sm font-medium text-emerald-600"
                      }
                    >
                      {saveStateLabel}
                    </span>
                  </>
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="capitalize tracking-wide">{entityLogicalName}</span>
                <span className="text-slate-300">-</span>
                <span>{formDisplayName}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[220px] lg:grid-cols-3">
              <div className="min-w-8">
                <StatusSelector
                  label="Status"
                  onChange={(value) => {
                    updateForm("status", value);
                    updateForm(
                      "subStatus",
                      lifecycleOptions.lead.subStatuses[value]?.[0] ?? "",
                    );
                  }}
                  options={lifecycleOptions.lead.statuses.map((value) => ({
                    value,
                    label: value.replaceAll("_", " "),
                  }))}
                  value={form.status}
                />
              </div>

              <div className="min-w-16">
                <SubStatusSelector
                  label="Sub-status"
                  onChange={(value) => updateForm("subStatus", value)}
                  options={[
                    { value: "", label: "None" },
                    ...(lifecycleOptions.lead.subStatuses[form.status] ?? []).map(
                      (value) => ({
                        value,
                        label: value,
                      }),
                    ),
                  ]}
                  value={form.subStatus}
                />
              </div>

              <div className="min-w-36">
                <OwnerSelector
                  label="Owner"
                  onChange={(value) => updateForm("assignedToUserId", value)}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...operators.map((operator) => ({
                      value: operator.id,
                      label: operator.fullName,
                    })),
                  ]}
                  value={form.assignedToUserId}
                />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="First name"
            onChange={(value) => updateForm("contactFirstName", value)}
            value={form.contactFirstName}
          />
          <Field
            label="Last name"
            onChange={(value) => updateForm("contactLastName", value)}
            value={form.contactLastName}
          />
          <Field
            label="Company"
            onChange={(value) => updateForm("companyName", value)}
            value={form.companyName}
          />
          <Field
            label="Work email"
            onChange={(value) => updateForm("workEmail", value)}
            type="email"
            value={form.workEmail}
          />
          <Field
            label="Phone"
            onChange={(value) => updateForm("phoneNumber", value)}
            value={form.phoneNumber}
          />
          <Select
            label="Industry"
            onChange={(value) => updateForm("industry", value)}
            options={lifecycleOptions.industries.map((value) => ({
              value,
              label: value,
            }))}
            value={form.industry}
          />
          <Select
            label="Company size"
            onChange={(value) => updateForm("companySize", value)}
            options={lifecycleOptions.companySizes.map((value) => ({
              value,
              label: value,
            }))}
            value={form.companySize}
          />
          <Field
            label="Source"
            onChange={(value) => updateForm("source", value)}
            value={form.source}
          />
          <Select
            label="Interested plan"
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
        </div>

        <div className="mt-4 grid gap-4">
          <TextArea
            label="Requirements summary"
            onChange={(value) => updateForm("requirementsSummary", value)}
            value={form.requirementsSummary}
          />
          <TextArea
            label="Internal notes"
            onChange={(value) => updateForm("notes", value)}
            value={form.notes}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {message ??
              (lead.convertedCustomer
                ? "This lead is already converted."
                : "Keep the lead qualified before conversion.")}
          </div>

          <div className="flex gap-3">
            <button
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isPending || Boolean(lead.convertedCustomer)}
              onClick={handleConvert}
              type="button"
            >
              Convert to customer
            </button>
          </div>
        </div>
      </section>
    </ModuleDetailLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}