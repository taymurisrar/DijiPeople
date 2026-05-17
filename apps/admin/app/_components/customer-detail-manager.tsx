"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, ClipboardList, Pencil, RefreshCw, Save, Share2 } from "lucide-react";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { FormControl } from "@/app/_components/ui/form-control";
import { CommandBar, DetailHeader, DetailPageShell, FormSection, ReadOnlyField, StatusPipeline, SummaryCard, SummaryCards } from "@/app/_components/ui/detail-page";
import { LifecycleTabs } from "@/app/_components/ui/lifecycle-tabs";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { useToastNotice } from "@/app/_components/ui/toast-provider";
import { getLifecycleLabel, isCustomerReadOnly } from "@/lib/lifecycle";
import { suggestTenantSlug } from "@/lib/tenant-slug";
import type { CustomerRecord, LifecycleOptions, OperatorOption, PlanOption } from "./platform-lifecycle-types";

type TabKey = "overview" | "contacts" | "onboarding" | "subscription" | "invoices" | "activity";
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "onboarding", label: "Onboarding" },
  { key: "subscription", label: "Subscription" },
  { key: "invoices", label: "Invoices" },
  { key: "activity", label: "Activity / Audit Log" },
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomerDetailManager({ customer, lifecycleOptions, plans }: { customer: CustomerRecord & { notes?: Array<{ id: string; note: string; createdAt: string }> }; lifecycleOptions: LifecycleOptions; operators: OperatorOption[]; plans: PlanOption[]; }) {
  const router = useRouter();
  const { showToast } = useToastNotice();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const initialForm = useMemo(() => ({
    companyName: customer.companyName ?? "",
    primaryContactFirstName: customer.primaryContactFirstName ?? "",
    primaryContactLastName: customer.primaryContactLastName ?? "",
    primaryContactEmail: customer.primaryContactEmail ?? "",
    primaryContactPhone: customer.primaryContactPhone ?? "",
    industry: customer.industry ?? "",
    companySize: customer.companySize ?? "",
    country: customer.country ?? "",
    preferredBillingCycle: customer.preferredBillingCycle ?? "",
    selectedPlanId: customer.selectedPlan?.id ?? "",
    accountManagerUserId: customer.accountManagerUser?.id ?? "",
  }), [customer]);
  const [form, setForm] = useState(initialForm);
  const linkedOnboarding = customer.onboardings?.[0];
  const linkedTenant = customer.tenants?.[0] ?? customer.tenant;
  const readOnly = isCustomerReadOnly(customer.status, customer.lifecycle?.tenantCount ?? customer.tenants?.length ?? 0);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const canStartOnboarding = Boolean(customer.onboardingPrerequisites?.allPassed && !linkedOnboarding);
  const fullName = [form.primaryContactFirstName, form.primaryContactLastName].filter(Boolean).join(" ").trim();

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setLastSaveSucceeded(false);
    setMessage(null);
  }
  function cancelEdit() {
    setForm(initialForm);
    setIsEditing(false);
    setMessage(null);
  }
  function validateForm() {
    if (!form.companyName.trim()) return "Company name is required.";
    if (!form.primaryContactFirstName.trim() || !form.primaryContactLastName.trim()) return "Primary contact first and last name are required.";
    if (!emailPattern.test(form.primaryContactEmail)) return "Primary contact email must be valid.";
    if (form.primaryContactPhone && /[A-Za-z]/.test(form.primaryContactPhone)) return "Primary contact phone must contain digits only.";
    if (!form.selectedPlanId) return "Selected plan is required.";
    if (!form.preferredBillingCycle) return "Billing cycle is required.";
    return null;
  }
  function handleSave() {
    if (!isEditing || readOnly || !isDirty) return;
    const error = validateForm();
    if (error) return setMessage(error);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, primaryContactPhone: form.primaryContactPhone || undefined, industry: form.industry || undefined, companySize: form.companySize || undefined, accountManagerUserId: form.accountManagerUserId || undefined }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to update customer.");
      setLastSaveSucceeded(true);
      setIsEditing(false);
      setMessage("Customer updated.");
      showToast({ title: "Customer updated", tone: "success" });
      router.refresh();
    });
  }
  function handleStartOnboarding() {
    if (!canStartOnboarding) return;
    const error = validateForm();
    if (error) return setMessage(error);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}/start-onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedPlanId: form.selectedPlanId, primaryOwnerFirstName: form.primaryContactFirstName, primaryOwnerLastName: form.primaryContactLastName, primaryOwnerWorkEmail: form.primaryContactEmail, primaryOwnerPhone: form.primaryContactPhone || undefined, billingCycle: form.preferredBillingCycle, plannedTenantSlug: suggestTenantSlug(form.companyName), status: "NOT_STARTED", subStatus: "Awaiting kickoff" }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to start onboarding.");
      showToast({ title: "Onboarding started", tone: "success" });
      router.push(`/onboarding/${payload.id}`);
    });
  }
  async function handleShare() {
    try { await navigator.clipboard.writeText(window.location.href); setMessage("Customer link copied."); showToast({ title: "Customer link copied", tone: "success" }); } catch { setMessage("Unable to copy customer link."); }
  }

  return <DetailPageShell>
    <DetailHeader eyebrow="Customer" title={<span className="inline-flex flex-wrap items-center gap-3">{customer.companyName}<TenantStatusBadge value={customer.status} /></span>} description={`${form.primaryContactEmail || "No primary email"} ? ${getLifecycleLabel(customer.status)}`} />
    <CommandBar>
    <RecordRibbonBar left={<>
      <IconButton label="Back" onClick={() => router.push("/customers")}><ArrowLeft className="h-4 w-4" /></IconButton>
      <ActionButton disabled={readOnly} onClick={() => setIsEditing(true)}><Pencil className="h-4 w-4" />Edit</ActionButton>
      <ActionButton disabled={isPending || !isEditing || !isDirty || readOnly} onClick={handleSave}><Save className="h-4 w-4" />Save</ActionButton>
      <ActionButton disabled={!isEditing} onClick={cancelEdit}>Cancel</ActionButton>
      <ActionButton onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" />Refresh</ActionButton>
      <ActionButton onClick={handleShare}><Share2 className="h-4 w-4" />Share</ActionButton>
      {linkedOnboarding ? <LinkButton href={`/onboarding/${linkedOnboarding.id}`}><ClipboardList className="h-4 w-4" />View onboarding</LinkButton> : <ActionButton disabled={!canStartOnboarding || isPending} onClick={handleStartOnboarding}><ClipboardList className="h-4 w-4" />Start onboarding</ActionButton>}
      {linkedTenant ? <LinkButton href={`/tenants/${linkedTenant.id}`}><Building2 className="h-4 w-4" />View tenant</LinkButton> : null}
    </>} right={<span className={isDirty ? "text-sm font-medium text-amber-600" : "text-sm font-medium text-emerald-600"}>{isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : ""}</span>} />
    </CommandBar>
    <StatusPipeline current={customer.status} steps={["PROSPECT", "ONBOARDING", "ACTIVE", "ARCHIVED"]} />
    <SummaryCards>
      <SummaryCard label="Primary contact" value={fullName || "Not set"} />
      <SummaryCard label="Account manager" value={customer.accountManagerUser ? `${customer.accountManagerUser.firstName} ${customer.accountManagerUser.lastName}` : "Unassigned"} />
      <SummaryCard label="Onboarding" value={linkedOnboarding ? getLifecycleLabel(linkedOnboarding.status) : "Not started"} />
      <SummaryCard label="Tenant" value={linkedTenant?.name ?? "Not created"} hint={readOnly ? "Restricted editing" : "Active customer"} />
    </SummaryCards>
    <FormSection title="Customer lifecycle" description={readOnly ? "Customers linked to live tenant lifecycle records are protected from unsafe edits." : "Use lifecycle actions rather than manually forcing statuses."}>
      <LifecycleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      {activeTab === "overview" ? <CustomerOverview isEditing={isEditing && !readOnly} form={form} updateForm={updateForm} lifecycleOptions={lifecycleOptions} plans={plans} /> : null}
      {activeTab === "contacts" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Primary contact" value={fullName} /><ReadOnlyField label="Email" value={form.primaryContactEmail} /><ReadOnlyField label="Phone" value={form.primaryContactPhone} /><ReadOnlyField label="Country" value={form.country} /></div> : null}
      {activeTab === "onboarding" ? <RelatedOnboarding onboardings={customer.onboardings ?? []} /> : null}
      {activeTab === "subscription" ? <SimpleTable title="Subscriptions" columns={["Plan", "Status", "Billing", "Price"]} rows={(customer.subscriptions ?? []).map((s) => [s.plan.name, s.status, s.billingCycle, `${s.currency} ${Number(s.finalPrice).toFixed(2)}`])} emptyText="No subscriptions found." /> : null}
      {activeTab === "invoices" ? <SimpleTable title="Invoices" columns={["Invoice #", "Amount", "Status", "Due date"]} rows={(customer.invoices ?? []).map((i) => [i.invoiceNumber, `${i.currency} ${Number(i.amount).toFixed(2)}`, i.status, formatDate(i.dueDate)])} emptyText="No invoices found." /> : null}
      {activeTab === "activity" ? <RelatedNotes notes={customer.notes ?? []} /> : null}
    </FormSection>
  </DetailPageShell>;
}

