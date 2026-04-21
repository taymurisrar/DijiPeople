"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "./platform-lifecycle-types";

export function CustomerDetailManager({
  customer,
  lifecycleOptions,
  operators,
  plans,
}: {
  customer: CustomerRecord & {
    primaryContactFirstName?: string | null;
    primaryContactLastName?: string | null;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
    notes?: Array<{ id: string; note: string; createdAt: string }>;
    onboardings?: Array<{ id: string; status: string; subStatus?: string | null; tenantCreated: boolean }>;
  };
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: customer.companyName,
    primaryContactFirstName: customer.primaryContactFirstName ?? "",
    primaryContactLastName: customer.primaryContactLastName ?? "",
    primaryContactEmail: customer.primaryContactEmail ?? "",
    primaryContactPhone: customer.primaryContactPhone ?? "",
    industry: customer.industry ?? "",
    companySize: customer.companySize ?? "",
    country: customer.country,
    status: customer.status,
    subStatus: customer.subStatus ?? "",
    selectedPlanId: customer.selectedPlan?.id ?? "",
    accountManagerUserId: customer.accountManagerUser?.id ?? "",
  });

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update customer.");
        return;
      }
      setMessage("Customer updated.");
      router.refresh();
    });
  }

  function handleStartOnboarding() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/customers/${customer.id}/start-onboarding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPlanId: form.selectedPlanId || undefined,
            primaryOwnerFirstName: form.primaryContactFirstName,
            primaryOwnerLastName: form.primaryContactLastName,
            primaryOwnerWorkEmail: form.primaryContactEmail,
            primaryOwnerPhone: form.primaryContactPhone || undefined,
            billingCycle: "MONTHLY",
            status: "NOT_STARTED",
            subStatus: "Awaiting kickoff",
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to start onboarding.");
        return;
      }
      router.push(`/onboarding/${payload.id}`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Customer profile</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Company" value={form.companyName} onChange={(value) => setForm((current) => ({ ...current, companyName: value }))} />
          <Field label="Primary first name" value={form.primaryContactFirstName} onChange={(value) => setForm((current) => ({ ...current, primaryContactFirstName: value }))} />
          <Field label="Primary last name" value={form.primaryContactLastName} onChange={(value) => setForm((current) => ({ ...current, primaryContactLastName: value }))} />
          <Field label="Primary email" type="email" value={form.primaryContactEmail} onChange={(value) => setForm((current) => ({ ...current, primaryContactEmail: value }))} />
          <Field label="Primary phone" value={form.primaryContactPhone} onChange={(value) => setForm((current) => ({ ...current, primaryContactPhone: value }))} />
          <Field label="Country" value={form.country} onChange={(value) => setForm((current) => ({ ...current, country: value }))} />
          <Select label="Industry" value={form.industry} onChange={(value) => setForm((current) => ({ ...current, industry: value }))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.industries.map((value) => ({ value, label: value }))]} />
          <Select label="Company size" value={form.companySize} onChange={(value) => setForm((current) => ({ ...current, companySize: value }))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.companySizes.map((value) => ({ value, label: value }))]} />
          <Select label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value, subStatus: lifecycleOptions.customer.subStatuses[value]?.[0] ?? "" }))} options={lifecycleOptions.customer.statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
          <Select label="Sub-status" value={form.subStatus} onChange={(value) => setForm((current) => ({ ...current, subStatus: value }))} options={[{ value: "", label: "None" }, ...(lifecycleOptions.customer.subStatuses[form.status] ?? []).map((value) => ({ value, label: value }))]} />
          <Select label="Selected plan" value={form.selectedPlanId} onChange={(value) => setForm((current) => ({ ...current, selectedPlanId: value }))} options={[{ value: "", label: "Not selected" }, ...plans.map((plan) => ({ value: plan.id, label: plan.name }))]} />
          <Select label="Account manager" value={form.accountManagerUserId} onChange={(value) => setForm((current) => ({ ...current, accountManagerUserId: value }))} options={[{ value: "", label: "Unassigned" }, ...operators.map((operator) => ({ value: operator.id, label: operator.fullName }))]} />
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{message ?? "Customers must be active before a tenant can be created."}</div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isPending} onClick={handleSave} type="button">
            {isPending ? "Saving..." : "Save customer"}
          </button>
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Lifecycle</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Info label="Status" value={customer.status.replaceAll("_", " ")} />
            <Info label="Sub-status" value={customer.subStatus ?? "None"} />
            <Info label="Source lead" value={customer.leadId ? "Linked" : "Standalone customer"} />
            <Info label="Tenant" value={customer.tenant ? `${customer.tenant.name} (${customer.tenant.status})` : "Not created"} />
          </div>
          {!customer.tenant ? (
            <button className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60" disabled={isPending} onClick={handleStartOnboarding} type="button">
              Start onboarding
            </button>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Onboarding</h2>
          <div className="mt-4 space-y-3">
            {customer.onboardings && customer.onboardings.length > 0 ? (
              customer.onboardings.map((item) => (
                <Link key={item.id} href={`/onboarding/${item.id}`} className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-slate-300">
                  <div className="font-medium text-slate-950">{item.status.replaceAll("_", " ")}</div>
                  <div className="mt-1 text-sm text-slate-600">{item.subStatus ?? "No sub-status"}</div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No onboarding records yet.
              </div>
            )}
          </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-medium text-slate-950">{value}</div>
    </div>
  );
}
