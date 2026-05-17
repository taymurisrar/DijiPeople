"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, RefreshCw, Save, Share2, Trash2 } from "lucide-react";
import { OwnerSelector } from "@/app/_components/crm/owner-selector";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { SubStatusSelector } from "@/app/_components/crm/sub-status-selector";
import { CommandBar, DetailHeader, DetailPageShell, FormSection, ReadOnlyField, StatusPipeline, SummaryCard, SummaryCards } from "@/app/_components/ui/detail-page";
import { LifecycleTabs } from "@/app/_components/ui/lifecycle-tabs";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { getLifecycleLabel, isLeadReadOnly } from "@/lib/lifecycle";
import type { LeadRecord, LifecycleOptions, OperatorOption, PlanOption } from "./platform-lifecycle-types";

export function LeadDetailManager({ lead, lifecycleOptions, operators, plans }: { lead: LeadRecord; lifecycleOptions: LifecycleOptions; operators: OperatorOption[]; plans: PlanOption[]; }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "qualification" | "conversion" | "audit">("overview");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const initialForm = useMemo(() => ({
    contactFirstName: lead.contactFirstName ?? "",
    contactLastName: lead.contactLastName ?? "",
    companyName: lead.companyName ?? "",
    workEmail: lead.workEmail ?? "",
    phoneNumber: lead.phoneNumber ?? "",
    industry: lead.industry ?? "",
    companySize: lead.companySize ?? "",
    source: lead.source ?? "",
    interestedPlan: lead.interestedPlan ?? "",
    assignedToUserId: lead.assignedToUserId ?? "",
    status: lead.status,
    subStatus: lead.subStatus ?? "",
    notes: lead.notes ?? "",
    requirementsSummary: lead.requirementsSummary ?? "",
  }), [lead]);

  const [form, setForm] = useState(initialForm);
  const readOnly = isLeadReadOnly(lead.status, lead.convertedCustomer?.id);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const saveStateLabel = isDirty ? "Unsaved changes" : lastSaveSucceeded ? "Saved" : "";
  const fullName = [form.contactFirstName, form.contactLastName].filter(Boolean).join(" ").trim();

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setLastSaveSucceeded(false);
    setMessage(null);
  }

  function handleSave() {
    if (!isEditing || readOnly || !isDirty) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, interestedPlan: form.interestedPlan || undefined, assignedToUserId: form.assignedToUserId || undefined, subStatus: form.subStatus || undefined, notes: form.notes || undefined, requirementsSummary: form.requirementsSummary || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update lead.");
        return;
      }
      setMessage("Lead updated.");
      setLastSaveSucceeded(true);
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleConvert() {
    if (readOnly) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          primaryContactFirstName: form.contactFirstName,
          primaryContactLastName: form.contactLastName,
          primaryContactEmail: form.workEmail,
          primaryContactPhone: form.phoneNumber || undefined,
          industry: form.industry,
          companySize: form.companySize,
          selectedPlanId: plans.find((plan) => plan.name === form.interestedPlan)?.id ?? undefined,
          accountManagerUserId: form.assignedToUserId || undefined,
          status: "PROSPECT",
          subStatus: "Commercial review",
          leadSubStatus: "Converted to customer",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to convert lead.");
        return;
      }
      router.push(`/customers/${payload.id}`);
    });
  }

  function handleDelete() {
    if (readOnly || !window.confirm("Delete this lead?")) return;
    startTransition(async () => {
      const response = await fetch("/api/super-admin/leads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [lead.id] }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete lead.");
        return;
      }
      router.push("/leads");
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
    <DetailPageShell>
      <DetailHeader eyebrow="Lead" title={<span className="inline-flex flex-wrap items-center gap-3">{lead.companyName}<TenantStatusBadge value={lead.status} /></span>} description={`${lead.fullName} ? ${lead.workEmail} ? ${lead.source} ? Created ${new Date(lead.createdAt).toLocaleDateString()}`} />
      <CommandBar>
      <RecordRibbonBar left={<>
        <IconButton label="Back" onClick={() => router.push("/leads")}><ArrowLeft className="h-4 w-4" /></IconButton>
        <ActionButton onClick={() => router.push("/leads/new")}><Plus className="h-4 w-4" />New</ActionButton>
        <ActionButton disabled={readOnly} onClick={() => setIsEditing((current) => !current)}><Pencil className="h-4 w-4" />{isEditing ? "View" : "Edit"}</ActionButton>
        <ActionButton disabled={isPending || !isEditing || readOnly || !isDirty} onClick={handleSave}><Save className="h-4 w-4" />Save</ActionButton>
        <ActionButton onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" />Refresh</ActionButton>
        <ActionButton disabled={isPending || readOnly} onClick={handleDelete}><Trash2 className="h-4 w-4" />Delete</ActionButton>
        <ActionButton onClick={handleShare}><Share2 className="h-4 w-4" />Share</ActionButton>
      </>} right={<span className={saveStateLabel === "Unsaved changes" ? "text-sm font-medium text-amber-600" : "text-sm font-medium text-emerald-600"}>{saveStateLabel}</span>} />
      </CommandBar>

      {isEditing && !readOnly ? (
      <section className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-3">
        <StatusSelector label="Status" onChange={(value) => { updateForm("status", value); updateForm("subStatus", lifecycleOptions.lead.subStatuses[value]?.[0] ?? ""); }} options={lifecycleOptions.lead.statuses.map((value) => ({ value, label: getLifecycleLabel(value) }))} value={form.status} />
        <SubStatusSelector label="Sub-status" onChange={(value) => updateForm("subStatus", value)} options={[{ value: "", label: "None" }, ...(lifecycleOptions.lead.subStatuses[form.status] ?? []).map((value) => ({ value, label: value }))]} value={form.subStatus} />
        <OwnerSelector label="Owner" onChange={(value) => updateForm("assignedToUserId", value)} options={[{ value: "", label: "Unassigned" }, ...operators.map((operator) => ({ value: operator.id, label: operator.fullName }))]} value={form.assignedToUserId} />
      </section>
      ) : null}

      <StatusPipeline current={lead.status} steps={["NEW", "QUALIFIED", "CONVERTED", "ARCHIVED"]} />
      <SummaryCards>
        <SummaryCard label="Contact" value={fullName || "Unnamed lead"} />
        <SummaryCard label="Owner" value={lead.assignedToUser?.fullName ?? "Unassigned"} />
        <SummaryCard label="Source" value={lead.source} />
        <SummaryCard label="Lifecycle" value={readOnly ? "Completed" : "Active"} hint={readOnly ? "Read-only stage" : "Editable work item"} />
      </SummaryCards>

      <FormSection title={isEditing && !readOnly ? "Edit lead" : "Lead workspace"} description={readOnly ? "Converted leads remain visible for traceability, but no longer stay editable forever." : isEditing ? "Editing is explicit. Save to commit changes or switch back to view mode." : "View mode is read-only by default."}>
        <LifecycleTabs tabs={[{ key: "overview", label: "Overview" }, { key: "qualification", label: "Qualification" }, { key: "conversion", label: "Conversion" }, { key: "audit", label: "Audit Log" }]} activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === "overview" && isEditing && !readOnly ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="First name" onChange={(value) => updateForm("contactFirstName", value)} value={form.contactFirstName} />
              <Field label="Last name" onChange={(value) => updateForm("contactLastName", value)} value={form.contactLastName} />
              <Field label="Company" onChange={(value) => updateForm("companyName", value)} value={form.companyName} />
              <Field label="Work email" onChange={(value) => updateForm("workEmail", value)} type="email" value={form.workEmail} />
              <Field label="Phone" onChange={(value) => updateForm("phoneNumber", value.replace(/[^+()\-.\s0-9]/g, ""))} value={form.phoneNumber} />
              <Select label="Industry" onChange={(value) => updateForm("industry", value)} options={lifecycleOptions.industries} value={form.industry} />
              <Select label="Company size" onChange={(value) => updateForm("companySize", value)} options={lifecycleOptions.companySizes} value={form.companySize} />
              <Select label="Source" onChange={(value) => updateForm("source", value)} options={[{ value: "", label: "Select source" }, ...lifecycleOptions.lead.sources]} value={form.source} />
              <Select label="Interested plan" onChange={(value) => updateForm("interestedPlan", value)} options={[{ value: "", label: "Not specified" }, ...plans.map((plan) => ({ value: plan.name, label: plan.name }))]} value={form.interestedPlan} />
            </div>
            <div className="mt-4 grid gap-4">
              <TextArea label="Requirements summary" onChange={(value) => updateForm("requirementsSummary", value)} value={form.requirementsSummary} />
              <TextArea label="Internal notes" onChange={(value) => updateForm("notes", value)} value={form.notes} />
            </div>
          </>
        ) : activeTab === "overview" ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ReadOnlyField label="First name" value={form.contactFirstName} />
            <ReadOnlyField label="Last name" value={form.contactLastName} />
            <ReadOnlyField label="Company" value={form.companyName} />
            <ReadOnlyField label="Work email" value={form.workEmail} />
            <ReadOnlyField label="Phone" value={form.phoneNumber} />
            <ReadOnlyField label="Industry" value={form.industry} />
            <ReadOnlyField label="Company size" value={form.companySize} />
            <ReadOnlyField label="Source" value={form.source} />
            <ReadOnlyField label="Interested plan" value={form.interestedPlan} />
          </div>
        ) : null}
        {activeTab === "qualification" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Interested plan" value={form.interestedPlan} /><ReadOnlyField label="Requirements summary" value={form.requirementsSummary} /><ReadOnlyField label="Owner" value={lead.assignedToUser?.fullName ?? "Unassigned"} /><ReadOnlyField label="Sub-status" value={form.subStatus} /></div> : null}
        {activeTab === "conversion" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><ReadOnlyField label="Conversion state" value={readOnly ? "Converted / completed" : "Ready when qualified"} /><ReadOnlyField label="Linked customer" value={lead.convertedCustomer?.companyName ?? "Not converted yet"} /></div> : null}
        {activeTab === "audit" ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">Audit events will appear here as lifecycle actions are recorded.</div> : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{message ?? (readOnly ? "This lifecycle stage is complete." : "Keep the lead qualified before conversion.")}</div>
          <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isPending || readOnly} onClick={handleConvert} type="button">Convert to customer</button>
        </div>
      </FormSection>
    </DetailPageShell>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100" onClick={onClick} title={label} type="button">{children}</button>;
}
function ActionButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}</select></label>;
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}
