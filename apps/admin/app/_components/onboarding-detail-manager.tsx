"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [form, setForm] = useState({
    onboardingOwnerUserId: onboarding.onboardingOwnerUser?.id ?? "",
    selectedPlanId: onboarding.selectedPlan?.id ?? onboarding.selectedPlanId ?? "",
    billingCycle: onboarding.billingCycle ?? "MONTHLY",
    primaryOwnerFirstName: onboarding.primaryOwnerFirstName,
    primaryOwnerLastName: onboarding.primaryOwnerLastName,
    primaryOwnerWorkEmail: onboarding.primaryOwnerWorkEmail,
    createServiceAccount: onboarding.createServiceAccount ?? Boolean(onboarding.serviceAccountEmail),
    serviceAccountEmail: onboarding.serviceAccountEmail ?? "",
    serviceAccountDisplayName: onboarding.serviceAccountDisplayName ?? "",
    serviceAccountAssignSystemAdmin: onboarding.serviceAccountAssignSystemAdmin ?? true,
    contractSigned: onboarding.contractSigned,
    paymentConfirmed: onboarding.paymentConfirmed,
    configurationReady: onboarding.configurationReady,
    trainingPlanned: onboarding.trainingPlanned,
    status: onboarding.status,
    subStatus: onboarding.subStatus ?? "",
    notes: onboarding.notes ?? "",
  });

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update onboarding.");
        return;
      }
      setMessage("Onboarding updated.");
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
            serviceAccountDisplayName: form.serviceAccountDisplayName || undefined,
            assignServiceAccountSystemAdminRole: form.serviceAccountAssignSystemAdmin,
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Onboarding record</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Select label="Onboarding owner" value={form.onboardingOwnerUserId} onChange={(value) => setForm((current) => ({ ...current, onboardingOwnerUserId: value }))} options={[{ value: "", label: "Unassigned" }, ...operators.map((operator) => ({ value: operator.id, label: operator.fullName }))]} />
          <Select label="Plan" value={form.selectedPlanId} onChange={(value) => setForm((current) => ({ ...current, selectedPlanId: value }))} options={[{ value: "", label: "Not selected" }, ...plans.map((plan) => ({ value: plan.id, label: plan.name }))]} />
          <Select label="Billing cycle" value={form.billingCycle} onChange={(value) => setForm((current) => ({ ...current, billingCycle: value }))} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} />
          <Select label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value, subStatus: lifecycleOptions.customerOnboarding.subStatuses[value]?.[0] ?? "" }))} options={lifecycleOptions.customerOnboarding.statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
          <Select label="Sub-status" value={form.subStatus} onChange={(value) => setForm((current) => ({ ...current, subStatus: value }))} options={[{ value: "", label: "None" }, ...(lifecycleOptions.customerOnboarding.subStatuses[form.status] ?? []).map((value) => ({ value, label: value }))]} />
          <Field label="Primary owner first name" value={form.primaryOwnerFirstName} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerFirstName: value }))} />
          <Field label="Primary owner last name" value={form.primaryOwnerLastName} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerLastName: value }))} />
          <Field label="Primary owner work email" type="email" value={form.primaryOwnerWorkEmail} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerWorkEmail: value }))} />
          <Toggle label="Create optional service account" checked={form.createServiceAccount} onChange={(value) => setForm((current) => ({ ...current, createServiceAccount: value }))} />
          <Field label="Service account email" type="email" value={form.serviceAccountEmail} onChange={(value) => setForm((current) => ({ ...current, serviceAccountEmail: value }))} />
          <Field label="Service account display name" value={form.serviceAccountDisplayName} onChange={(value) => setForm((current) => ({ ...current, serviceAccountDisplayName: value }))} />
          <Toggle label="Assign System Admin role to service account" checked={form.serviceAccountAssignSystemAdmin} onChange={(value) => setForm((current) => ({ ...current, serviceAccountAssignSystemAdmin: value }))} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle label="Contract signed" checked={form.contractSigned} onChange={(value) => setForm((current) => ({ ...current, contractSigned: value }))} />
          <Toggle label="Payment confirmed" checked={form.paymentConfirmed} onChange={(value) => setForm((current) => ({ ...current, paymentConfirmed: value }))} />
          <Toggle label="Configuration ready" checked={form.configurationReady} onChange={(value) => setForm((current) => ({ ...current, configurationReady: value }))} />
          <Toggle label="Training planned" checked={form.trainingPlanned} onChange={(value) => setForm((current) => ({ ...current, trainingPlanned: value }))} />
        </div>
        <label className="mt-5 block text-sm font-medium text-slate-700">
          Notes
          <textarea className="mt-2 min-h-32 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} value={form.notes} />
        </label>
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{message ?? "Use the checklist on the right to confirm tenant readiness."}</div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isPending} onClick={handleSave} type="button">
            {isPending ? "Saving..." : "Save onboarding"}
          </button>
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Readiness</h2>
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completion</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">
              {onboarding.readiness.completionPercent}%
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {onboarding.readiness.checks.map((check) => (
              <div key={check.label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-700">{check.label}</span>
                <span className={check.passed ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {check.passed ? "Ready" : "Pending"}
                </span>
              </div>
            ))}
          </div>
          <button className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={!onboarding.readiness.isReadyForTenantCreation || isPending || Boolean(onboarding.tenant)} onClick={handleCreateTenant} type="button">
            {onboarding.tenant ? "Tenant already created" : "Create tenant"}
          </button>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}</select></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}
