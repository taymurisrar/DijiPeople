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
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "./platform-lifecycle-types";

export function OnboardingDetailManager({
  onboarding,
  lifecycleOptions,
  operators,
  plans,
}: {
  onboarding: CustomerOnboardingRecord;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const onboardingLifecycle =
    lifecycleOptions.customerOnboarding ?? lifecycleOptions.onboarding;

  const initialForm = useMemo(
    () => ({
      onboardingOwnerUserId: onboarding.onboardingOwnerUser?.id ?? "",
      selectedPlanId:
        onboarding.selectedPlan?.id ?? onboarding.selectedPlanId ?? "",
      billingCycle: onboarding.billingCycle ?? "MONTHLY",
      primaryOwnerFirstName: onboarding.primaryOwnerFirstName ?? "",
      primaryOwnerLastName: onboarding.primaryOwnerLastName ?? "",
      primaryOwnerWorkEmail: onboarding.primaryOwnerWorkEmail ?? "",
      createServiceAccount:
        onboarding.createServiceAccount ??
        Boolean(onboarding.serviceAccountEmail),
      serviceAccountEmail: onboarding.serviceAccountEmail ?? "",
      serviceAccountDisplayName: onboarding.serviceAccountDisplayName ?? "",
      serviceAccountAssignSystemAdmin:
        onboarding.serviceAccountAssignSystemAdmin ?? true,
      contractSigned: onboarding.contractSigned,
      paymentConfirmed: onboarding.paymentConfirmed,
      configurationReady: onboarding.configurationReady,
      trainingPlanned: onboarding.trainingPlanned,
      status: onboarding.status,
      subStatus: onboarding.subStatus ?? "",
      notes: onboarding.notes ?? "",
    }),
    [onboarding],
  );

  const [form, setForm] = useState(initialForm);

  const updateForm = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLastSaveSucceeded(false);
    setMessage(null);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const saveStateLabel = isDirty
    ? "Unsaved changes"
    : lastSaveSucceeded
      ? "Saved"
      : "";

  const entityLogicalName = "onboarding";
  const formDisplayName = "Default";
  const companyName = onboarding.customer.companyName;

  function handleSave() {
    setMessage(null);
    setLastSaveSucceeded(false);

    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/customer-onboarding/${onboarding.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            onboardingOwnerUserId: form.onboardingOwnerUserId || undefined,
            selectedPlanId: form.selectedPlanId || undefined,
            subStatus: form.subStatus || undefined,
            serviceAccountEmail: form.serviceAccountEmail || undefined,
            serviceAccountDisplayName:
              form.serviceAccountDisplayName || undefined,
            notes: form.notes || undefined,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update onboarding.");
        return;
      }

      setMessage("Onboarding updated.");
      setLastSaveSucceeded(true);
      router.refresh();
    });
  }

  function handleCreateTenant() {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/customer-onboarding/${onboarding.id}/create-tenant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantName: onboarding.customer.companyName,
            slug: onboarding.customer.companyName,
            planId: form.selectedPlanId || undefined,
            billingCycle: form.billingCycle || undefined,
            createServiceAccount: form.createServiceAccount,
            serviceAccountEmail: form.serviceAccountEmail || undefined,
            serviceAccountDisplayName:
              form.serviceAccountDisplayName || undefined,
            assignServiceAccountSystemAdminRole:
              form.serviceAccountAssignSystemAdmin,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create tenant.");
        return;
      }

      router.push(`/tenants/${payload.tenantId}`);
    });
  }

  function handleDelete() {
    const confirmed = window.confirm("Delete this onboarding record?");
    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customer-onboarding", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [onboarding.id] }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete onboarding.");
        return;
      }

      router.push("/onboarding");
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
      description={`${companyName} • ${onboarding.status.replaceAll("_", " ")}`}
      title={companyName}
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
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/onboarding/new")}
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
                  disabled={isPending || Boolean(onboarding.tenant)}
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
                  {companyName}
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
                <span className="capitalize tracking-wide">
                  {entityLogicalName}
                </span>
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
                      onboardingLifecycle.subStatuses[value]?.[0] ?? "",
                    );
                  }}
                  options={onboardingLifecycle.statuses.map((value) => ({
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
                    ...(onboardingLifecycle.subStatuses[form.status] ?? []).map(
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
                  value={form.onboardingOwnerUserId}
                />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Customer" value={companyName} readOnly />

          <Select
            label="Plan"
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

          <Select
            label="Billing cycle"
            onChange={(value) => updateForm("billingCycle", value)}
            options={[
              { value: "MONTHLY", label: "MONTHLY" },
              { value: "ANNUAL", label: "ANNUAL" },
            ]}
            value={form.billingCycle}
          />

          <Field
            label="Primary owner first name"
            onChange={(value) => updateForm("primaryOwnerFirstName", value)}
            value={form.primaryOwnerFirstName}
          />

          <Field
            label="Primary owner last name"
            onChange={(value) => updateForm("primaryOwnerLastName", value)}
            value={form.primaryOwnerLastName}
          />

          <Field
            label="Primary owner work email"
            onChange={(value) => updateForm("primaryOwnerWorkEmail", value)}
            type="email"
            value={form.primaryOwnerWorkEmail}
          />

          <Field
            label="Service account email"
            onChange={(value) => updateForm("serviceAccountEmail", value)}
            type="email"
            value={form.serviceAccountEmail}
          />

          <Field
            label="Service account display name"
            onChange={(value) =>
              updateForm("serviceAccountDisplayName", value)
            }
            value={form.serviceAccountDisplayName}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Create optional service account"
            checked={form.createServiceAccount}
            onChange={(value) => updateForm("createServiceAccount", value)}
          />

          <Toggle
            label="Assign System Admin role to service account"
            checked={form.serviceAccountAssignSystemAdmin}
            onChange={(value) =>
              updateForm("serviceAccountAssignSystemAdmin", value)
            }
          />

          <Toggle
            label="Contract signed"
            checked={form.contractSigned}
            onChange={(value) => updateForm("contractSigned", value)}
          />

          <Toggle
            label="Payment confirmed"
            checked={form.paymentConfirmed}
            onChange={(value) => updateForm("paymentConfirmed", value)}
          />

          <Toggle
            label="Configuration ready"
            checked={form.configurationReady}
            onChange={(value) => updateForm("configurationReady", value)}
          />

          <Toggle
            label="Training planned"
            checked={form.trainingPlanned}
            onChange={(value) => updateForm("trainingPlanned", value)}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <TextArea
            label="Internal notes"
            onChange={(value) => updateForm("notes", value)}
            value={form.notes}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {message ??
                (onboarding.tenant
                  ? "Tenant has already been created for this onboarding."
                  : "Use the readiness checklist before tenant creation.")}
            </div>

            <button
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={
                !onboarding.readiness.isReadyForTenantCreation ||
                isPending ||
                Boolean(onboarding.tenant)
              }
              onClick={handleCreateTenant}
              type="button"
            >
              {onboarding.tenant ? "Tenant already created" : "Create tenant"}
            </button>
          </div>

          <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Readiness
            </h2>

            <div className="mt-4 rounded-2xl bg-white px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Completion
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">
                {onboarding.readiness.completionPercent}%
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {onboarding.readiness.checks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <span className="text-slate-700">{check.label}</span>
                  <span
                    className={
                      check.passed
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-amber-700"
                    }
                  >
                    {check.passed ? "Ready" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </section>
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
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
        disabled={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}