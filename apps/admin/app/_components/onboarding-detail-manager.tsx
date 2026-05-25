"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, Copy, Power, RefreshCw, RotateCcw, Save, Share2, UserRound } from "lucide-react";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { CommandBar, DetailHeader, DetailPageShell, FormSection, ReadOnlyField, SummaryCard, SummaryCards } from "@/app/_components/ui/detail-page";
import { LifecycleTabs } from "@/app/_components/ui/lifecycle-tabs";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { useToastNotice } from "@/app/_components/ui/toast-provider";
import { isOnboardingReadOnly, getLifecycleLabel } from "@/lib/lifecycle";
import { buildTenantLoginUrl } from "@/lib/tenant-url";
import { suggestTenantSlug, validateTenantSlug } from "@/lib/tenant-slug";
import { CrmStatusPipeline } from "@/app/_components/crm-status-pipeline";
import { buildPipelineStagesFromLifecycle, entityPipelineConfigs, getMissingPipelineFields, type PipelineStage } from "@/app/_components/entity-pipeline-config";
import { OwnerStatusDropdown } from "@/app/_components/lead-crm-form";
import { StickyNotification } from "@/app/_components/notifications/app-notification";
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

export function OnboardingDetailManager({ onboarding, lifecycleOptions, operators, plans }: { onboarding: CustomerOnboardingRecord; lifecycleOptions: LifecycleOptions; operators: OperatorOption[]; plans: PlanOption[]; }) {
  const router = useRouter();
  const { showToast } = useToastNotice();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    status: onboarding.status,
    subStatus: onboarding.subStatus ?? "",
  }), [onboarding]);
  const [form, setForm] = useState(initialForm);
  const readOnly = isOnboardingReadOnly(onboarding.status, onboarding.tenant?.id, onboarding.tenantCreated);
  const editable = !readOnly;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const slugValidationError = validateTenantSlug(form.tenantSlug);
  const loginUrl = buildTenantLoginUrl(form.tenantSlug);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((c) => ({ ...c, [key]: value })); setFieldErrors((current) => { const next = { ...current }; delete next[key]; return next; }); setLastSaveSucceeded(false); setMessage(null); }
  function cancelEdit() { setForm(initialForm); setFieldErrors({}); setMessage(null); }
  function validateForm() {
    const errors: Record<string, string> = {};
    if (!form.tenantSlug.trim()) errors.tenantSlug = "Tenant slug is required.";
    else if (slugValidationError) errors.tenantSlug = slugValidationError;
    if (!form.primaryOwnerFirstName.trim()) errors.primaryOwnerFirstName = "Primary owner first name is required.";
    if (!form.primaryOwnerLastName.trim()) errors.primaryOwnerLastName = "Primary owner last name is required.";
    if (!emailPattern.test(form.primaryOwnerWorkEmail)) errors.primaryOwnerWorkEmail = "Primary owner email must be valid.";
    if (!form.selectedPlanId) errors.selectedPlanId = "Plan is required.";
    if (!form.billingCycle) errors.billingCycle = "Billing cycle is required.";
    return errors;
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
    if (readOnly || !isDirty) return;
    const errors = validateForm(); if (Object.keys(errors).length) { setFieldErrors(errors); return setMessage(Object.values(errors)[0] ?? "Review the highlighted fields."); }
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildUpdatePayload(form)) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) { const apiFieldErrors = getApiFieldErrors(payload); setFieldErrors(apiFieldErrors); return setMessage(Object.values(apiFieldErrors)[0] ?? payload?.message ?? "Unable to update onboarding."); }
      setLastSaveSucceeded(true); setMessage("Onboarding updated."); showToast({ title: "Onboarding updated", tone: "success" }); router.refresh();
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
    const errors = validateForm(); if (Object.keys(errors).length) { setFieldErrors(errors); return setMessage(Object.values(errors)[0] ?? "Review the highlighted fields."); }
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
  function handleStageChange(stage: PipelineStage) {
    if (applyMissingFieldErrors(stage) || readOnly) return;
    const nextForm = { ...form, status: stage.statusValue, subStatus: stage.subStatusValue ?? form.subStatus };
    setForm(nextForm);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customer-onboarding/${onboarding.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildUpdatePayload(nextForm)) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setMessage(payload?.message ?? "Unable to update onboarding stage.");
      showToast({ title: "Onboarding stage updated", tone: "success" });
      router.refresh();
    });
  }
  function handleActivation() {
    const activate = ["BLOCKED", "CANCELED", "COMPLETED"].includes(String(form.status));
    const targetStatus = activate ? "IN_PROGRESS" : "BLOCKED";
    const stage = entityPipelineConfigs.onboarding.stages.find((item) => item.statusValue === targetStatus);
    if (!stage) return;
    handleStageChange(stage);
  }

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...operators.map((operator) => ({ value: operator.id, label: operator.fullName || `${operator.firstName} ${operator.lastName}`.trim() || operator.email })),
  ];
  const statusGroup = lifecycleOptions.onboarding ?? lifecycleOptions.customerOnboarding;
  const statusOptions = statusGroup.statuses.map((status) => ({ value: status.value, label: status.label }));
  const subStatusOptions = (statusGroup.subStatuses[form.status] ?? []).map((subStatus) => ({ value: subStatus, label: subStatus }));

  return <DetailPageShell>
    <DetailHeader eyebrow="Onboarding" title={<span className="inline-flex flex-wrap items-center gap-3">{onboarding.customer.companyName}<TenantStatusBadge value={onboarding.status} /></span>} description={`${getLifecycleLabel(onboarding.status)} ? ${onboarding.readiness.completionPercent}% ready`} />
    <CommandBar>
    <RecordRibbonBar left={
      <IconButton label="Back" onClick={() => router.push("/onboarding")}><ArrowLeft className="h-4 w-4" /></IconButton>
    } right={<>
      <ActionButton disabled={readOnly || isPending} onClick={handleActivation}><Power className="h-4 w-4" />{["BLOCKED", "CANCELED", "COMPLETED"].includes(String(form.status)) ? "Activate" : "Deactivate"}</ActionButton>
      <ActionButton disabled={!isDirty || readOnly || isPending} onClick={handleSave}><Save className="h-4 w-4" />Save</ActionButton>
      <ActionButton disabled={!isDirty} onClick={cancelEdit}><RotateCcw className="h-4 w-4" />Reset</ActionButton>
      <ActionButton onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" />Refresh</ActionButton>
      <ActionButton onClick={handleShare}><Share2 className="h-4 w-4" />Share onboarding</ActionButton>
      <LinkButton href={`/customers/${onboarding.customer.id}`}><UserRound className="h-4 w-4" />View customer</LinkButton>
      {onboarding.tenant ? <LinkButton href={`/tenants/${onboarding.tenant.id}`}><Building2 className="h-4 w-4" />View tenant</LinkButton> : null}
      {!readOnly ? <ActionButton disabled={isPending || onboarding.status === "READY_FOR_TENANT_CREATION"} onClick={handleMarkReady}><CheckCircle2 className="h-4 w-4" />Mark ready</ActionButton> : null}
      <span className={isDirty ? "whitespace-nowrap text-sm font-medium text-amber-600" : "whitespace-nowrap text-sm font-medium text-emerald-600"}>{isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : ""}</span>
      <OwnerStatusDropdown disabled={readOnly} ownerLabel="Owner" ownerOptions={ownerOptions} ownerValue={form.onboardingOwnerUserId} statusLabel="Lifecycle" statusOptions={statusOptions} statusValue={form.status} subStatusOptions={subStatusOptions} subStatusValue={form.subStatus} onOwnerChange={(value) => updateForm("onboardingOwnerUserId", value)} onStatusChange={(value) => updateForm("status", value)} onSubStatusChange={(value) => updateForm("subStatus", value)} />
    </>} />
    </CommandBar>
    <CrmStatusPipeline currentStatus={form.status} disabled={readOnly || isPending} form={form} onStageChange={handleStageChange} stages={buildPipelineStagesFromLifecycle("onboarding", statusGroup.statuses)} />
    {readOnly ? (
      <StickyNotification
        storageKey={`onboarding-read-only-${onboarding.id}`}
        title="Read-only onboarding"
        tone="info"
      >
        This onboarding record is complete and read-only. Historical details,
        readiness state, and tenant creation information remain available.
      </StickyNotification>
    ) : null}
    <SummaryCards>
      <SummaryCard label="Owner" value={onboarding.onboardingOwnerUser ? `${onboarding.onboardingOwnerUser.firstName} ${onboarding.onboardingOwnerUser.lastName}` : "Unassigned"} />
      <SummaryCard label="Plan" value={onboarding.selectedPlan?.name ?? "Not selected"} />
      <SummaryCard label="Readiness" value={`${onboarding.readiness.completionPercent}%`} hint={`${onboarding.readiness.blockers.length} blocker(s)`} />
      <SummaryCard label="Tenant" value={onboarding.tenant?.name ?? "Not created"} hint={readOnly ? "Completed stage" : "Active work item"} />
    </SummaryCards>
    <FormSection title="Onboarding workspace" description={readOnly ? "Completed onboarding is preserved as a read-only lifecycle record." : "Transitions are handled by explicit actions, not unsafe manual status edits."}>
      <LifecycleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      {activeTab === "overview" ? <Overview isEditing={editable} form={form} updateForm={updateForm} plans={plans} fieldErrors={fieldErrors} /> : null}
      {activeTab === "provisioning" ? <Provisioning fieldErrors={fieldErrors} form={form} updateForm={updateForm} isEditing={editable} /> : null}
      {activeTab === "billing" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Plan" value={plans.find((p) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /><ReadOnlyField label="Billing cycle" value={form.billingCycle} /></div> : null}
      {activeTab === "tenant" ? <TenantSetup form={form} updateForm={updateForm} isEditing={editable} slugAvailability={slugAvailability} loginUrl={loginUrl} fieldErrors={fieldErrors} /> : null}
      {activeTab === "share" ? <div className="mt-6 space-y-4"><ReadOnlyField label="Onboarding URL" value={typeof window === "undefined" ? "Current record URL" : window.location.href} /><ReadOnlyField label="Activation / login URL" value={loginUrl} /><button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold" onClick={copyActivationLink} type="button"><Copy className="h-4 w-4" />Copy activation link</button><p className="text-sm text-amber-700">If email delivery is configured as Console or unavailable, use this copied link manually; onboarding remains valid.</p></div> : null}
      {activeTab === "activity" ? <EmptyState text="Audit timeline is ready for future event rendering." /> : null}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600">{readOnly ? "This onboarding stage is complete." : "Use readiness checks before tenant creation."}</div><button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={readOnly || !onboarding.readiness.isReadyForTenantCreation || slugAvailability === "unavailable" || isPending} onClick={handleCreateTenant} type="button">{onboarding.tenant ? "Tenant already created" : "Create tenant"}</button></div>
    </FormSection>
  </DetailPageShell>;
}
function Overview({ isEditing, form, updateForm, plans, fieldErrors }: any) { if (!isEditing) return <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><ReadOnlyField label="Primary owner" value={`${form.primaryOwnerFirstName} ${form.primaryOwnerLastName}`.trim()} /><ReadOnlyField label="Primary owner email" value={form.primaryOwnerWorkEmail} /><ReadOnlyField label="Plan" value={plans.find((p: PlanOption) => p.id === form.selectedPlanId)?.name ?? "Not selected"} /></div>; return <div className="mt-6 grid gap-4 lg:grid-cols-2"><Field fieldKey="primaryOwnerFirstName" label="Primary owner first name" value={form.primaryOwnerFirstName} error={fieldErrors.primaryOwnerFirstName} onChange={(v: string) => updateForm("primaryOwnerFirstName", v)} /><Field fieldKey="primaryOwnerLastName" label="Primary owner last name" value={form.primaryOwnerLastName} error={fieldErrors.primaryOwnerLastName} onChange={(v: string) => updateForm("primaryOwnerLastName", v)} /><Field fieldKey="primaryOwnerWorkEmail" label="Primary owner work email" type="email" value={form.primaryOwnerWorkEmail} error={fieldErrors.primaryOwnerWorkEmail} onChange={(v: string) => updateForm("primaryOwnerWorkEmail", v)} /><Select fieldKey="selectedPlanId" label="Plan" value={form.selectedPlanId} error={fieldErrors.selectedPlanId} onChange={(v: string) => updateForm("selectedPlanId", v)} options={[{ value: "", label: "Not selected" }, ...plans.map((p: PlanOption) => ({ value: p.id, label: p.name }))]} /><Select fieldKey="billingCycle" label="Billing cycle" value={form.billingCycle} error={fieldErrors.billingCycle} onChange={(v: string) => updateForm("billingCycle", v)} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "ANNUAL", label: "Annual" }]} /></div>; }
function Provisioning({ fieldErrors, form, updateForm, isEditing }: any) { const items = [["Contract signed", "contractSigned"], ["Payment confirmed", "paymentConfirmed"], ["Configuration ready", "configurationReady"], ["Training planned", "trainingPlanned"]] as const; return <div className="mt-6 grid gap-3 sm:grid-cols-2">{items.map(([label, key]) => isEditing ? <Toggle key={key} fieldKey={key} error={fieldErrors[key]} label={label} checked={form[key]} onChange={(v: boolean) => updateForm(key, v)} /> : <ReadOnlyField key={key} label={label} value={form[key] ? "Complete" : "Pending"} />)}</div>; }
function TenantSetup({ form, updateForm, isEditing, slugAvailability, loginUrl, fieldErrors }: any) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{isEditing ? <Field fieldKey="tenantSlug" label="Tenant slug" value={form.tenantSlug} error={fieldErrors.tenantSlug} onChange={(v: string) => updateForm("tenantSlug", v.toLowerCase())} /> : <ReadOnlyField label="Tenant slug" value={form.tenantSlug} />}<ReadOnlyField label="Slug availability" value={slugAvailability} /><ReadOnlyField label="Login URL" value={loginUrl} /></div>; }
function IconButton({ label, onClick, children }: any) { return <button aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100" onClick={onClick} type="button">{children}</button>; }
function ActionButton({ children, onClick, disabled = false }: any) { return <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function LinkButton({ href, children }: any) { return <Link className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" href={href}>{children}</Link>; }
function Field({ label, value, onChange, type = "text", error, fieldKey }: any) { return <label className="block text-sm font-medium text-slate-700">{label}<input aria-invalid={Boolean(error)} className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400 bg-red-50" : "border-slate-300"}`} data-field-key={fieldKey} value={value} onChange={(e) => onChange(e.target.value)} type={type} />{error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : null}</label>; }
function Select({ label, value, onChange, options, error, fieldKey }: any) { return <label className="block text-sm font-medium text-slate-700">{label}<select aria-invalid={Boolean(error)} className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400 bg-red-50" : "border-slate-300"}`} data-field-key={fieldKey} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o: any) => <option key={o.value || o.label} value={o.value}>{o.label}</option>)}</select>{error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : null}</label>; }
function Toggle({ label, checked, onChange, error, fieldKey }: any) { return <label className={`flex items-center gap-3 rounded-2xl border bg-slate-50 px-4 py-4 text-sm font-medium ${error ? "border-red-400" : "border-slate-200"}`} title={error}><input checked={checked} data-field-key={fieldKey} onChange={(e) => onChange(e.target.checked)} type="checkbox" />{label}{error ? <span className="ml-auto text-xs font-medium text-red-600">Required</span> : null}</label>; }
function EmptyState({ text }: { text: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">{text}</div>; }

function buildUpdatePayload(form: Record<string, any>) {
  return {
    onboardingOwnerUserId: form.onboardingOwnerUserId || undefined,
    selectedPlanId: form.selectedPlanId || undefined,
    billingCycle: form.billingCycle,
    primaryOwnerFirstName: form.primaryOwnerFirstName,
    primaryOwnerLastName: form.primaryOwnerLastName,
    primaryOwnerWorkEmail: form.primaryOwnerWorkEmail,
    createServiceAccount: form.createServiceAccount,
    serviceAccountEmail: form.serviceAccountEmail || undefined,
    serviceAccountDisplayName: form.serviceAccountDisplayName || undefined,
    serviceAccountAssignSystemAdmin: form.serviceAccountAssignSystemAdmin,
    plannedTenantSlug: form.tenantSlug.trim().toLowerCase(),
    contractSigned: form.contractSigned,
    paymentConfirmed: form.paymentConfirmed,
    configurationReady: form.configurationReady,
    trainingPlanned: form.trainingPlanned,
    notes: form.notes || undefined,
    status: form.status,
    subStatus: form.subStatus || undefined,
  };
}

function getApiFieldErrors(payload: any) {
  const fields = payload?.details?.fields;
  if (!Array.isArray(fields)) return {};
  return fields.reduce((errors: Record<string, string>, item: any) => {
    const field = item?.field === "plannedTenantSlug" ? "tenantSlug" : item?.field;
    if (typeof field === "string" && typeof item?.message === "string") errors[field] = item.message;
    return errors;
  }, {});
}

