"use client";

import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModuleDetailLayout } from "@/app/_components/crm/module-detail-layout";
import { OwnerSelector } from "@/app/_components/crm/owner-selector";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { SubStatusSelector } from "@/app/_components/crm/sub-status-selector";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";

export function OnboardingCreateManager({
  lifecycleOptions,
  operators,
  plans,
  customers,
}: {
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
  customers: CustomerRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onboardingLifecycle =
    lifecycleOptions.customerOnboarding ?? lifecycleOptions.onboarding;

  const firstCustomer = customers[0];

  const [form, setForm] = useState({
    customerId: firstCustomer?.id ?? "",
    onboardingOwnerUserId: "",
    selectedPlanId: firstCustomer?.selectedPlan?.id ?? plans[0]?.id ?? "",
    billingCycle: "MONTHLY",
    primaryOwnerFirstName: firstCustomer?.primaryContactFirstName ?? "",
    primaryOwnerLastName: firstCustomer?.primaryContactLastName ?? "",
    primaryOwnerWorkEmail: firstCustomer?.primaryContactEmail ?? "",
    primaryOwnerPhone: firstCustomer?.primaryContactPhone ?? "",
    status: onboardingLifecycle.statuses[0] ?? "NOT_STARTED",
    subStatus:
      onboardingLifecycle.subStatuses[
        onboardingLifecycle.statuses[0] ?? "NOT_STARTED"
      ]?.[0] ?? "",
    notes: "",
  });

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === form.customerId),
    [customers, form.customerId],
  );

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);

    setForm((current) => ({
      ...current,
      customerId,
      selectedPlanId:
        customer?.selectedPlan?.id ?? current.selectedPlanId ?? "",
      primaryOwnerFirstName: customer?.primaryContactFirstName ?? "",
      primaryOwnerLastName: customer?.primaryContactLastName ?? "",
      primaryOwnerWorkEmail: customer?.primaryContactEmail ?? "",
      primaryOwnerPhone: customer?.primaryContactPhone ?? "",
    }));

    setMessage(null);
  }

  function handleCreate() {
    setMessage(null);

    if (!form.customerId) {
      setMessage("Please select a customer before creating onboarding.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customer-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          onboardingOwnerUserId: form.onboardingOwnerUserId || undefined,
          selectedPlanId: form.selectedPlanId || undefined,
          subStatus: form.subStatus || undefined,
          primaryOwnerPhone: form.primaryOwnerPhone || undefined,
          notes: form.notes || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create onboarding.");
        return;
      }

      router.push(`/onboarding/${payload.id}`);
    });
  }

  function handleReset() {
    const customer = customers[0];

    setForm({
      customerId: customer?.id ?? "",
      onboardingOwnerUserId: "",
      selectedPlanId: customer?.selectedPlan?.id ?? plans[0]?.id ?? "",
      billingCycle: "MONTHLY",
      primaryOwnerFirstName: customer?.primaryContactFirstName ?? "",
      primaryOwnerLastName: customer?.primaryContactLastName ?? "",
      primaryOwnerWorkEmail: customer?.primaryContactEmail ?? "",
      primaryOwnerPhone: customer?.primaryContactPhone ?? "",
      status: onboardingLifecycle.statuses[0] ?? "NOT_STARTED",
      subStatus:
        onboardingLifecycle.subStatuses[
          onboardingLifecycle.statuses[0] ?? "NOT_STARTED"
        ]?.[0] ?? "",
      notes: "",
    });

    setMessage(null);
  }

  return (
    <ModuleDetailLayout
      title="New onboarding"
      description="Create a new onboarding record."
      ribbon={
        <div className="flex flex-col gap-3">
          <RecordRibbonBar
            left={
              <>
                <button
                  aria-label="Back"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/onboarding")}
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
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedCustomer?.companyName ?? "New onboarding"}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="capitalize tracking-wide">onboarding</span>
                <span className="text-slate-300">-</span>
                <span>Default</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[720px] lg:grid-cols-3">
              <StatusSelector
                label="Status"
                value={form.status}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value,
                    subStatus:
                      onboardingLifecycle.subStatuses[value]?.[0] ?? "",
                  }))
                }
                options={onboardingLifecycle.statuses.map((value) => ({
                  value,
                  label: value.replaceAll("_", " "),
                }))}
              />

              <SubStatusSelector
                label="Sub-status"
                value={form.subStatus}
                onChange={(value) => updateForm("subStatus", value)}
                options={[
                  { value: "", label: "None" },
                  ...(onboardingLifecycle.subStatuses[form.status] ?? []).map(
                    (value) => ({
                      value,
                      label: value,
                    }),
                  ),
                ]}
              />

              <OwnerSelector
                label="Owner"
                value={form.onboardingOwnerUserId}
                onChange={(value) =>
                  updateForm("onboardingOwnerUserId", value)
                }
                options={[
                  { value: "", label: "Unassigned" },
                  ...operators.map((operator) => ({
                    value: operator.id,
                    label: operator.fullName,
                  })),
                ]}
              />
            </div>
          </div>
        </div>
      }
    >
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <Select
            label="Customer"
            value={form.customerId}
            onChange={handleCustomerChange}
            options={[
              { value: "", label: "Select customer" },
              ...customers.map((customer) => ({
                value: customer.id,
                label: customer.companyName,
              })),
            ]}
          />

          <Select
            label="Plan"
            value={form.selectedPlanId}
            onChange={(value) => updateForm("selectedPlanId", value)}
            options={[
              { value: "", label: "Not selected" },
              ...plans.map((plan) => ({
                value: plan.id,
                label: plan.name,
              })),
            ]}
          />

          <Select
            label="Billing cycle"
            value={form.billingCycle}
            onChange={(value) => updateForm("billingCycle", value)}
            options={[
              { value: "MONTHLY", label: "MONTHLY" },
              { value: "ANNUAL", label: "ANNUAL" },
            ]}
          />

          <Field
            label="Primary owner first name"
            value={form.primaryOwnerFirstName}
            onChange={(value) => updateForm("primaryOwnerFirstName", value)}
          />

          <Field
            label="Primary owner last name"
            value={form.primaryOwnerLastName}
            onChange={(value) => updateForm("primaryOwnerLastName", value)}
          />

          <Field
            label="Primary owner work email"
            type="email"
            value={form.primaryOwnerWorkEmail}
            onChange={(value) => updateForm("primaryOwnerWorkEmail", value)}
          />

          <Field
            label="Primary owner phone"
            value={form.primaryOwnerPhone}
            onChange={(value) => updateForm("primaryOwnerPhone", value)}
          />
        </div>

        <div className="mt-4">
          <TextArea
            label="Internal notes"
            value={form.notes}
            onChange={(value) => updateForm("notes", value)}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {message ?? "Fill in details and create onboarding."}
          </div>

          <button
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isPending}
            onClick={handleCreate}
            type="button"
          >
            {isPending ? "Creating..." : "Create onboarding"}
          </button>
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