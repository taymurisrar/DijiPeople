"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "./platform-lifecycle-types";

export function CustomerListManager({
  initialData,
  lifecycleOptions,
  operators,
  plans,
  currentFilters,
}: {
  initialData: PaginatedResponse<CustomerRecord>;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
  currentFilters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    primaryContactFirstName: "",
    primaryContactLastName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    industry: lifecycleOptions.industries[0]?.value ?? '',
    companySize: lifecycleOptions.companySizes[1]?.value ?? '',
    country: "United States",
    status: "PROSPECT",
    subStatus: lifecycleOptions.customer.subStatuses.PROSPECT?.[0] ?? "",
    selectedPlanId: plans[0]?.id ?? "",
    accountManagerUserId: operators[0]?.id ?? "",
  });

  function updateFilter(name: string, value: string) {
    const search = new URLSearchParams(window.location.search);
    if (value) search.set(name, value);
    else search.delete(name);
    search.delete("page");
    router.push(`/customers${search.toString() ? `?${search.toString()}` : ""}`);
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function handleCreate() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to create customer.");
        return;
      }
      router.push(`/customers/${payload.id}`);
    });
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected customer records?`);
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete customers.");
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
          <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.search ?? ""} onBlur={(event) => updateFilter("search", event.target.value)} placeholder="Search company or contact" />
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="">All statuses</option>
            {lifecycleOptions.customer.statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.subStatus ?? ""} onChange={(event) => updateFilter("subStatus", event.target.value)}>
            <option value="">All sub-statuses</option>
            {Object.values(lifecycleOptions.customer.subStatuses).flat().map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            defaultValue={currentFilters.industry ?? ''}
            onChange={(event) => updateFilter('industry', event.target.value)}
          >
            <option value="">All industries</option>
            {lifecycleOptions.industries.map((industry) => (
              <option key={industry.value} value={industry.value}>
                {industry.label}
              </option>
            ))}
          </select>
          <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" defaultValue={currentFilters.accountManagerUserId ?? ""} onChange={(event) => updateFilter("accountManagerUserId", event.target.value)}>
            <option value="">All account managers</option>
            {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}
          </select>
          <div className="flex gap-3">
            <button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700" onClick={() => router.refresh()} type="button">Refresh</button>
            <button className="flex-1 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={selectedIds.length === 0 || isPending} onClick={handleBulkDelete} type="button">Delete selected</button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create customer</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          <TextField label="Company" value={form.companyName} onChange={(value) => setForm((current) => ({ ...current, companyName: value }))} />
          <TextField label="Primary first name" value={form.primaryContactFirstName} onChange={(value) => setForm((current) => ({ ...current, primaryContactFirstName: value }))} />
          <TextField label="Primary last name" value={form.primaryContactLastName} onChange={(value) => setForm((current) => ({ ...current, primaryContactLastName: value }))} />
          <TextField label="Primary email" type="email" value={form.primaryContactEmail} onChange={(value) => setForm((current) => ({ ...current, primaryContactEmail: value }))} />
          <TextField label="Phone" value={form.primaryContactPhone} onChange={(value) => setForm((current) => ({ ...current, primaryContactPhone: value }))} />
          <Select
            label="Industry"
            value={form.industry}
            onChange={(value) => setForm((current) => ({ ...current, industry: value }))}
            options={lifecycleOptions.industries}
          />

          <Select
            label="Company size"
            value={form.companySize}
            onChange={(value) =>
              setForm((current) => ({ ...current, companySize: value }))
            }
            options={lifecycleOptions.companySizes}
          />
          <TextField label="Country" value={form.country} onChange={(value) => setForm((current) => ({ ...current, country: value }))} />
          <Select label="Plan" value={form.selectedPlanId} onChange={(value) => setForm((current) => ({ ...current, selectedPlanId: value }))} options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} />
          <Select label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value, subStatus: lifecycleOptions.customer.subStatuses[value]?.[0] ?? "" }))} options={lifecycleOptions.customer.statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
          <Select label="Sub-status" value={form.subStatus} onChange={(value) => setForm((current) => ({ ...current, subStatus: value }))} options={[{ value: "", label: "None" }, ...(lifecycleOptions.customer.subStatuses[form.status] ?? []).map((value) => ({ value, label: value }))]} />
          <Select label="Account manager" value={form.accountManagerUserId} onChange={(value) => setForm((current) => ({ ...current, accountManagerUserId: value }))} options={operators.map((operator) => ({ value: operator.id, label: operator.fullName }))} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{message ?? "Customers stay separate from tenants until onboarding and activation are complete."}</div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isPending} onClick={handleCreate} type="button">
            {isPending ? "Saving..." : "Create customer"}
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
                <th className="px-6 py-4 font-medium">Lifecycle</th>
                <th className="px-6 py-4 font-medium">Owner</th>
                <th className="px-6 py-4 font-medium">Tenant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {initialData.items.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-4 py-4"><input checked={selectedIds.includes(customer.id)} onChange={() => toggleRow(customer.id)} type="checkbox" /></td>
                  <td className="px-6 py-4">
                    <Link href={`/customers/${customer.id}`} className="font-medium text-slate-950 hover:text-slate-700">
                      {customer.companyName}
                    </Link>
                    <div className="mt-1 text-slate-500">{customer.primaryContactEmail ?? "No primary contact"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{customer.status.replaceAll("_", " ")}</div>
                    <div className="mt-1 text-slate-500">{customer.subStatus ?? "No sub-status"}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {customer.accountManagerUser ? `${customer.accountManagerUser.firstName} ${customer.accountManagerUser.lastName}` : "Unassigned"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {customer.tenant ? `${customer.tenant.name} (${customer.tenant.status})` : "No tenant"}
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

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}</select></label>;
}