function CustomerOverview({ isEditing, form, updateForm, lifecycleOptions, plans }: { isEditing: boolean; form: any; updateForm: any; lifecycleOptions: LifecycleOptions; plans: PlanOption[] }) {
  if (!isEditing) return <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><ReadOnlyField label="Company" value={form.companyName} /><ReadOnlyField label="Industry" value={form.industry} /><ReadOnlyField label="Company size" value={form.companySize} /><ReadOnlyField label="Country" value={form.country} /><ReadOnlyField label="Billing cycle" value={form.preferredBillingCycle} /><ReadOnlyField label="Plan" value={plans.find((p) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /></div>;
  return <div className="mt-6 grid gap-4 lg:grid-cols-2">
    <FormControl label="Company" required type="text" value={form.companyName} onChange={(v) => updateForm("companyName", String(v))} />
    <FormControl label="Primary first name" required type="text" value={form.primaryContactFirstName} onChange={(v) => updateForm("primaryContactFirstName", String(v))} />
    <FormControl label="Primary last name" required type="text" value={form.primaryContactLastName} onChange={(v) => updateForm("primaryContactLastName", String(v))} />
    <FormControl label="Primary email" required type="email" value={form.primaryContactEmail} onChange={(v) => updateForm("primaryContactEmail", String(v))} />
    <FormControl label="Primary phone" type="tel" value={form.primaryContactPhone} onChange={(v) => updateForm("primaryContactPhone", String(v).replace(/[^+()\-.\s0-9]/g, ""))} />
    <FormControl label="Industry" type="select" value={form.industry} onChange={(v) => updateForm("industry", String(v))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.industries]} />
    <FormControl label="Company size" type="select" value={form.companySize} onChange={(v) => updateForm("companySize", String(v))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.companySizes]} />
    <FormControl label="Country" type="text" value={form.country} onChange={(v) => updateForm("country", String(v))} />
    <FormControl label="Billing cycle" required type="select" value={form.preferredBillingCycle} onChange={(v) => updateForm("preferredBillingCycle", String(v))} options={[{ value: "", label: "Not specified" }, { value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} />
    <FormControl label="Selected plan" required type="select" value={form.selectedPlanId} onChange={(v) => updateForm("selectedPlanId", String(v))} options={[{ value: "", label: "Not selected" }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
  </div>;
}
function IconButton({ label, onClick, children }: any) { return <button aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100" onClick={onClick} type="button">{children}</button>; }
function ActionButton({ children, onClick, disabled = false }: any) { return <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60" disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function LinkButton({ href, children }: any) { return <Link className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100" href={href}>{children}</Link>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "Not available"; }
function RelatedOnboarding({ onboardings }: { onboardings: NonNullable<CustomerRecord["onboardings"]> }) { return onboardings.length ? <div className="mt-6 space-y-3">{onboardings.map((o) => <Link key={o.id} href={`/onboarding/${o.id}`} className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="font-medium">{getLifecycleLabel(o.status)}</div><div className="mt-1 text-sm text-slate-600">{o.subStatus ?? "No sub-status"}</div></Link>)}</div> : <EmptyState text="No onboarding records yet." />; }
function RelatedNotes({ notes }: { notes: Array<{ id: string; note: string; createdAt: string }> }) { return notes.length ? <div className="mt-6 space-y-3">{notes.map((n) => <article key={n.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-sm">{n.note}</p><p className="mt-2 text-xs text-slate-500">{formatDate(n.createdAt)}</p></article>)}</div> : <EmptyState text="No activity recorded yet." />; }
function EmptyState({ text }: { text: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">{text}</div>; }
function SimpleTable({ title, columns, rows, emptyText }: { title: string; columns: string[]; rows: string[][]; emptyText: string }) { if (!rows.length) return <EmptyState text={emptyText} />; return <div className="mt-6"><h3 className="text-lg font-semibold text-slate-950">{title}</h3><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{columns.map((c) => <th key={c} className="border-b px-3 py-2 text-left">{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j} className="border-b px-3 py-3">{cell}</td>)}</tr>)}</tbody></table></div></div>; }
