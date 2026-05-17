"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, Copy, Pencil, RefreshCw, Save, Share2, UserRound } from "lucide-react";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { CommandBar, DetailHeader, DetailPageShell, FormSection, ReadOnlyField, StatusPipeline, SummaryCard, SummaryCards } from "@/app/_components/ui/detail-page";
import { LifecycleTabs } from "@/app/_components/ui/lifecycle-tabs";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { useToastNotice } from "@/app/_components/ui/toast-provider";
import { isOnboardingReadOnly, getLifecycleLabel } from "@/lib/lifecycle";
import { buildTenantLoginUrl } from "@/lib/tenant-url";
import { suggestTenantSlug, validateTenantSlug } from "@/lib/tenant-slug";
import type { CustomerOnboardingRecord, LifecycleOptions, OperatorOption, PlanOption } from "./platform-lifecycle-types";

type TabKey = "overview" | "provisioning" | "billing" | "tenant" | "share" | "activity";
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "provisioning", label: "Provisioning" },
  { key: "billing", label: "Billing Setup" },
  { key: "tenant", label: "Tenant Setup" },
  { key: "share", label: "Share / Activation" },
  { key: "activity", label: "Activity / Audit Log" },
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OnboardingDetailManager({ onboarding, plans }: { onboarding: CustomerOnboardingRecord; lifecycleOptions: LifecycleOptions; operators: OperatorOption[]; plans: PlanOption[]; }) {
  const router = useRouter();
  const { showToast } = useToastNotice();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);
  const [slugAvailability, setSlugAvailability] = useState<"idle" | "checking" | "available" | "unavailable">("idle");

  const initialForm = useMemo(() => ({
    onboardingOwnerUserId: onboarding.onboardingOwnerUser?.id ?? "",
    selectedPlanId: onboarding.selectedPlan?.id ?? onboarding.selectedPlanId ?? "",
    billingCycle: onboarding.billingCycle ?? "MONTHLY",
    primaryOwnerFirstName: onboarding.primaryOwnerFirstName ?? "",
    primaryOwnerLastName: onboarding.primaryOwnerLastName ?? "",
    primaryOwnerWorkEmail: onboarding.primaryOwnerWorkEmail ?? "",
    createServiceAccount: onboarding.createServiceAccount ?? Boolean(onboarding.serviceAccountEmail),
    serviceAccountEmail: onboarding.serviceAccountEmail ?? "",
    serviceAccountDisplayName: onboarding.serviceAccountDisplayName ?? "",
    serviceAccountAssignSystemAdmin: onboarding.serviceAccountAssignSystemAdmin ?? true,
    tenantSlug: onboarding.tenant?.slug ?? onboarding.plannedTenantSlug ?? suggestTenantSlug(onboarding.customer.companyName),
    contractSigned: onboarding.contractSigned,
    paymentConfirmed: onboarding.paymentConfirmed,
    configurationReady: onboarding.configurationReady,
    trainingPlanned: onboarding.trainingPlanned,
    notes: onboarding.notes ?? "",
  }), [onboarding]);
  const [form, setForm] = useState(initialForm);
  const readOnly = isOnboardingReadOnly(onboarding.status, onboarding.tenant?.id, onboarding.tenantCreated);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const slugValidationError = validateTenantSlug(form.tenantSlug);
  const loginUrl = buildTenantLoginUrl(form.tenantSlug);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((c) => ({ ...c, [key]: value })); setLastSaveSucceeded(false); setMessage(null); }
  function cancelEdit() { setForm(initialForm); setIsEditing(false); setMessage(null); }
  function validateForm() {
    if (!form.tenantSlug.trim()) return "Tenant slug is required.";
    if (slugValidationError) return slugValidationError;
    if (!form.primaryOwnerFirstName.trim() || !form.primaryOwnerLastName.trim()) return "Primary owner name is required.";
    if (!emailPattern.test(form.primaryOwnerWorkEmail)) return "Primary owner email must be valid.";
    if (!form.selectedPlanId) return "Plan is required.";
    if (!form.billingCycle) return "Billing cycle is required.";
    return null;
  }
  useEffect(() => {
    if (readOnly || slugValidationError) return;
    const slug = form.tenantSlug.trim().toLowerCase();
    const timeoutId = window.setTimeout(async () => {
      setSlugAvailability("checking");
      const response = await fetch(`/api/super-admin/tenant-slug/availability?slug=${encodeURIComponent(slug)}`);
      const payload = await response.json().catch(() => null) as { available?: boolean } | null;
      setSlugAvailability(response.ok && payload?.available ? "available" : "unavailable");
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [form.tenantSlug, readOnly, slugValidationError]);
  function handleSave() {
    if (!isEditing || readOnly || !isDirty) return;
    const error = validateForm(); if (error) return setMessage(error);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, plannedTenantSlug: form.tenantSlug.trim().toLowerCase(), onboardingOwnerUserId: form.onboardingOwnerUserId || undefined, selectedPlanId: form.selectedPlanId || undefined, serviceAccountEmail: form.serviceAccountEmail || undefined, serviceAccountDisplayName: form.serviceAccountDisplayName || undefined, notes: form.notes || undefined }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to update onboarding.");
      setLastSaveSucceeded(true); setIsEditing(false); setMessage("Onboarding updated."); showToast({ title: "Onboarding updated", tone: "success" }); router.refresh();
    });
  }
  function handleMarkReady() {
    if (readOnly) return;
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "READY_FOR_TENANT_CREATION", subStatus: "Go-live ready" }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to mark onboarding ready.");
      setMessage("Onboarding marked ready for tenant creation."); showToast({ title: "Onboarding marked ready", tone: "success" }); router.refresh();
    });
  }
  function handleCreateTenant() {
    if (readOnly) return;
    const error = validateForm(); if (error) return setMessage(error);
    if (slugAvailability === "unavailable") return setMessage("Tenant slug is already in use.");
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}/create-tenant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantName: onboarding.customer.companyName, slug: form.tenantSlug.trim().toLowerCase(), planId: form.selectedPlanId, billingCycle: form.billingCycle, createServiceAccount: form.createServiceAccount, serviceAccountEmail: form.serviceAccountEmail || undefined, serviceAccountDisplayName: form.serviceAccountDisplayName || undefined, assignServiceAccountSystemAdminRole: form.serviceAccountAssignSystemAdmin }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to create tenant.");
      setMessage(`Tenant created. Login URL: ${loginUrl}`); showToast({ title: "Tenant created", description: "Activation link generated for the tenant owner.", tone: "success" }); router.push(`/tenants/${payload.tenantId}`);
    });
  }
  async function handleShare() { try { await navigator.clipboard.writeText(window.location.href); setMessage("Onboarding link copied."); showToast({ title: "Onboarding link copied", tone: "success" }); } catch { setMessage("Unable to copy onboarding link."); } }
  async function copyActivationLink() { try { await navigator.clipboard.writeText(loginUrl); setMessage("Activation/login link copied."); showToast({ title: "Activation link copied", tone: "success" }); } catch { setMessage("Unable to copy activation/login link."); } }

  return <DetailPageShell>
    <DetailHeader eyebrow="Onboarding" title={<span className="inline-flex flex-wrap items-center gap-3">{onboarding.customer.companyName}<TenantStatusBadge value={onboarding.status} /></span>} description={`${getLifecycleLabel(onboarding.status)} ? ${onboarding.readiness.completionPercent}% ready`} />
    <CommandBar>
    <RecordRibbonBar left={<>
      <IconButton label="Back" onClick={() => router.push("/onboarding")}><ArrowLeft className="h-4 w-4" /></IconButton>
      <ActionButton disabled={readOnly} onClick={() => setIsEditing(true)}><Pencil className="h-4 w-4" />Edit</ActionButton>
      <ActionButton disabled={!isEditing || !isDirty || readOnly || isPending} onClick={handleSave}><Save className="h-4 w-4" />Save</ActionButton>
      <ActionButton disabled={!isEditing} onClick={cancelEdit}>Cancel</ActionButton>
      <ActionButton onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" />Refresh</ActionButton>
      <ActionButton onClick={handleShare}><Share2 className="h-4 w-4" />Share onboarding</ActionButton>
      <LinkButton href={`/customers/${onboarding.customer.id}`}><UserRound className="h-4 w-4" />View customer</LinkButton>
      {onboarding.tenant ? <LinkButton href={`/tenants/${onboarding.tenant.id}`}><Building2 className="h-4 w-4" />View tenant</LinkButton> : null}
      {!readOnly ? <ActionButton disabled={isPending || onboarding.status === "READY_FOR_TENANT_CREATION"} onClick={handleMarkReady}><CheckCircle2 className="h-4 w-4" />Mark ready</ActionButton> : null}
    </>} right={<span className={isDirty ? "text-sm font-medium text-amber-600" : "text-sm font-medium text-emerald-600"}>{isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : ""}</span>} />
    </CommandBar>
    <StatusPipeline current={onboarding.status} steps={["NOT_STARTED", "IN_PROGRESS", "READY_FOR_TENANT_CREATION", "COMPLETED"]} />
    <SummaryCards>
      <SummaryCard label="Owner" value={onboarding.onboardingOwnerUser ? `${onboarding.onboardingOwnerUser.firstName} ${onboarding.onboardingOwnerUser.lastName}` : "Unassigned"} />
      <SummaryCard label="Plan" value={onboarding.selectedPlan?.name ?? "Not selected"} />
      <SummaryCard label="Readiness" value={`${onboarding.readiness.completionPercent}%`} hint={`${onboarding.readiness.blockers.length} blocker(s)`} />
      <SummaryCard label="Tenant" value={onboarding.tenant?.name ?? "Not created"} hint={readOnly ? "Completed stage" : "Active work item"} />
    </SummaryCards>
    <FormSection title="Onboarding workspace" description={readOnly ? "Completed onboarding is preserved as a read-only lifecycle record." : "Transitions are handled by explicit actions, not unsafe manual status edits."}>
      <LifecycleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      {activeTab === "overview" ? <Overview isEditing={isEditing && !readOnly} form={form} updateForm={updateForm} plans={plans} /> : null}
      {activeTab === "provisioning" ? <Provisioning form={form} updateForm={updateForm} isEditing={isEditing && !readOnly} /> : null}
      {activeTab === "billing" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Plan" value={plans.find((p) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /><ReadOnlyField label="Billing cycle" value={form.billingCycle} /></div> : null}
      {activeTab === "tenant" ? <TenantSetup form={form} updateForm={updateForm} isEditing={isEditing && !readOnly} slugAvailability={slugAvailability} loginUrl={loginUrl} /> : null}
      {activeTab === "share" ? <div className="mt-6 space-y-4"><ReadOnlyField label="Onboarding URL" value={typeof window === "undefined" ? "Current record URL" : window.location.href} /><ReadOnlyField label="Activation / login URL" value={loginUrl} /><button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold" onClick={copyActivationLink} type="button"><Copy className="h-4 w-4" />Copy activation link</button><p className="text-sm text-amber-700">If email delivery is configured as Console or unavailable, use this copied link manually; onboarding remains valid.</p></div> : null}
      {activeTab === "activity" ? <EmptyState text="Audit timeline is ready for future event rendering." /> : null}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600">{readOnly ? "This onboarding stage is complete." : "Use readiness checks before tenant creation."}</div><button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={readOnly || !onboarding.readiness.isReadyForTenantCreation || slugAvailability === "unavailable" || isPending} onClick={handleCreateTenant} type="button">{onboarding.tenant ? "Tenant already created" : "Create tenant"}</button></div>
    </FormSection>
  </DetailPageShell>;
}
function Overview({ isEditing, form, updateForm, plans }: any) { if (!isEditing) return <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><ReadOnlyField label="Primary owner" value={`${form.primaryOwnerFirstName} ${form.primaryOwnerLastName}`.trim()} /><ReadOnlyField label="Primary owner email" value={form.primaryOwnerWorkEmail} /><ReadOnlyField label="Plan" value={plans.find((p: PlanOption) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /></div>; return <div className="mt-6 grid gap-4 lg:grid-cols-2"><Field label="Primary owner first name" value={form.primaryOwnerFirstName} onChange={(v: string) => updateForm("primaryOwnerFirstName", v)} /><Field label="Primary owner last name" value={form.primaryOwnerLastName} onChange={(v: string) => updateForm("primaryOwnerLastName", v)} /><Field label="Primary owner work email" type="email" value={form.primaryOwnerWorkEmail} onChange={(v: string) => updateForm("primaryOwnerWorkEmail", v)} /><Select label="Plan" value={form.selectedPlanId} onChange={(v: string) => updateForm("selectedPlanId", v)} options={[{ value: "", label: "Not selected" }, ...plans.map((p: PlanOption) => ({ value: p.id, label: p.name }))]} /><Select label="Billing cycle" value={form.billingCycle} onChange={(v: string) => updateForm("billingCycle", v)} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} /></div>; }
function Provisioning({ form, updateForm, isEditing }: any) { const items = [["Contract signed", "contractSigned"], ["Payment confirmed", "paymentConfirmed"], ["Configuration ready", "configurationReady"], ["Training planned", "trainingPlanned"]] as const; return <div className="mt-6 grid gap-3 sm:grid-cols-2">{items.map(([label, key]) => isEditing ? <Toggle key={key} label={label} checked={form[key]} onChange={(v: boolean) => updateForm(key, v)} /> : <ReadOnlyField key={key} label={label} value={form[key] ? "Complete" : "Pending"} />)}</div>; }
function TenantSetup({ form, updateForm, isEditing, slugAvailability, loginUrl }: any) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{isEditing ? <Field label="Tenant slug" value={form.tenantSlug} onChange={(v: string) => updateForm("tenantSlug", v.toLowerCase())} /> : <ReadOnlyField label="Tenant slug" value={form.tenantSlug} />}<ReadOnlyField label="Slug availability" value={slugAvailability} /><ReadOnlyField label="Login URL" value={loginUrl} /></div>; }
function IconButton({ label, onClick, children }: any) { return <button aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100" onClick={onClick} type="button">{children}</button>; }
function ActionButton({ children, onClick, disabled = false }: any) { return <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function LinkButton({ href, children }: any) { return <Link className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" href={href}>{children}</Link>; }
function Field({ label, value, onChange, type = "text" }: any) { return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)} type={type} /></label>; }
function Select({ label, value, onChange, options }: any) { return <label className="block text-sm font-medium text-slate-700">{label}<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o: any) => <option key={o.value || o.label} value={o.value}>{o.label}</option>)}</select></label>; }
function Toggle({ label, checked, onChange }: any) { return <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium"><input checked={checked} onChange={(e) => onChange(e.target.checked)} type="checkbox" />{label}</label>; }
function EmptyState({ text }: { text: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">{text}</div>; }

