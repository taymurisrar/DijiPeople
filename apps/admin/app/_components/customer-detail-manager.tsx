"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, ClipboardList, Power, RefreshCw, RotateCcw, Save, Share2 } from "lucide-react";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { FormControl } from "@/app/_components/ui/form-control";
import { CommandBar, DetailHeader, DetailPageShell, FormSection, ReadOnlyField, SummaryCard, SummaryCards } from "@/app/_components/ui/detail-page";
import { LifecycleTabs } from "@/app/_components/ui/lifecycle-tabs";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { useToastNotice } from "@/app/_components/ui/toast-provider";
import { getLifecycleLabel, isCustomerReadOnly } from "@/lib/lifecycle";
import { suggestTenantSlug } from "@/lib/tenant-slug";
import { CrmStatusPipeline } from "@/app/_components/crm-status-pipeline";
import { buildPipelineStagesFromLifecycle, entityPipelineConfigs, getMissingPipelineFields, type PipelineStage } from "@/app/_components/entity-pipeline-config";
import { OwnerStatusDropdown } from "@/app/_components/lead-crm-form";
import { StickyNotification } from "@/app/_components/notifications/app-notification";
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

export function CustomerDetailManager({ customer, lifecycleOptions, operators, plans }: { customer: CustomerRecord & { notes?: Array<{ id: string; note: string; createdAt: string }> }; lifecycleOptions: LifecycleOptions; operators: OperatorOption[]; plans: PlanOption[]; }) {
  const router = useRouter();
  const { showToast } = useToastNotice();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    status: customer.status ?? "PROSPECT",
    subStatus: customer.subStatus ?? "",
  }), [customer]);
  const [form, setForm] = useState(initialForm);
  const linkedOnboarding = customer.onboardings?.[0];
  const linkedTenant = customer.tenants?.[0] ?? customer.tenant;
  const readOnly = isCustomerReadOnly(customer.status, customer.lifecycle?.tenantCount ?? customer.tenants?.length ?? 0);
  const editable = !readOnly;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const canStartOnboarding = Boolean(customer.onboardingPrerequisites?.allPassed && !linkedOnboarding);
  const fullName = [form.primaryContactFirstName, form.primaryContactLastName].filter(Boolean).join(" ").trim();

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[String(key)];
      return next;
    });
    setLastSaveSucceeded(false);
    setMessage(null);
  }
  function cancelEdit() {
    setForm(initialForm);
    setFieldErrors({});
    setMessage(null);
  }
  function validateForm() {
    const errors: Record<string, string> = {};
    if (!form.companyName.trim()) errors.companyName = "Company name is required.";
    if (!form.primaryContactFirstName.trim()) errors.primaryContactFirstName = "Primary contact first name is required.";
    if (!form.primaryContactLastName.trim()) errors.primaryContactLastName = "Primary contact last name is required.";
    if (!emailPattern.test(form.primaryContactEmail)) errors.primaryContactEmail = "Primary contact email must be valid.";
    if (form.primaryContactPhone && /[A-Za-z]/.test(form.primaryContactPhone)) errors.primaryContactPhone = "Primary contact phone must contain digits only.";
    if (!form.selectedPlanId) errors.selectedPlanId = "Selected plan is required.";
    if (!form.preferredBillingCycle) errors.preferredBillingCycle = "Billing cycle is required.";
    return errors;
  }
  function focusField(fieldKey: string) {
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-field-key="${fieldKey}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus?.();
    }, 50);
  }
  function applyMissingFieldErrors(stage: PipelineStage) {
    const missing = getMissingPipelineFields(stage, form);
    if (!missing.length) return false;
    const nextErrors = missing.reduce<Record<string, string>>((errors, field) => {
      errors[field.key] = `${field.label} is required before moving to ${stage.label}.`;
      return errors;
    }, {});
    setFieldErrors((current) => ({ ...current, ...nextErrors }));
    const firstMissing = missing[0];
    setActiveTab((firstMissing.tab as TabKey | undefined) ?? "overview");
    setMessage(Object.values(nextErrors)[0] ?? "Review the highlighted fields.");
    focusField(firstMissing.key);
    return true;
  }
  function buildPayload(nextForm = form) {
    return {
      ...nextForm,
      primaryContactPhone: nextForm.primaryContactPhone || undefined,
      industry: nextForm.industry || undefined,
      companySize: nextForm.companySize || undefined,
      accountManagerUserId: nextForm.accountManagerUserId || undefined,
      subStatus: nextForm.subStatus || undefined,
    };
  }
  function handleSave() {
    if (readOnly || !isDirty) return;
    const errors = validateForm();
    if (Object.keys(errors).length) { setFieldErrors(errors); setMessage(Object.values(errors)[0] ?? "Review the highlighted fields."); return focusField(Object.keys(errors)[0]); }
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to update customer.");
      setLastSaveSucceeded(true);
      setMessage("Customer updated.");
      showToast({ title: "Customer updated", tone: "success" });
      router.refresh();
    });
  }
  function handleStartOnboarding() {
    if (!canStartOnboarding) return;
    const errors = validateForm();
    if (Object.keys(errors).length) { setFieldErrors(errors); setMessage(Object.values(errors)[0] ?? "Review the highlighted fields."); return focusField(Object.keys(errors)[0]); }
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
  function handleStageChange(stage: PipelineStage) {
    if (applyMissingFieldErrors(stage) || readOnly) return;
    const nextForm = { ...form, status: stage.statusValue, subStatus: stage.subStatusValue ?? form.subStatus };
    setForm(nextForm);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload(nextForm)) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to update customer stage.");
      showToast({ title: "Customer stage updated", tone: "success" });
      router.refresh();
    });
  }
  function handleActivation() {
    const activate = ["ARCHIVED", "CHURNED", "SUSPENDED"].includes(String(form.status));
    const targetStatus = activate ? "ACTIVE" : "ARCHIVED";
    const stage = entityPipelineConfigs.customer.stages.find((item) => item.statusValue === targetStatus);
    if (!stage) return;
    handleStageChange(stage);
  }

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...operators.map((operator) => ({ value: operator.id, label: operator.fullName || `${operator.firstName} ${operator.lastName}`.trim() || operator.email })),
  ];
  const statusOptions = lifecycleOptions.customer.statuses.map((status) => ({ value: status.value, label: status.label }));
  const subStatusOptions = (lifecycleOptions.customer.subStatuses[form.status] ?? []).map((subStatus) => ({ value: subStatus, label: subStatus }));

  return <DetailPageShell>
    <DetailHeader eyebrow="Customer" title={<span className="inline-flex flex-wrap items-center gap-3">{customer.companyName}<TenantStatusBadge value={customer.status} /></span>} description={`${form.primaryContactEmail || "No primary email"} ? ${getLifecycleLabel(customer.status)}`} />
    <CommandBar>
    <RecordRibbonBar left={
      <IconButton label="Back" onClick={() => router.push("/customers")}><ArrowLeft className="h-4 w-4" /></IconButton>
    } right={<>
      <ActionButton disabled={readOnly || isPending} onClick={handleActivation}><Power className="h-4 w-4" />{["ARCHIVED", "CHURNED", "SUSPENDED"].includes(String(form.status)) ? "Activate" : "Deactivate"}</ActionButton>
      <ActionButton disabled={isPending || !isDirty || readOnly} onClick={handleSave}><Save className="h-4 w-4" />Save</ActionButton>
      <ActionButton disabled={!isDirty} onClick={cancelEdit}><RotateCcw className="h-4 w-4" />Reset</ActionButton>
      <ActionButton onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" />Refresh</ActionButton>
      <ActionButton onClick={handleShare}><Share2 className="h-4 w-4" />Share</ActionButton>
      {linkedOnboarding ? <LinkButton href={`/onboarding/${linkedOnboarding.id}`}><ClipboardList className="h-4 w-4" />View onboarding</LinkButton> : <ActionButton disabled={!canStartOnboarding || isPending} onClick={handleStartOnboarding}><ClipboardList className="h-4 w-4" />Start onboarding</ActionButton>}
      {linkedTenant ? <LinkButton href={`/tenants/${linkedTenant.id}`}><Building2 className="h-4 w-4" />View tenant</LinkButton> : null}
      <span className={isDirty ? "whitespace-nowrap text-sm font-medium text-amber-600" : "whitespace-nowrap text-sm font-medium text-emerald-600"}>{isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : ""}</span>
      <OwnerStatusDropdown disabled={readOnly} ownerLabel="Account manager" ownerOptions={ownerOptions} ownerValue={form.accountManagerUserId} statusLabel="Lifecycle" statusOptions={statusOptions} statusValue={form.status} subStatusOptions={subStatusOptions} subStatusValue={form.subStatus} onOwnerChange={(value) => updateForm("accountManagerUserId", value)} onStatusChange={(value) => updateForm("status", value)} onSubStatusChange={(value) => updateForm("subStatus", value)} />
    </>} />
    </CommandBar>
    <CrmStatusPipeline currentStatus={form.status} disabled={readOnly || isPending} form={form} onStageChange={handleStageChange} stages={buildPipelineStagesFromLifecycle("customer", lifecycleOptions.customer.statuses)} />
    {readOnly ? (
      <StickyNotification
        storageKey={`customer-read-only-${customer.id}`}
        title="Read-only customer"
        tone="info"
      >
        This customer is read-only in its current lifecycle state. Historical
        details and related records remain available for traceability.
      </StickyNotification>
    ) : null}
    <SummaryCards>
      <SummaryCard label="Primary contact" value={fullName || "Not set"} />
      <SummaryCard label="Account manager" value={customer.accountManagerUser ? `${customer.accountManagerUser.firstName} ${customer.accountManagerUser.lastName}` : "Unassigned"} />
      <SummaryCard label="Onboarding" value={linkedOnboarding ? getLifecycleLabel(linkedOnboarding.status) : "Not started"} />
      <SummaryCard label="Tenant" value={linkedTenant?.name ?? "Not created"} hint={readOnly ? "Restricted editing" : "Active customer"} />
    </SummaryCards>
    <FormSection title="Customer lifecycle" description={readOnly ? "Customers linked to live tenant lifecycle records are protected from unsafe edits." : "Use lifecycle actions rather than manually forcing statuses."}>
      <LifecycleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      {activeTab === "overview" ? <CustomerOverview fieldErrors={fieldErrors} isEditing={editable} form={form} updateForm={updateForm} lifecycleOptions={lifecycleOptions} plans={plans} /> : null}
      {activeTab === "contacts" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Primary contact" value={fullName} /><ReadOnlyField label="Email" value={form.primaryContactEmail} /><ReadOnlyField label="Phone" value={form.primaryContactPhone} /><ReadOnlyField label="Country" value={form.country} /></div> : null}
      {activeTab === "onboarding" ? <RelatedOnboarding onboardings={customer.onboardings ?? []} /> : null}
      {activeTab === "subscription" ? <SimpleTable title="Subscriptions" columns={["Plan", "Status", "Billing", "Price"]} rows={(customer.subscriptions ?? []).map((s) => [s.plan.name, s.status, s.billingCycle, `${s.currency} ${Number(s.finalPrice).toFixed(2)}`])} emptyText="No subscriptions found." /> : null}
      {activeTab === "invoices" ? <SimpleTable title="Invoices" columns={["Invoice #", "Amount", "Status", "Due date"]} rows={(customer.invoices ?? []).map((i) => [i.invoiceNumber, `${i.currency} ${Number(i.amount).toFixed(2)}`, i.status, formatDate(i.dueDate)])} emptyText="No invoices found." /> : null}
      {activeTab === "activity" ? <RelatedNotes notes={customer.notes ?? []} /> : null}
    </FormSection>
  </DetailPageShell>;
}

