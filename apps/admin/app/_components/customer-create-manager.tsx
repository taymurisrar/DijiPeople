"use client";

import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModuleDetailLayout } from "@/app/_components/crm/module-detail-layout";
import { OwnerSelector } from "@/app/_components/crm/owner-selector";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { SubStatusSelector } from "@/app/_components/crm/sub-status-selector";
import type {
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";

export function CustomerCreateManager({
  lifecycleOptions,
  operators,
  plans,
}: {
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyName: "",
    primaryContactFirstName: "",
    primaryContactLastName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    industry: lifecycleOptions.industries[0]?.value ?? "",
    companySize: lifecycleOptions.companySizes[0]?.value ?? "",
    country: "United States",
    selectedPlanId: "",
    accountManagerUserId: "",
    status: lifecycleOptions.customer.statuses[0] ?? "PROSPECT",
    subStatus:
      lifecycleOptions.customer.subStatuses[
        lifecycleOptions.customer.statuses[0] ?? "PROSPECT"
      ]?.[0] ?? "",
    notes: "",
  });

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function handleCreate() {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          selectedPlanId: form.selectedPlanId || undefined,
          accountManagerUserId: form.accountManagerUserId || undefined,
          subStatus: form.subStatus || undefined,
          primaryContactPhone: form.primaryContactPhone || undefined,
          notes: form.notes || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create customer.");
        return;
      }

      router.push(`/customers/${payload.id}`);
    });
  }

  function handleReset() {
    setForm({
      companyName: "",
      primaryContactFirstName: "",
      primaryContactLastName: "",
      primaryContactEmail: "",
      primaryContactPhone: "",
      industry: lifecycleOptions.industries[0]?.value ?? "",
      companySize: lifecycleOptions.companySizes[0]?.value ?? "",
      country: "United States",
      selectedPlanId: "",
      accountManagerUserId: "",
      status: lifecycleOptions.customer.statuses[0] ?? "PROSPECT",
      subStatus:
        lifecycleOptions.customer.subStatuses[
          lifecycleOptions.customer.statuses[0] ?? "PROSPECT"
        ]?.[0] ?? "",
      notes: "",
    });
    setMessage(null);
  }

  const fullName = [
    form.primaryContactFirstName,
    form.primaryContactLastName,
  ]
    .filter((value) => value.trim())
    .join(" ")
    .trim();

  return (
    <ModuleDetailLayout
      title={form.companyName || "New customer"}
      description="Create a new customer record."
      ribbon={
        <div className="flex flex-col gap-3">
          <RecordRibbonBar
            left={
              <>
                <button
                  aria-label="Back"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/customers")}
                  title="Back"
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  disabled={isPending}
                  onClick={handleCreate}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create</span>
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={handleReset}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Reset</span>
                </button>
              </>
            }
            right={<></>}
          />

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {fullName || "New customer"}
                </h2>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="uppercase tracking-wide">customer</span>
                <span className="text-slate-300">-</span>
                <span>Default</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[720px] lg:grid-cols-3">
              <div className="min-w-48">
                <StatusSelector
                  label="Status"
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value,
                      subStatus:
                        lifecycleOptions.customer.subStatuses[value]?.[0] ?? "",
                    }))
                  }
                  options={lifecycleOptions.customer.statuses.map((value) => ({
                    value,
                    label: value.replaceAll("_", " "),
                  }))}
                  value={form.status}
                />
              </div>

              <div className="min-w-56">
                <SubStatusSelector
                  label="Sub-status"
                  onChange={(value) => updateForm("subStatus", value)}
                  options={[
                    { value: "", label: "None" },
                    ...(lifecycleOptions.customer.subStatuses[form.status] ??
                      []).map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                  value={form.subStatus}
                />
              </div>

              <div className="min-w-56">
                <OwnerSelector
                  label="Account manager"
                  onChange={(value) => updateForm("accountManagerUserId", value)}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...operators.map((operator) => ({
                      value: operator.id,
                      label: operator.fullName,
                    })),
                  ]}
                  value={form.accountManagerUserId}
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
            label="Company"
            onChange={(value) => updateForm("companyName", value)}
            value={form.companyName}
          />

          <Field
            label="Primary first name"
            onChange={(value) => updateForm("primaryContactFirstName", value)}
            value={form.primaryContactFirstName}
          />

          <Field
            label="Primary last name"
            onChange={(value) => updateForm("primaryContactLastName", value)}
            value={form.primaryContactLastName}
          />

          <Field
            label="Primary email"
            onChange={(value) => updateForm("primaryContactEmail", value)}
            type="email"
            value={form.primaryContactEmail}
          />

          <Field
            label="Primary phone"
            onChange={(value) => updateForm("primaryContactPhone", value)}
            value={form.primaryContactPhone}
          />

          <Select
            label="Industry"
            onChange={(value) => updateForm("industry", value)}
            options={lifecycleOptions.industries}
            value={form.industry}
          />

          <Select
            label="Company size"
            onChange={(value) => updateForm("companySize", value)}
            options={lifecycleOptions.companySizes}
            value={form.companySize}
          />

          <Field
            label="Country"
            onChange={(value) => updateForm("country", value)}
            value={form.country}
          />

          <Select
            label="Selected plan"
            onChange={(value) => updateForm("selectedPlanId", value)}
            options={[
              { value: "", label: "Not selected" },
              ...plans.map((plan) => ({
                value: plan.id,
                label: plan.name,
              })),
            ]}
            value={form.selectedPlanId}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <TextArea
            label="Internal notes"
            onChange={(value) => updateForm("notes", value)}
            value={form.notes}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {message ??
              "Fill in the details and create the customer."}
          </div>

          <div className="flex gap-3">
            <button
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isPending}
              onClick={handleCreate}
              type="button"
            >
              {isPending ? "Creating..." : "Create customer"}
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

type SelectOption = {
  value: string;
  label: string;
};

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
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