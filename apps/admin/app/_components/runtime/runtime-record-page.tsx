"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { PageHeader } from "@/app/_components/ui/page-header";
import { createHttpModuleRuntimeAdapter } from "@/lib/runtime/http-module-runtime-adapter";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type {
  PlatformModuleKey,
  RuntimeActionDefinition,
  RuntimeColumnDefinition,
  RuntimeRecord,
} from "@/lib/runtime/platform-runtime.types";
import { getRuntimeSchema } from "@repo/config";
import { ModuleActionBar } from "./module-action-bar";
import {
  PlanPriceManager,
  type PlanPriceRecord,
} from "@/app/_components/plan-price-manager";
import {
  RuntimeForm,
  useRuntimeFormState,
  validateRuntimeValues,
} from "./runtime-form";

export function RuntimeRecordPage({
  moduleKey,
  recordId,
  roleKeys,
  permissionKeys,
  initialValues = {},
}: {
  moduleKey: PlatformModuleKey;
  recordId?: string;
  roleKeys: string[];
  permissionKeys: string[];
  initialValues?: Record<string, unknown>;
}) {
  const adapter = useMemo(
    () => createHttpModuleRuntimeAdapter(moduleKey),
    [moduleKey],
  );
  const definition = useMemo(
    () => getPlatformModuleDefinition(moduleKey),
    [moduleKey],
  );
  const [record, setRecord] = useState<RuntimeRecord | null>(
    recordId ? null : ({ id: "", ...initialValues } as RuntimeRecord),
  );
  const [version, setVersion] = useState<number | undefined>();
  const [loading, setLoading] = useState(Boolean(recordId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) return;
    const controller = new AbortController();
    adapter
      .getRecord(recordId)
      .then((response) => {
        setRecord(response.item);
        setVersion(response.version);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load the record.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [adapter, recordId]);

  if (loading) return <RuntimeRecordSkeleton title={definition.displayName} />;
  if (error || !record)
    return <RuntimeRecordError message={error ?? "Record was not found."} />;
  return (
    <RuntimeRecordEditor
      key={`${record.id}-${version ?? "new"}`}
      moduleKey={moduleKey}
      record={record}
      version={version}
      roleKeys={roleKeys}
      permissionKeys={permissionKeys}
    />
  );
}

function RuntimeRecordEditor({
  moduleKey,
  record,
  version,
  roleKeys,
  permissionKeys,
}: {
  moduleKey: PlatformModuleKey;
  record: RuntimeRecord;
  version?: number;
  roleKeys: string[];
  permissionKeys: string[];
}) {
  const router = useRouter();
  const definition = useMemo(
    () => getPlatformModuleDefinition(moduleKey),
    [moduleKey],
  );
  const adapter = useMemo(
    () => createHttpModuleRuntimeAdapter(moduleKey),
    [moduleKey],
  );
  const isCreate = !record.id;
  const [mode, setMode] = useState<"create" | "read" | "edit">(
    isCreate ? "create" : "read",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<Array<Record<string, unknown>>>([]);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const runtimeRecord = useMemo(() => {
    if (moduleKey !== "contracts" || !Array.isArray(record.versions))
      return record;
    const versions = record.versions as Array<Record<string, unknown>>;
    const current =
      versions.find(
        (item) => Number(item.version) === Number(record.currentVersionNumber),
      ) ?? versions[0];
    return { ...record, contentHtml: current?.contentHtml ?? "" };
  }, [moduleKey, record]);
  const form = useRuntimeFormState(runtimeRecord);
  const formDefinition =
    definition.forms.find(
      (item) => item.key === (mode === "read" ? "detail" : mode),
    ) ?? definition.forms[0];

  useEffect(() => {
    if (isCreate) return;
    adapter
      .getTimeline(record.id)
      .then((response) => setTimeline(response.items ?? []))
      .catch(() => setTimeline([]));
  }, [adapter, isCreate, record.id]);

  async function save(close: boolean) {
    const clientErrors = validateRuntimeValues(formDefinition, form.values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length)
      return { success: false, message: "Complete the required fields." };
    const payload = Object.fromEntries(
      formDefinition.fields
        .filter(
          (field) =>
            !["timeline", "relatedRecords", "process"].includes(field.type) &&
            field.key in form.values &&
            Boolean(
              isCreate
                ? getRuntimeSchema(moduleKey)?.fields[field.key]?.creatable
                : getRuntimeSchema(moduleKey)?.fields[field.key]?.editable,
            ),
        )
        .map((field) => [field.key, form.values[field.key]]),
    );
    const validation = await adapter.validateRecord(
      payload,
      isCreate ? "create" : "edit",
      record.id || undefined,
    );
    if (!validation.success) {
      setErrors(
        Object.fromEntries(
          (validation.errors ?? [])
            .filter((item) => item.field)
            .map((item) => [item.field!, item.message]),
        ),
      );
      return validation;
    }
    const response = isCreate
      ? await adapter.createRecord(payload)
      : await adapter.updateRecord(record.id, payload, version);
    if (close) router.push(definition.routeBase);
    else if (isCreate)
      router.replace(`${definition.routeBase}/${response.item.id}`);
    else {
      form.setValues(response.item);
      setMode("read");
    }
    return { success: true, message: `${definition.displayName} saved.` };
  }

  async function reloadRecord() {
    if (isCreate) return;
    const response = await adapter.getRecord(record.id);
    const next = response.item;
    if (moduleKey === "contracts" && Array.isArray(next.versions)) {
      const versions = next.versions as Array<Record<string, unknown>>;
      const current =
        versions.find(
          (item) => Number(item.version) === Number(next.currentVersionNumber),
        ) ?? versions[0];
      form.setValues({ ...next, contentHtml: current?.contentHtml ?? "" });
      setTimeline(
        Array.isArray(next.timeline)
          ? (next.timeline as Array<Record<string, unknown>>)
          : [],
      );
    } else form.setValues(next);
  }

  async function handleAction(action: RuntimeActionDefinition) {
    if (action.key === "back") {
      router.push(definition.routeBase);
      return;
    }
    if (action.key === "edit") {
      setMode("edit");
      return;
    }
    if (moduleKey === "tenants" && action.key === "tenant-operations") {
      router.push(`/tenants/${record.id}?workspace=operations`);
      return;
    }
    if (action.key === "save") return save(false);
    if (action.key === "save-close") return save(true);
    if (action.key === "delete") {
      const result = await adapter.deleteRecord(record.id);
      if (result.success) router.push(definition.routeBase);
      return result;
    }
    if (moduleKey === "contracts" && action.key === "submit") {
      const response = await fetch(
        `/api/contracts/${record.id}/submit-approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to submit approval.");
      await reloadRecord();
      return { success: true, message: "Contract submitted for approval." };
    }
    if (
      moduleKey === "contracts" &&
      ["stage-back", "stage-forward"].includes(action.key)
    ) {
      const backward = action.key === "stage-back";
      const reason = backward
        ? window.prompt("Reason for moving this contract backward")
        : undefined;
      if (backward && !reason) return;
      const response = await fetch(`/api/contracts/${record.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: backward ? "backward" : "forward",
          reason,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to change contract stage.");
      await reloadRecord();
      return { success: true, message: "Contract stage updated." };
    }
    if (moduleKey === "contracts" && action.key === "generate-document") {
      const response = await fetch(`/api/contracts/${record.id}/generate/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Unable to generate the contract PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${String(form.values.contractNumber ?? "contract")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      return { success: true, message: "Contract PDF generated." };
    }
    if (moduleKey === "contracts" && action.key === "send-signature") {
      setSignatureOpen(true);
      return;
    }
    if (moduleKey === "partners" && action.key === "create-agreement") {
      router.push(
        `/contracts/new?partnerId=${encodeURIComponent(record.id)}&contractType=MASTER_PARTNER_AGREEMENT&counterpartyName=${encodeURIComponent(String(form.values.displayName ?? ""))}&counterpartyEmail=${encodeURIComponent(String(form.values.email ?? ""))}`,
      );
      return;
    }
    if (moduleKey === "contracts" && action.key === "duplicate") {
      const response = await fetch("/api/contracts/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceContractId: record.id,
          title: `Copy of ${String(form.values.title ?? "contract")}`,
          counterpartyName: form.values.counterpartyName,
          counterpartyEmail: form.values.counterpartyEmail || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to duplicate contract.");
      router.push(`/contracts/${payload.id}`);
      return { success: true, message: "Contract duplicated." };
    }
    if (
      moduleKey === "contracts" &&
      ["approve", "reject"].includes(action.key)
    ) {
      const requests = Array.isArray(form.values.approvalRequests)
        ? (form.values.approvalRequests as Array<Record<string, unknown>>)
        : [];
      const pending = requests.find((item) => item.status === "PENDING");
      if (!pending) throw new Error("No pending approval request was found.");
      const response = await fetch(
        `/api/platform-approvals/${String(pending.id)}/${action.key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment:
              action.key === "approve"
                ? "Approved in Platform Admin."
                : "Returned for correction from Platform Admin.",
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.message ?? `Unable to ${action.key} contract.`,
        );
      await reloadRecord();
      return {
        success: true,
        message:
          action.key === "approve"
            ? "Approval completed."
            : "Contract returned for correction.",
      };
    }
    if (action.key === "cancel") {
      form.reset();
      setMode("read");
      return;
    }
    return adapter.executeAction(action.key, { id: record.id });
  }

  const title = String(
    form.values.displayName ??
      form.values.companyName ??
      form.values.title ??
      form.values.name ??
      (isCreate
        ? `New ${definition.displayName.toLowerCase()}`
        : definition.displayName),
  );
  const actions = definition.actions.filter(
    (action) =>
      !isCreate || ["save", "save-close", "cancel"].includes(action.key),
  );

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow={definition.navigationGroup}
        title={title}
        description={
          isCreate
            ? `Create a ${definition.displayName.toLowerCase()} using the shared module workflow.`
            : definition.description
        }
      />
      {definition.process && !isCreate ? (
        <ProcessBar
          stages={definition.process.stages}
          current={String(form.values.processStage ?? form.values.status ?? "")}
        />
      ) : null}
      <ModuleActionBar
        actions={actions}
        context={{
          scope: "record",
          record: form.values,
          roleKeys,
          permissionKeys,
          isDirty: form.isDirty,
          mode,
        }}
        onAction={handleAction}
      />
      {moduleKey === "customer-onboarding" && !isCreate ? (
        <CustomerAgreementPanel
          record={form.values}
          onComplete={reloadRecord}
        />
      ) : null}
      {moduleKey === "support-cases" && !isCreate ? (
        <SupportCaseOperationsPanel
          record={form.values}
          onComplete={reloadRecord}
        />
      ) : null}
      {moduleKey === "contracts" && !isCreate ? (
        <ContractVersionHistory
          record={form.values}
          onComplete={reloadRecord}
        />
      ) : null}
      <RuntimeForm
        definition={formDefinition}
        values={form.values}
        mode={mode}
        roleKeys={roleKeys}
        errors={errors}
        onChange={form.update}
        onSubmit={() => void save(false)}
      />
      {moduleKey === "plans" &&
      !isCreate &&
      Array.isArray(form.values.prices) ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Per-seat monthly pricing
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Create currency-specific licensed Stripe prices. Existing Stripe
            prices remain immutable for active subscriptions.
          </p>
          <div className="mt-5">
            <PlanPriceManager
              planId={record.id}
              initialPrices={form.values.prices as PlanPriceRecord[]}
              defaultCurrency={String(form.values.currency ?? "USD")}
            />
          </div>
        </section>
      ) : null}
      {!isCreate && definition.relatedRecords?.length ? (
        <section className="grid gap-5 xl:grid-cols-2">
          {definition.relatedRecords.map((relationship) => (
            <RuntimeRelatedRecordsPanel
              key={relationship.key}
              adapter={adapter}
              recordId={record.id}
              relationship={relationship}
            />
          ))}
        </section>
      ) : null}
      {!isCreate ? <TimelinePanel items={timeline} /> : null}
      {signatureOpen ? (
        <SignatureRequestDialog
          contractId={record.id}
          counterpartyName={String(form.values.counterpartyName ?? "")}
          counterpartyEmail={String(form.values.counterpartyEmail ?? "")}
          onClose={() => setSignatureOpen(false)}
          onComplete={reloadRecord}
        />
      ) : null}
    </main>
  );
}

function CustomerAgreementPanel({
  record,
  onComplete,
}: {
  record: Record<string, unknown>;
  onComplete: () => Promise<void>;
}) {
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState("");
  const contracts = Array.isArray(record.contracts)
    ? (record.contracts as Array<Record<string, unknown>>)
    : [];
  const signed = contracts.find((item) =>
    ["FULLY_SIGNED", "ACTIVE"].includes(String(item.status)),
  );
  async function provisionTenant() {
    setProvisioning(true);
    setProvisionMessage("");
    const customer = record.customer as Record<string, unknown> | undefined;
    const response = await fetch(
      `/api/super-admin/customer-onboarding/${record.id}/create-tenant`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: String(
            customer?.companyName ?? record.customerName ?? "Customer",
          ),
          slug: String(record.plannedTenantSlug ?? ""),
          planId: String(record.selectedPlanId ?? ""),
          billingCycle: String(record.billingCycle ?? "MONTHLY"),
          createServiceAccount: Boolean(record.createServiceAccount),
          serviceAccountEmail: record.serviceAccountEmail || undefined,
          serviceAccountDisplayName:
            record.serviceAccountDisplayName || undefined,
          assignServiceAccountSystemAdminRole: Boolean(
            record.serviceAccountAssignSystemAdmin,
          ),
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    setProvisioning(false);
    if (!response.ok) {
      setProvisionMessage(payload?.message ?? "Unable to provision tenant.");
      return;
    }
    setProvisionMessage("Tenant and subscription provisioned successfully.");
    await onComplete();
  }
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-950">
            Customer agreement
          </p>
          <p className="mt-1 text-xs text-slate-600">
            The tenant readiness gate is completed only by a fully signed linked
            agreement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/contracts/new?mode=source&sourceType=onboarding&sourceId=${record.id}`}
            className="w-fit rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Create agreement
          </Link>
          {record.tenantId ? (
            <Link
              href={`/tenants/${record.tenantId}`}
              className="w-fit rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700"
            >
              Open tenant
            </Link>
          ) : (
            <button
              type="button"
              disabled={
                provisioning ||
                !signed ||
                !record.plannedTenantSlug ||
                !record.selectedPlanId
              }
              onClick={() => void provisionTenant()}
              className="w-fit rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {provisioning ? "Provisioning…" : "Provision tenant"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {contracts.map((contract) => (
          <Link
            key={String(contract.id)}
            href={`/contracts/${contract.id}`}
            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800"
          >
            {String(contract.contractNumber)} ·{" "}
            {String(contract.status).toLowerCase().replaceAll("_", " ")}
          </Link>
        ))}
        {!contracts.length ? (
          <span className="text-xs text-slate-500">
            No agreement has been linked yet.
          </span>
        ) : null}
      </div>
      {signed ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          Signed agreement verified for provisioning.
        </p>
      ) : null}
      {provisionMessage ? (
        <p className="mt-3 text-xs font-semibold text-slate-700">
          {provisionMessage}
        </p>
      ) : null}
    </section>
  );
}

function SupportCaseOperationsPanel({
  record,
  onComplete,
}: {
  record: Record<string, unknown>;
  onComplete: () => Promise<void>;
}) {
  const [incidentId, setIncidentId] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [message, setMessage] = useState("");
  const [customerSubject, setCustomerSubject] = useState(
    `Update on ${String(record.caseNumber ?? "your support case")}`,
  );
  const [customerBody, setCustomerBody] = useState("");
  const [busy, setBusy] = useState(false);
  const attachments = Array.isArray(record.attachments)
    ? (record.attachments as Array<Record<string, unknown>>)
    : [];
  const incidents = Array.isArray(record.incidentLinks)
    ? (record.incidentLinks as Array<Record<string, unknown>>)
    : [];
  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/support-cases/${record.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to update support case.");
      return;
    }
    setMessage(
      path === "customer-updates"
        ? "Customer update sent and recorded."
        : "Support case updated.",
    );
    if (path === "customer-updates") setCustomerBody("");
    await onComplete();
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const data = new FormData();
    data.set("file", file);
    data.set("customerSafe", "false");
    const response = await fetch(
      `/api/support-cases/${record.id}/attachments`,
      { method: "POST", body: data },
    );
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to upload attachment.");
      return;
    }
    setMessage("Attachment uploaded.");
    await onComplete();
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-950">
          Case relationships and communication
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Link sanitized incidents, merge duplicates, preserve evidence, and
          send customer-safe progress updates.
        </p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.5fr_auto] lg:items-end">
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Customer email subject
          <input
            value={customerSubject}
            onChange={(event) => setCustomerSubject(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Customer-safe update
          <textarea
            value={customerBody}
            onChange={(event) => setCustomerBody(event.target.value)}
            rows={2}
            className="min-h-10 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <button
          type="button"
          disabled={busy || !customerSubject || !customerBody}
          onClick={() =>
            void post("customer-updates", {
              subject: customerSubject,
              body: customerBody,
            })
          }
          className="h-10 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-40"
        >
          Send update
        </button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Incident ID
          <div className="flex gap-2">
            <input
              value={incidentId}
              onChange={(e) => setIncidentId(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
            />
            <button
              disabled={busy || !incidentId}
              onClick={() => post("incidents", { errorLogId: incidentId })}
              className="rounded-xl bg-blue-700 px-3 text-xs font-semibold text-white"
            >
              Link
            </button>
          </div>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Merge into case ID
          <div className="flex gap-2">
            <input
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
            />
            <button
              disabled={busy || !mergeTarget}
              onClick={() =>
                post("merge", {
                  targetCaseId: mergeTarget,
                  reason: "Duplicate case merged from Platform Admin.",
                })
              }
              className="rounded-xl bg-amber-700 px-3 text-xs font-semibold text-white"
            >
              Merge
            </button>
          </div>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Attachment
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            onChange={upload}
            className="h-10 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-normal normal-case tracking-normal"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {incidents.map((item) => (
          <span
            key={String(item.id)}
            className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"
          >
            Incident linked
          </span>
        ))}
        {attachments.map((item) => (
          <a
            key={String(item.id)}
            href={`/api/support-cases/attachments/${item.id}/download`}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            {String(item.fileName)}
          </a>
        ))}
      </div>
      {message ? (
        <p className="mt-3 text-xs text-slate-600">{message}</p>
      ) : null}
    </section>
  );
}

function ContractVersionHistory({
  record,
  onComplete,
}: {
  record: Record<string, unknown>;
  onComplete: () => Promise<void>;
}) {
  const versions = Array.isArray(record.versions)
    ? (record.versions as Array<Record<string, unknown>>)
    : [];
  const [from, setFrom] = useState(
    String(versions[1]?.version ?? versions[0]?.version ?? ""),
  );
  const [to, setTo] = useState(String(versions[0]?.version ?? ""));
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(
    null,
  );
  const [message, setMessage] = useState("");
  async function compare() {
    const response = await fetch(
      `/api/contracts/${record.id}/versions/compare?from=${from}&to=${to}`,
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to compare versions.");
      return;
    }
    setComparison(payload);
    setMessage("");
  }
  async function restore(version: Record<string, unknown>) {
    const response = await fetch(`/api/contracts/${record.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentHtml: version.contentHtml,
        changeSummary: `Restored version ${version.version} as a new draft version.`,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to restore version.");
      return;
    }
    setMessage(`Version ${version.version} restored as a new draft.`);
    await onComplete();
  }
  if (!versions.length) return null;
  const additions = Array.isArray(comparison?.additions)
    ? comparison.additions
    : [];
  const removals = Array.isArray(comparison?.removals)
    ? comparison.removals
    : [];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            Version history
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Compare immutable snapshots or restore an earlier draft as a new
            version.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <VersionSelect
            label="From"
            value={from}
            versions={versions}
            onChange={setFrom}
          />
          <VersionSelect
            label="To"
            value={to}
            versions={versions}
            onChange={setTo}
          />
          <button
            type="button"
            disabled={!from || !to || from === to}
            onClick={() => void compare()}
            className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {versions.map((version) => (
          <div
            key={String(version.id)}
            className="min-w-52 rounded-xl border border-slate-200 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Version {String(version.version)}
              </span>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                {String(version.status)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {new Date(String(version.createdAt)).toLocaleString()}
            </p>
            {!version.lockedAt &&
            !["FULLY_SIGNED", "ACTIVE", "ARCHIVED"].includes(
              String(record.status),
            ) ? (
              <button
                type="button"
                onClick={() => void restore(version)}
                className="mt-2 text-xs font-semibold text-blue-700"
              >
                Restore as new version
              </button>
            ) : (
              <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                Locked record
              </p>
            )}
          </div>
        ))}
      </div>
      {comparison ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <VersionDiff title="Added" tone="success" items={additions} />
          <VersionDiff title="Removed" tone="danger" items={removals} />
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 text-xs text-slate-600">{message}</p>
      ) : null}
    </section>
  );
}

function VersionSelect({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string;
  versions: Array<Record<string, unknown>>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-normal normal-case tracking-normal text-slate-800"
      >
        {versions.map((version) => (
          <option key={String(version.id)} value={String(version.version)}>
            Version {String(version.version)}
          </option>
        ))}
      </select>
    </label>
  );
}

function VersionDiff({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "success" | "danger";
  items: unknown[];
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
    >
      <p className="text-xs font-semibold text-slate-800">
        {title} ({items.length})
      </p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
        {items.length ? (
          items.map((item, index) => <li key={index}>{String(item)}</li>)
        ) : (
          <li>None</li>
        )}
      </ul>
    </div>
  );
}

function SignatureRequestDialog({
  contractId,
  counterpartyName,
  counterpartyEmail,
  onClose,
  onComplete,
}: {
  contractId: string;
  counterpartyName: string;
  counterpartyEmail: string;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [name, setName] = useState(counterpartyName);
  const [email, setEmail] = useState(counterpartyEmail);
  const [role, setRole] = useState("Authorized signatory");
  const [subject, setSubject] = useState(
    "Signature requested for your agreement",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/contracts/${contractId}/signature-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            recipients: [{ name, email, role, signingOrder: 1 }],
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.message ?? "Unable to send signature request.",
        );
      await onComplete();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to send signature request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2
          id="signature-title"
          className="text-lg font-semibold text-slate-950"
        >
          Send for e-signature
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          A secure, expiring signing link will be created. Recipients sign the
          immutable current version in order.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DialogField label="Signer name" value={name} onChange={setName} />
          <DialogField
            label="Signer email"
            value={email}
            type="email"
            onChange={setEmail}
          />
          <DialogField label="Signer role" value={role} onChange={setRole} />
          <DialogField
            label="Email subject"
            value={subject}
            onChange={setSubject}
          />
        </div>
        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name || !email || !subject}
            onClick={() => void send()}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogField({
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
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}

function ProcessBar({
  stages,
  current,
}: {
  stages: Array<{
    key: string;
    label: string;
    owner?: string;
    enteredAt?: string;
    blocked?: boolean;
  }>;
  current: string;
}) {
  const scroller = useRef<HTMLOListElement>(null);
  const active = Math.max(
    0,
    stages.findIndex((stage) => stage.key === current),
  );
  useEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>(
        `[data-process-stage="${CSS.escape(current)}"]`,
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  }, [current]);
  const scroll = (direction: number) =>
    scroller.current?.scrollBy({
      left: direction * Math.max(240, scroller.current.clientWidth * 0.7),
      behavior: "smooth",
    });
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Business process"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Business process
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Use the controls, mouse wheel, trackpad, touch, or arrow keys to
            review stages.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous process stages"
            onClick={() => scroll(-1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next process stages"
            onClick={() => scroll(1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ol
        ref={scroller}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") scroll(-1);
          if (event.key === "ArrowRight") scroll(1);
        }}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
          }
        }}
        className="flex min-w-0 snap-x snap-mandatory items-stretch overflow-x-auto pb-3 [scrollbar-color:var(--admin-primary)_#e2e8f0] [scrollbar-width:auto]"
        aria-label="Business process stages"
      >
        {stages.map((stage, index) => (
          <li
            key={stage.key}
            className="flex snap-center items-center"
            data-process-stage={stage.key}
          >
            <span
              aria-current={index === active ? "step" : undefined}
              aria-label={`${stage.label}: ${stage.blocked ? "blocked" : index < active ? "completed" : index === active ? "current" : "future"}`}
              className={`min-w-44 rounded-2xl border px-4 py-3 text-left text-xs font-semibold ${stage.blocked ? "border-rose-200 bg-rose-50 text-rose-700" : index < active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : index === active ? "border-transparent bg-[var(--admin-primary)] text-white" : "border-slate-200 bg-slate-50 text-slate-500"}`}
            >
              <span className="block">{stage.label}</span>
              {stage.owner ? (
                <span className="mt-1 block font-normal opacity-80">
                  Owner: {stage.owner}
                </span>
              ) : null}
              {stage.enteredAt ? (
                <span className="mt-1 block font-normal opacity-80">
                  Entered {stage.enteredAt}
                </span>
              ) : null}
            </span>
            {index < stages.length - 1 ? (
              <span
                className={`h-px w-8 ${index < active ? "bg-emerald-300" : "bg-slate-200"}`}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RuntimeRelatedRecordsPanel({
  adapter,
  recordId,
  relationship,
}: {
  adapter: ReturnType<typeof createHttpModuleRuntimeAdapter>;
  recordId: string;
  relationship: {
    key: string;
    label: string;
    module?: PlatformModuleKey;
    foreignKey: string;
    columns?: RuntimeColumnDefinition[];
  };
}) {
  const router = useRouter();
  const [items, setItems] = useState<RuntimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    adapter
      .getRelatedRecords(recordId, relationship.key, {
        page: 1,
        pageSize: 10,
        signal: controller.signal,
      })
      .then((response) => {
        setItems(response.items);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load related records.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [adapter, recordId, relationship.key]);
  const target = relationship.module
    ? getPlatformModuleDefinition(relationship.module)
    : null;
  const configuredColumns =
    relationship.columns ??
    target?.columns.slice(0, 4) ??
    relatedFallbackColumns(relationship.key);
  const columns = configuredColumns.map<ProDataTableColumn<RuntimeRecord>>(
    (column) => ({
      key: column.key,
      header: column.label,
      minWidth: column.minWidth ?? 120,
      width: column.width,
      render: (row) => relatedValue(row, column.field),
    }),
  );
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">
          {relationship.label}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Records linked through the shared module relationship.
        </p>
      </div>
      {error ? (
        <p className="p-5 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : (
        <ProDataTable
          rows={items}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          loadingRowCount={3}
          compact
          emptyTitle={`No ${relationship.label.toLowerCase()}`}
          emptyDescription="Related records will appear here when they are linked."
          onRowClick={
            target
              ? (row) => router.push(`${target.routeBase}/${row.id}`)
              : undefined
          }
        />
      )}
    </section>
  );
}

function relatedFallbackColumns(key: string): RuntimeColumnDefinition[] {
  if (key === "documents" || key === "attachments")
    return [
      { key: "fileName", field: "fileName", label: "File" },
      { key: "mimeType", field: "mimeType", label: "Type" },
      { key: "createdAt", field: "createdAt", label: "Created" },
    ];
  if (key === "approvalRequests")
    return [
      { key: "requestNumber", field: "requestNumber", label: "Approval" },
      { key: "status", field: "status", label: "Status" },
      { key: "createdAt", field: "createdAt", label: "Created" },
    ];
  return [
    { key: "id", field: "id", label: "Record" },
    { key: "createdAt", field: "createdAt", label: "Created" },
  ];
}

function relatedValue(record: RuntimeRecord, field: string) {
  const value = field
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      record,
    );
  if (value == null || value === "")
    return <span className="text-slate-400">—</span>;
  if (field.endsWith("At")) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  if (typeof value === "object")
    return String(
      (value as Record<string, unknown>).displayName ??
        (value as Record<string, unknown>).name ??
        (value as Record<string, unknown>).title ??
        "—",
    );
  return String(value).replaceAll("_", " ");
}

function TimelinePanel({ items }: { items: Array<Record<string, unknown>> }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-950">Timeline</h2>
      </div>
      {items.length ? (
        <ol className="mt-4 divide-y divide-slate-100">
          {items.slice(0, 20).map((item, index) => (
            <li key={String(item.id ?? index)} className="py-3">
              <p className="text-sm font-medium text-slate-800">
                {String(
                  item.actionLabel ??
                    item.action ??
                    item.activityType ??
                    item.eventType ??
                    "Activity",
                ).replaceAll("_", " ")}
              </p>
              {item.message ? (
                <p className="mt-1 text-sm text-slate-600">
                  {String(item.message)}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                {String(
                  item.createdAt ?? item.timestamp ?? item.occurredAt ?? "",
                )}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No timeline activity has been recorded yet.
        </p>
      )}
    </section>
  );
}

function RuntimeRecordSkeleton({ title }: { title: string }) {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-16 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
      <span className="sr-only">Loading {title}</span>
    </main>
  );
}

function RuntimeRecordError({ message }: { message: string }) {
  return (
    <main className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
      <h1 className="text-lg font-semibold text-rose-900">
        Unable to open record
      </h1>
      <p className="mt-2 text-sm text-rose-700">{message}</p>
    </main>
  );
}