function CustomerOverview({ fieldErrors, isEditing, form, updateForm, lifecycleOptions, plans }: { fieldErrors: Record<string, string>; isEditing: boolean; form: any; updateForm: any; lifecycleOptions: LifecycleOptions; plans: PlanOption[] }) {
  if (!isEditing) return <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><ReadOnlyField label="Company" value={form.companyName} /><ReadOnlyField label="Industry" value={form.industry} /><ReadOnlyField label="Company size" value={form.companySize} /><ReadOnlyField label="Country" value={form.country} /><ReadOnlyField label="Billing cycle" value={form.preferredBillingCycle} /><ReadOnlyField label="Plan" value={plans.find((p) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /></div>;
  return <div className="mt-6 grid gap-4 lg:grid-cols-2">
    <FormControl error={fieldErrors.companyName} fieldKey="companyName" label="Company" required type="text" value={form.companyName} onChange={(v) => updateForm("companyName", String(v))} />
    <FormControl error={fieldErrors.primaryContactFirstName} fieldKey="primaryContactFirstName" label="Primary first name" required type="text" value={form.primaryContactFirstName} onChange={(v) => updateForm("primaryContactFirstName", String(v))} />
    <FormControl error={fieldErrors.primaryContactLastName} fieldKey="primaryContactLastName" label="Primary last name" required type="text" value={form.primaryContactLastName} onChange={(v) => updateForm("primaryContactLastName", String(v))} />
    <FormControl error={fieldErrors.primaryContactEmail} fieldKey="primaryContactEmail" label="Primary email" required type="email" value={form.primaryContactEmail} onChange={(v) => updateForm("primaryContactEmail", String(v))} />
    <FormControl error={fieldErrors.primaryContactPhone} fieldKey="primaryContactPhone" label="Primary phone" type="tel" value={form.primaryContactPhone} onChange={(v) => updateForm("primaryContactPhone", String(v).replace(/[^+()\-.\s0-9]/g, ""))} />
    <FormControl error={fieldErrors.industry} fieldKey="industry" label="Industry" type="select" value={form.industry} onChange={(v) => updateForm("industry", String(v))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.industries]} />
    <FormControl error={fieldErrors.companySize} fieldKey="companySize" label="Company size" type="select" value={form.companySize} onChange={(v) => updateForm("companySize", String(v))} options={[{ value: "", label: "Not specified" }, ...lifecycleOptions.companySizes]} />
    <FormControl error={fieldErrors.country} fieldKey="country" label="Country" type="text" value={form.country} onChange={(v) => updateForm("country", String(v))} />
    <FormControl error={fieldErrors.preferredBillingCycle} fieldKey="preferredBillingCycle" label="Billing cycle" required type="select" value={form.preferredBillingCycle} onChange={(v) => updateForm("preferredBillingCycle", String(v))} options={[{ value: "", label: "Not specified" }, { value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} />
    <FormControl error={fieldErrors.selectedPlanId} fieldKey="selectedPlanId" label="Selected plan" required type="select" value={form.selectedPlanId} onChange={(v) => updateForm("selectedPlanId", String(v))} options={[{ value: "", label: "Not selected" }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
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
