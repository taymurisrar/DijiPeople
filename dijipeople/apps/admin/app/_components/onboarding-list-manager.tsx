"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomerOnboardingRecord,
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "./platform-lifecycle-types";

export function OnboardingListManager({
  initialData,
  lifecycleOptions,
  operators,
  customers,
  plans,
  currentFilters,
}: {
  initialData: PaginatedResponse<CustomerOnboardingRecord>;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  customers: CustomerRecord[];
  plans: PlanOption[];
  currentFilters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerId: customers[0]?.id ?? "",
    onboardingOwnerUserId: operators[0]?.id ?? "",
    selectedPlanId: plans[0]?.id ?? "",
    billingCycle: "MONTHLY",
    primaryOwnerFirstName: customers[0]?.primaryContactFirstName ?? "",
    primaryOwnerLastName: customers[0]?.primaryContactLastName ?? "",
    primaryOwnerWorkEmail: customers[0]?.primaryContactEmail ?? "",
    primaryOwnerPhone: customers[0]?.primaryContactPhone ?? "",
    status: "NOT_STARTED",
    subStatus: lifecycleOptions.customerOnboarding.subStatuses.NOT_STARTED?.[0] ?? "",
  });

  function updateFilter(name: string, value: string) {
    const search = new URLSearchParams(window.location.search);
    if (value) search.set(name, value);
    else search.delete(name);
    search.delete("page");
    router.push(`/onboarding${search.toString() ? `?${search.toString()}` : ""}`);
  }

  function handleCreate() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/super-admin/customer-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create onboarding.");
        return;
      }
      router.push(`/onboarding/${payload.id}`);
    });
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected onboarding records?`);
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customer-onboarding", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete onboarding records.");
        return;
      }
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-6">
          <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.search ?? ""} onBlur={(event) => updateFilter("search", event.target.value)} placeholder="Search company or owner email" />
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="">All statuses</option>
            {lifecycleOptions.customerOnboarding.statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.subStatus ?? ""} onChange={(event) => updateFilter("subStatus", event.target.value)}>
            <option value="">All sub-statuses</option>
            {Object.values(lifecycleOptions.customerOnboarding.subStatuses).flat().map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.customerId ?? ""} onChange={(event) => updateFilter("customerId", event.target.value)}>
            <option value="">All customers</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
          </select>
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.onboardingOwnerUserId ?? ""} onChange={(event) => updateFilter("onboardingOwnerUserId", event.target.value)}>
            <option value="">All owners</option>
            {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}
          </select>
          <div className="flex gap-3">
            <button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700" onClick={() => router.refresh()} type="button">Refresh</button>
            <button className="flex-1 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={selectedIds.length === 0 || isPending} onClick={handleBulkDelete} type="button">Delete selected</button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create onboarding</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          <Select label="Customer" value={form.customerId} onChange={(value) => setForm((current) => ({ ...current, customerId: value }))} options={customers.map((customer) => ({ value: customer.id, label: customer.companyName }))} />
          <Select label="Owner" value={form.onboardingOwnerUserId} onChange={(value) => setForm((current) => ({ ...current, onboardingOwnerUserId: value }))} options={operators.map((operator) => ({ value: operator.id, label: operator.fullName }))} />
          <Select label="Plan" value={form.selectedPlanId} onChange={(value) => setForm((current) => ({ ...current, selectedPlanId: value }))} options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} />
          <Select label="Billing cycle" value={form.billingCycle} onChange={(value) => setForm((current) => ({ ...current, billingCycle: value }))} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} />
          <Field label="Primary owner first name" value={form.primaryOwnerFirstName} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerFirstName: value }))} />
          <Field label="Primary owner last name" value={form.primaryOwnerLastName} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerLastName: value }))} />
          <Field label="Primary owner email" type="email" value={form.primaryOwnerWorkEmail} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerWorkEmail: value }))} />
          <Field label="Primary owner phone" value={form.primaryOwnerPhone} onChange={(value) => setForm((current) => ({ ...current, primaryOwnerPhone: value }))} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{message ?? "Use onboarding to validate readiness before tenant creation."}</div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isPending} onClick={handleCreate} type="button">
            {isPending ? "Saving..." : "Create onboarding"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4"><input checked={selectedIds.length === initialData.items.length && initialData.items.length > 0} onChange={() => setSelectedIds(selectedIds.length === initialData.items.length ? [] : initialData.items.map((item) => item.id))} type="checkbox" /></th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Readiness</th>
                <th className="px-6 py-4 font-medium">Owner</th>
                <th className="px-6 py-4 font-medium">Tenant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {initialData.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4"><input checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])} type="checkbox" /></td>
                  <td className="px-6 py-4">
                    <Link href={`/onboarding/${item.id}`} className="font-medium text-slate-950 hover:text-slate-700">
                      {item.customer.companyName}
                    </Link>
                    <div className="mt-1 text-slate-500">{item.status.replaceAll("_", " ")}</div>
                    <div className="mt-1 text-slate-500">{item.subStatus ?? "No sub-status"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{item.readiness.completionPercent}%</div>
                    <div className="mt-1 text-slate-500">{item.readiness.isReadyForTenantCreation ? "Ready for tenant" : `${item.readiness.blockers.length} blockers`}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {item.onboardingOwnerUser ? `${item.onboardingOwnerUser.firstName} ${item.onboardingOwnerUser.lastName}` : "Unassigned"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {item.tenant ? `${item.tenant.name} (${item.tenant.status})` : "Not created"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}</select></label>;
}
