"use client";

import Link from "next/link";
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
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "./platform-lifecycle-types";

type TabKey =
  | "overview"
  | "lifecycle"
  | "onboarding"
  | "tenants"
  | "subscriptions"
  | "payments"
  | "invoices"
  | "notes";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "onboarding", label: "Onboarding" },
  { key: "tenants", label: "Tenants" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "payments", label: "Payments" },
  { key: "invoices", label: "Invoices" },
  { key: "notes", label: "Notes / Activity" },
];

function nonEmpty(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

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
    onboardings?: Array<{
      id: string;
      status: string;
      subStatus?: string | null;
      tenantCreated: boolean;
    }>;
  };
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(false);

  const initialForm = useMemo(
    () => ({
      companyName: customer.companyName ?? "",
      primaryContactFirstName: customer.primaryContactFirstName ?? "",
      primaryContactLastName: customer.primaryContactLastName ?? "",
      primaryContactEmail: customer.primaryContactEmail ?? "",
      primaryContactPhone: customer.primaryContactPhone ?? "",
      industry: customer.industry ?? "",
      companySize: customer.companySize ?? "",
      country: customer.country ?? "",
      preferredBillingCycle: customer.preferredBillingCycle ?? "",
      status: customer.status,
      subStatus: customer.subStatus ?? "",
      selectedPlanId: customer.selectedPlan?.id ?? "",
      accountManagerUserId: customer.accountManagerUser?.id ?? "",
    }),
    [customer],
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

  const fullName = [
    form.primaryContactFirstName,
    form.primaryContactLastName,
  ]
    .filter((value) => value?.trim())
    .join(" ")
    .trim();

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const saveStateLabel = isDirty
    ? "Unsaved changes"
    : lastSaveSucceeded
      ? "Saved"
      : "";

  const entityLogicalName = "customer";
  const formDisplayName = "Default";

  const prerequisites = customer.onboardingPrerequisites;
  const canStartOnboarding = Boolean(prerequisites?.allPassed);

  function handleSave() {
    setMessage(null);
    setLastSaveSucceeded(false);

    const primaryContactEmail = nonEmpty(form.primaryContactEmail);
    const selectedPlanId = nonEmpty(form.selectedPlanId);

    if (primaryContactEmail && !isValidEmail(primaryContactEmail)) {
      setMessage("Primary contact email must be a valid email address.");
      return;
    }

    if (selectedPlanId && !isValidUuid(selectedPlanId)) {
      setMessage("Selected plan must be a valid UUID.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: nonEmpty(form.companyName),
          primaryContactFirstName: nonEmpty(form.primaryContactFirstName),
          primaryContactLastName: nonEmpty(form.primaryContactLastName),
          primaryContactEmail: primaryContactEmail?.toLowerCase(),
          primaryContactPhone: nonEmpty(form.primaryContactPhone),
          industry: nonEmpty(form.industry),
          companySize: nonEmpty(form.companySize),
          country: nonEmpty(form.country),
          preferredBillingCycle: nonEmpty(form.preferredBillingCycle),
          status: nonEmpty(form.status),
          subStatus: nonEmpty(form.subStatus),
          selectedPlanId,
          accountManagerUserId: nonEmpty(form.accountManagerUserId),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update customer.");
        return;
      }

      setMessage("Customer updated.");
      setLastSaveSucceeded(true);
      router.refresh();
    });
  }

  function handleStartOnboarding() {
    setMessage(null);

    const primaryOwnerWorkEmail = nonEmpty(form.primaryContactEmail);
    const selectedPlanId = nonEmpty(form.selectedPlanId);

    if (!primaryOwnerWorkEmail || !isValidEmail(primaryOwnerWorkEmail)) {
      setMessage("Primary contact email must be valid before onboarding.");
      return;
    }

    if (selectedPlanId && !isValidUuid(selectedPlanId)) {
      setMessage("Selected plan must be a valid UUID.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/customers/${customer.id}/start-onboarding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPlanId,
            primaryOwnerFirstName: nonEmpty(form.primaryContactFirstName),
            primaryOwnerLastName: nonEmpty(form.primaryContactLastName),
            primaryOwnerWorkEmail,
            primaryOwnerPhone: nonEmpty(form.primaryContactPhone),
            billingCycle: form.preferredBillingCycle || "MONTHLY",
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

  function handleDelete() {
    const confirmed = window.confirm("Delete this customer?");
    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [customer.id] }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete customer.");
        return;
      }

      router.push("/customers");
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
      description={`${form.primaryContactEmail || "No primary email"} • ${
        form.country || "No country"
      } • ${form.status.replaceAll("_", " ")}`}
      title={form.companyName || "Unnamed customer"}
      ribbon={
        <div className="flex flex-col gap-3">
          <RecordRibbonBar
            left={
              <>
                <button
                  aria-label="Back"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/customers")}
                  title="Back"
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => router.push("/customers/new")}
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
                  disabled={isPending || Boolean(customer.tenant)}
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
                  {fullName || form.companyName || "Unnamed customer"}
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
                      lifecycleOptions.customer.subStatuses[value]?.[0] ?? "",
                    );
                  }}
                  options={lifecycleOptions.customer.statuses.map((value) => ({
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
                    ...(lifecycleOptions.customer.subStatuses[
                      form.status
                    ] ?? []).map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                  value={form.subStatus}
                />
              </div>

              <div className="min-w-36">
                <OwnerSelector
                  label="Account manager"
                  onChange={(value) =>
                    updateForm("accountManagerUserId", value)
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...operators.map((operator) => ({
                      value: operator.id,
                      label: operator.fullName,
                    })),
                  ]}
                  value={form.accountManagerUserId}
                />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" ? (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Field
                label="Company"
                onChange={(value) => updateForm("companyName", value)}
                value={form.companyName}
              />

              <Field
                label="Primary first name"
                onChange={(value) =>
                  updateForm("primaryContactFirstName", value)
                }
                value={form.primaryContactFirstName}
              />

              <Field
                label="Primary last name"
                onChange={(value) =>
                  updateForm("primaryContactLastName", value)
                }
                value={form.primaryContactLastName}
              />

              <Field
                label="Primary email"
                onChange={(value) => updateForm("primaryContactEmail", value)}
                type="email"
                value={form.primaryContactEmail}
              />

              <Field
                label="Primary phone"
                onChange={(value) => updateForm("primaryContactPhone", value)}
                value={form.primaryContactPhone}
              />

              <Select
                label="Industry"
                onChange={(value) => updateForm("industry", value)}
                options={[
                  { value: "", label: "Not specified" },
                  ...lifecycleOptions.industries,
                ]}
                value={form.industry}
              />

              <Select
                label="Company size"
                onChange={(value) => updateForm("companySize", value)}
                options={[
                  { value: "", label: "Not specified" },
                  ...lifecycleOptions.companySizes,
                ]}
                value={form.companySize}
              />

              <Field
                label="Country"
                onChange={(value) => updateForm("country", value)}
                value={form.country}
              />

              <Select
                label="Preferred billing cycle"
                onChange={(value) =>
                  updateForm("preferredBillingCycle", value)
                }
                options={[
                  { value: "", label: "Not specified" },
                  { value: "MONTHLY", label: "MONTHLY" },
                  { value: "ANNUAL", label: "ANNUAL" },
                ]}
                value={form.preferredBillingCycle}
              />

              <Select
                label="Selected plan"
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
            </div>

            <FooterActions
              message={
                message ?? "Save profile updates before lifecycle actions."
              }
              isPending={isPending}
              onSave={handleSave}
            />
          </>
        ) : null}

        {activeTab === "lifecycle" ? (
          <div className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Info
                label="Status"
                value={
                  customer.lifecycle?.currentStatus?.replaceAll("_", " ") ??
                  customer.status.replaceAll("_", " ")
                }
              />
              <Info
                label="Sub-status"
                value={customer.lifecycle?.subStatus ?? customer.subStatus ?? "None"}
              />
              <Info
                label="Active onboarding"
                value={customer.lifecycle?.activeOnboardingStatus ?? "None"}
              />
              <Info
                label="Tenant count"
                value={String(
                  customer.lifecycle?.tenantCount ??
                    customer.tenants?.length ??
                    0,
                )}
              />
              <Info
                label="Active tenants"
                value={String(customer.lifecycle?.activeTenantCount ?? 0)}
              />
              <Info
                label="Next renewal"
                value={formatDate(customer.lifecycle?.nextRenewalDate)}
              />
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Onboarding prerequisites
              </h3>

              <div className="mt-3 space-y-2">
                {(prerequisites?.checks ?? []).map((check) => (
                  <div
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    key={check.key}
                  >
                    <span className="text-sm text-slate-700">
                      {check.label}
                    </span>
                    <span
                      className={
                        check.passed
                          ? "text-sm font-semibold text-emerald-700"
                          : "text-sm font-semibold text-amber-700"
                      }
                    >
                      {check.passed ? "Ready" : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                {message ??
                  (canStartOnboarding
                    ? "Customer is ready for onboarding."
                    : "Complete prerequisites before starting onboarding.")}
              </div>

              <button
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isPending || !canStartOnboarding}
                onClick={handleStartOnboarding}
                type="button"
              >
                Start onboarding
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "onboarding" ? (
          <RelatedOnboarding onboardings={customer.onboardings ?? []} />
        ) : null}

        {activeTab === "tenants" ? (
          <SimpleTable
            columns={["Name", "Slug", "Status"]}
            emptyText="No tenants linked to this customer."
            rows={(customer.tenants ?? []).map((tenant) => [
              tenant.name,
              tenant.slug,
              tenant.status,
            ])}
            title="Tenants"
          />
        ) : null}

        {activeTab === "subscriptions" ? (
          <SimpleTable
            columns={["Plan", "Status", "Billing", "Price"]}
            emptyText="No subscriptions found for this customer."
            rows={(customer.subscriptions ?? []).map((subscription) => [
              subscription.plan.name,
              subscription.status,
              subscription.billingCycle,
              `${subscription.currency} ${Number(
                subscription.finalPrice,
              ).toFixed(2)}`,
            ])}
            title="Subscriptions"
          />
        ) : null}

        {activeTab === "payments" ? (
          <SimpleTable
            columns={["Amount", "Status", "Method", "Paid at"]}
            emptyText="No payments found for this customer."
            rows={(customer.payments ?? []).map((payment) => [
              `${payment.currency} ${Number(payment.amount).toFixed(2)}`,
              payment.status,
              payment.paymentMethod,
              formatDate(payment.paidAt),
            ])}
            title="Payments"
          />
        ) : null}

        {activeTab === "invoices" ? (
          <SimpleTable
            columns={["Invoice #", "Amount", "Status", "Due date"]}
            emptyText="No invoices found for this customer."
            rows={(customer.invoices ?? []).map((invoice) => [
              invoice.invoiceNumber,
              `${invoice.currency} ${Number(invoice.amount).toFixed(2)}`,
              invoice.status,
              formatDate(invoice.dueDate),
            ])}
            title="Invoices"
          />
        ) : null}

        {activeTab === "notes" ? (
          <RelatedNotes notes={customer.notes ?? []} />
        ) : null}
      </section>
    </ModuleDetailLayout>
  );
}

function FooterActions({
  message,
  isPending,
  onSave,
}: {
  message: string;
  isPending: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-slate-600">{message}</div>

      <button
        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        disabled={isPending}
        onClick={onSave}
        type="button"
      >
        {isPending ? "Saving..." : "Save customer"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 font-medium text-slate-950">{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
      {text}
    </div>
  );
}

function RelatedOnboarding({
  onboardings,
}: {
  onboardings: Array<{
    id: string;
    status: string;
    subStatus?: string | null;
    tenantCreated: boolean;
  }>;
}) {
  if (onboardings.length === 0) {
    return <EmptyState text="No onboarding records yet." />;
  }

  return (
    <div className="mt-6 space-y-3">
      {onboardings.map((item) => (
        <Link
          key={item.id}
          href={`/onboarding/${item.id}`}
          className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-slate-300"
        >
          <div className="font-medium text-slate-950">
            {item.status.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {item.subStatus ?? "No sub-status"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {item.tenantCreated ? "Tenant created" : "Tenant not created"}
          </div>
        </Link>
      ))}
    </div>
  );
}

function RelatedNotes({
  notes,
}: {
  notes: Array<{ id: string; note: string; createdAt: string }>;
}) {
  if (notes.length === 0) {
    return <EmptyState text="No notes recorded for this customer." />;
  }

  return (
    <div className="mt-6 space-y-3">
      {notes.map((note) => (
        <article
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
          key={note.id}
        >
          <p className="text-sm text-slate-800">{note.note}</p>
          <p className="mt-2 text-xs text-slate-500">
            {formatDate(note.createdAt)}
          </p>
        </article>
      ))}
    </div>
  );
}

function SimpleTable({
  title,
  columns,
  rows,
  emptyText,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
                  key={column}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    className="border-b border-slate-100 px-3 py-3 text-slate-700"
                    key={`${title}-${index}-${cellIndex}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}