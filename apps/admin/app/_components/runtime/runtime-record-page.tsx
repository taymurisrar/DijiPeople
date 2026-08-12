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
import { executeRuntimeRecordAction } from "@/lib/runtime/runtime-record-action-handler";
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
  const baseFormDefinition =
    definition.forms.find(
      (item) => item.key === (mode === "read" ? "detail" : mode),
    ) ?? definition.forms[0];
  const formDefinition = useMemo(() => {
    if (!baseFormDefinition.tabs) return baseFormDefinition;
    const hidden = new Set<string>();
    if (moduleKey === "contracts") {
      if (
        !Array.isArray(runtimeRecord.fieldPlacements) ||
        !runtimeRecord.fieldPlacements.length
      )
        hidden.add("fields");
      if (
        !Array.isArray(runtimeRecord.relatedRecords) ||
        !runtimeRecord.relatedRecords.length
      )
        hidden.add("related");
    }
    const tabs = baseFormDefinition.tabs.filter((tab) => {
      if (hidden.has(tab.key)) return false;
      const hasFields = baseFormDefinition.fields.some(
        (field) =>
          field.tab === tab.key &&
          !field.hidden &&
          (!isCreate || !field.hideOnCreate),
      );
      const hasRelationship =
        !isCreate &&
        definition.relatedRecords?.some(
          (relationship) => relationship.tab === tab.key,
        );
      const hasTimeline =
        !isCreate && ["timeline", "activities"].includes(tab.key);
      const hasRuntimePanel =
        !isCreate && moduleKey === "contracts" && tab.key === "versions";
      return hasFields || hasRelationship || hasTimeline || hasRuntimePanel;
    });
    return { ...baseFormDefinition, tabs };
  }, [
    baseFormDefinition,
    definition.relatedRecords,
    isCreate,
    moduleKey,
    runtimeRecord.fieldPlacements,
    runtimeRecord.relatedRecords,
  ]);
  const [activeTab, setActiveTab] = useState(
    formDefinition.tabs?.[0]?.key ?? "",
  );

  async function reloadTimeline() {
    if (isCreate) return;
    try {
      const response = await adapter.getTimeline(record.id);
      setTimeline(response.items ?? []);
    } catch {
      setTimeline([]);
    }
  }

  useEffect(() => {
    if (isCreate) return;
    void reloadTimeline();
    // The adapter and record identity are the timeline data source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            !field.readOnly &&
            !(
              field.readOnlyWhen &&
              form.values[field.readOnlyWhen.field] ===
                field.readOnlyWhen.equals
            ) &&
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
    return executeRuntimeRecordAction({
      action,
      moduleKey,
      record,
      values: form.values,
      routeBase: definition.routeBase,
      adapter,
      router,
      save,
      reloadRecord,
      resetForm: form.reset,
      enterEditMode: () => setMode("edit"),
      leaveEditMode: () => setMode("read"),
      openSignatureDialog: () => setSignatureOpen(true),
    });
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
  const relatedRecords =
    definition.relatedRecords?.filter(
      (relationship) =>
        !formDefinition.tabs?.length || relationship.tab === activeTab,
    ) ?? [];
  const showTimeline =
    !formDefinition.tabs?.length ||
    ["timeline", "activities"].includes(activeTab);
  const hasFieldsInActiveTab =
    !formDefinition.tabs?.length ||
    formDefinition.fields.some((field) => field.tab === activeTab);
  const hasSpecialPanel =
    (moduleKey === "customer-onboarding" &&
      ["overview", "readiness", "agreements"].includes(activeTab)) ||
    (moduleKey === "contracts" &&
      ["parties", "versions"].includes(activeTab)) ||
    moduleKey === "plans";

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow={definition.navigationGroup}
        title={title}
        description={
          isCreate ? (
            `Create a new ${definition.displayName.toLowerCase()}.`
          ) : (
            <RecordHeaderMetadata moduleKey={moduleKey} record={form.values} />
          )
        }
      />
      {definition.process && !isCreate ? (
        <ProcessBar
          stages={resolveProcessStages(
            moduleKey,
            definition.process.stages,
            form.values,
          )}
          current={resolveProcessStage(moduleKey, form.values)}
        />
      ) : null}
      {moduleKey === "contracts" &&
      !isCreate &&
      isAgreementLocked(String(form.values.status ?? "")) ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">This executed agreement is read-only.</p>
          <p className="mt-1 text-amber-800">
            Its signed version, parties, fields, and evidence are immutable. Use
            Amend or Renew to create a controlled successor agreement.
          </p>
        </section>
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
      {moduleKey === "customer-onboarding" &&
      !isCreate &&
      ["overview", "readiness", "agreements"].includes(activeTab) ? (
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
      {moduleKey === "contracts" && !isCreate && activeTab === "versions" ? (
        <ContractVersionHistory
          record={form.values}
          onComplete={reloadRecord}
        />
      ) : null}
      {moduleKey === "contracts" && !isCreate && activeTab === "parties" ? (
        <ContractPartiesPanel
          contractId={record.id}
          parties={agreementParties(form.values.parties)}
          locked={isAgreementLocked(String(form.values.status ?? ""))}
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
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      {!isCreate &&
      formDefinition.tabs?.length &&
      !hasFieldsInActiveTab &&
      !relatedRecords.length &&
      !showTimeline &&
      !hasSpecialPanel ? (
        <EmptyTabPanel
          label={
            formDefinition.tabs.find((tab) => tab.key === activeTab)?.label ??
            "Related records"
          }
        />
      ) : null}
      {moduleKey === "plans" &&
      !isCreate &&
      Array.isArray(form.values.prices) ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Pricing</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure flat or per-seat monthly and annual prices. Existing
            Stripe prices remain immutable for active subscriptions.
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
      {!isCreate && relatedRecords.length ? (
        <section className="grid gap-5">
          {relatedRecords.map((relationship) => (
            <RuntimeRelatedRecordsPanel
              key={relationship.key}
              adapter={adapter}
              recordId={record.id}
              relationship={relationship}
            />
          ))}
        </section>
      ) : null}
      {!isCreate && showTimeline ? (
        <TimelinePanel
          items={timeline}
          onCreate={async (message) => {
            const result = await adapter.addTimelineActivity(record.id, {
              activityType: "NOTE",
              message,
            });
            if (!result.success)
              throw new Error(result.message ?? "Unable to add activity.");
            await reloadTimeline();
          }}
        />
      ) : null}
      {signatureOpen ? (
        <SignatureRequestDialog
          contractId={record.id}
          counterpartyName={String(form.values.counterpartyName ?? "")}
          counterpartyEmail={String(form.values.counterpartyEmail ?? "")}
          parties={agreementParties(form.values.parties)}
          allowChangeRequests={
            form.values.allowChangeRequests !== false
          }
          onClose={() => setSignatureOpen(false)}
          onComplete={reloadRecord}
        />
      ) : null}
    </main>
  );
}

function EmptyTabPanel({ label }: { label: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">
        No {label.toLowerCase()} yet
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Business records will appear here when they are added to this record.
      </p>
    </section>
  );
}

type AgreementParty = {
  id: string;
  partyType: string;
  role: string;
  name: string;
  email: string;
  isPrimary: boolean;
  isSignatory: boolean;
  signatureRequired: boolean;
  signingOrder: number;
};

function agreementParties(value: unknown): AgreementParty[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      id: String(item.id ?? ""),
      partyType: String(item.partyType ?? "EXTERNAL_ORGANIZATION"),
      role: String(item.role ?? "OTHER"),
      name: String(item.name ?? ""),
      email: String(item.email ?? ""),
      isPrimary: item.isPrimary === true,
      isSignatory: item.isSignatory === true,
      signatureRequired: item.signatureRequired === true,
      signingOrder: Number(item.signingOrder ?? 1),
    }))
    .filter((item) => item.id);
}

function ContractPartiesPanel({
  contractId,
  parties,
  locked,
  onComplete,
}: {
  contractId: string;
  parties: AgreementParty[];
  locked: boolean;
  onComplete: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(parties);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDrafts(parties), [parties]);
  const update = (id: string, changes: Partial<AgreementParty>) =>
    setDrafts((current) =>
      current.map((party) =>
        party.id === id ? { ...party, ...changes } : party,
      ),
    );
  async function request(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    setBusy(path);
    setError(null);
    try {
      const response = await fetch(`/api/contracts/${contractId}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.message ?? "Unable to update agreement parties.",
        );
      await onComplete();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update agreement parties.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Agreement parties
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Define every party, whether they sign, whether their signature is
            required, and the signing order.
          </p>
        </div>
        {!locked ? (
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            {adding ? "Cancel" : "Add party"}
          </button>
        ) : null}
      </div>
      {adding ? (
        <NewPartyForm
          disabled={Boolean(busy)}
          onSubmit={(party) => request("/parties", "POST", party)}
        />
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3">Party</th>
              <th className="p-3">Type</th>
              <th className="p-3">Role</th>
              <th className="p-3">Signatory</th>
              <th className="p-3">Required</th>
              <th className="p-3">Order</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {drafts.map((party) => (
              <tr key={party.id}>
                <td className="p-3">
                  <input
                    disabled={locked}
                    value={party.name}
                    onChange={(event) =>
                      update(party.id, { name: event.target.value })
                    }
                    className="h-10 w-full min-w-48 rounded-lg border border-slate-200 px-3"
                  />
                  <input
                    disabled={locked}
                    type="email"
                    value={party.email}
                    onChange={(event) =>
                      update(party.id, { email: event.target.value })
                    }
                    placeholder="Email"
                    className="mt-2 h-9 w-full min-w-48 rounded-lg border border-slate-200 px-3 text-xs"
                  />
                </td>
                <td className="p-3">
                  <PartySelect
                    disabled={locked}
                    value={party.partyType}
                    options={PARTY_TYPES}
                    onChange={(partyType) => update(party.id, { partyType })}
                  />
                </td>
                <td className="p-3">
                  <PartySelect
                    disabled={locked}
                    value={party.role}
                    options={PARTY_ROLES}
                    onChange={(role) => update(party.id, { role })}
                  />
                </td>
                <td className="p-3">
                  <input
                    disabled={locked}
                    type="checkbox"
                    checked={party.isSignatory}
                    onChange={(event) =>
                      update(party.id, {
                        isSignatory: event.target.checked,
                        ...(!event.target.checked
                          ? { signatureRequired: false }
                          : {}),
                      })
                    }
                    aria-label={`${party.name} is a signatory`}
                  />
                </td>
                <td className="p-3">
                  <input
                    disabled={locked || !party.isSignatory}
                    type="checkbox"
                    checked={party.signatureRequired}
                    onChange={(event) =>
                      update(party.id, {
                        signatureRequired: event.target.checked,
                      })
                    }
                    aria-label={`${party.name} signature is required`}
                  />
                </td>
                <td className="p-3">
                  <input
                    disabled={locked || !party.isSignatory}
                    type="number"
                    min={1}
                    value={party.signingOrder}
                    onChange={(event) =>
                      update(party.id, {
                        signingOrder: Number(event.target.value),
                      })
                    }
                    className="h-10 w-20 rounded-lg border border-slate-200 px-3"
                  />
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      disabled={locked || Boolean(busy)}
                      type="button"
                      onClick={() =>
                        void request(`/parties/${party.id}`, "PATCH", party)
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      disabled={locked || Boolean(busy)}
                      type="button"
                      onClick={() =>
                        void request(`/parties/${party.id}`, "DELETE")
                      }
                      className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const PARTY_TYPES = [
  "PLATFORM",
  "PARTNER",
  "CUSTOMER",
  "LEAD",
  "TENANT",
  "INDIVIDUAL",
  "EXTERNAL_ORGANIZATION",
];
const PARTY_ROLES = [
  "PROVIDER",
  "PARTNER",
  "CUSTOMER",
  "CLIENT",
  "REFERRER",
  "AUTHORIZED_SIGNATORY",
  "WITNESS",
  "GUARANTOR",
  "OTHER",
];

function PartySelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs"
    >
      <option value="">Select</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

function NewPartyForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (party: Record<string, unknown>) => Promise<void>;
}) {
  const [party, setParty] = useState({
    name: "",
    email: "",
    partyType: "EXTERNAL_ORGANIZATION",
    role: "AUTHORIZED_SIGNATORY",
    isSignatory: true,
    signatureRequired: true,
    signingOrder: 1,
  });
  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
      <DialogField
        label="Party name"
        value={party.name}
        onChange={(name) => setParty({ ...party, name })}
      />
      <DialogField
        label="Email"
        type="email"
        value={party.email}
        onChange={(email) => setParty({ ...party, email })}
      />
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Party type</span>
        <PartySelect
          disabled={disabled}
          value={party.partyType}
          options={PARTY_TYPES}
          onChange={(partyType) => setParty({ ...party, partyType })}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Role</span>
        <PartySelect
          disabled={disabled}
          value={party.role}
          options={PARTY_ROLES}
          onChange={(role) => setParty({ ...party, role })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={party.isSignatory}
          onChange={(event) =>
            setParty({
              ...party,
              isSignatory: event.target.checked,
              signatureRequired:
                event.target.checked && party.signatureRequired,
            })
          }
        />{" "}
        Signatory
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          disabled={!party.isSignatory}
          type="checkbox"
          checked={party.signatureRequired}
          onChange={(event) =>
            setParty({ ...party, signatureRequired: event.target.checked })
          }
        />{" "}
        Required signature
      </label>
      <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
        <span>Signing order</span>
        <input
          type="number"
          min={1}
          value={party.signingOrder}
          onChange={(event) =>
            setParty({ ...party, signingOrder: Number(event.target.value) })
          }
          className="h-10 rounded-lg border border-slate-200 px-3"
        />
      </label>
      <button
        disabled={
          disabled || !party.name || (party.isSignatory && !party.email)
        }
        type="button"
        onClick={() => void onSubmit(party)}
        className="h-10 self-end rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
      >
        Add party
      </button>
    </div>
  );
}

function isAgreementLocked(status: string) {
  return [
    "SENT",
    "VIEWED",
    "SIGNATURE_IN_PROGRESS",
    "PARTIALLY_SIGNED",
    "FULLY_SIGNED",
    "FULLY_EXECUTED",
    "ACTIVE",
    "SUPERSEDED",
    "TERMINATED",
    "ARCHIVED",
  ].includes(status);
}

function RecordHeaderMetadata({
  moduleKey,
  record,
}: {
  moduleKey: PlatformModuleKey;
  record: Record<string, unknown>;
}) {
  const owner =
    readRecordLabel(record.assignedToUser) ??
    readRecordLabel(record.accountManagerUser) ??
    readRecordLabel(record.onboardingOwnerUser) ??
    readRecordLabel(record.owner);
  const source = String(record.source ?? record.applicationSource ?? "");
  const customer = readRecordLabel(record.customerAccount ?? record.customer);
  const convertedCustomer =
    record.convertedCustomer && typeof record.convertedCustomer === "object"
      ? (record.convertedCustomer as Record<string, unknown>)
      : null;
  type HeaderMetadataItem = {
    label: string;
    value: string;
    href?: string;
  };
  const candidateItems: Array<HeaderMetadataItem | null> = [
    record.status
      ? { label: "Status", value: formatRecordValue(record.status) }
      : null,
    moduleKey === "leads" && source ? { label: "Source", value: source } : null,
    moduleKey === "leads" && convertedCustomer
      ? {
          label: "Customer",
          value: readRecordLabel(convertedCustomer) ?? "Open customer",
          href: `/customers/${String(convertedCustomer.id)}`,
        }
      : null,
    customer ? { label: "Customer", value: customer } : null,
    owner ? { label: "Owner", value: owner } : null,
    record.createdAt
      ? {
          label: moduleKey === "leads" ? "Received" : "Created",
          value: formatRecordDate(record.createdAt),
        }
      : null,
  ];
  const items = candidateItems.filter(
    (item): item is HeaderMetadataItem => item !== null,
  );
  return (
    <span className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="inline-flex gap-1.5">
          <span className="font-medium text-slate-500">{item.label}</span>
          {item.href ? (
            <Link
              href={item.href}
              className="font-semibold text-[var(--admin-primary)] hover:underline"
            >
              {item.value}
            </Link>
          ) : (
            <span className="text-slate-800">{item.value}</span>
          )}
        </span>
      ))}
    </span>
  );
}

function resolveProcessStage(
  moduleKey: PlatformModuleKey,
  record: Record<string, unknown>,
) {
  if (
    moduleKey === "leads" &&
    record.status === "QUALIFIED" &&
    Array.isArray(record.contracts) &&
    record.contracts.length > 0
  )
    return "AGREEMENT";
  return String(record.processStage ?? record.status ?? "");
}

function resolveProcessStages(
  moduleKey: PlatformModuleKey,
  stages: Array<{ key: string; label: string }>,
  record: Record<string, unknown>,
) {
  if (
    moduleKey !== "leads" ||
    (!record.partnerId && record.source !== "Partner Referral")
  )
    return stages;
  return stages.map((stage) =>
    stage.key === "NEW"
      ? { ...stage, label: "Referral received" }
      : stage.key === "QUALIFIED"
        ? { ...stage, label: "Referral qualified" }
        : stage,
  );
}

function readRecordLabel(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fullName = [record.firstName, record.lastName]
    .filter(Boolean)
    .join(" ");
  return (
    String(
      record.fullName ??
        record.displayName ??
        record.companyName ??
        record.name ??
        fullName ??
        "",
    ) || null
  );
}

function formatRecordValue(value: unknown) {
  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRecordDate(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
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
    ["FULLY_SIGNED", "FULLY_EXECUTED", "ACTIVE"].includes(String(item.status)),
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
  async function changeStatus(
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/support-cases/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to change case status.");
      return;
    }
    setMessage(`Case moved to ${status.toLowerCase().replaceAll("_", " ")}.`);
    await onComplete();
  }
  const status = String(record.status ?? "NEW");
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
      <div
        className="mt-4 flex flex-wrap gap-2"
        aria-label="Support case actions"
      >
        {["NEW", "REOPENED"].includes(status) ? (
          <CaseAction
            label="Triage"
            disabled={busy}
            onClick={() => changeStatus("TRIAGED")}
          />
        ) : null}
        {!["RESOLVED", "CLOSED", "CANCELLED"].includes(status) ? (
          <CaseAction
            label="Escalate"
            disabled={busy}
            onClick={() =>
              changeStatus("WAITING_ON_INTERNAL_TEAM", {
                escalationLevel: "ESCALATED",
              })
            }
          />
        ) : null}
        {!["RESOLVED", "CLOSED", "CANCELLED"].includes(status) ? (
          <CaseAction
            label="Request info"
            disabled={busy}
            onClick={() => changeStatus("WAITING_ON_CUSTOMER")}
          />
        ) : null}
        {!["RESOLVED", "CLOSED", "CANCELLED"].includes(status) ? (
          <CaseAction
            label="Resolve"
            disabled={busy}
            onClick={() => changeStatus("RESOLVED")}
            primary
          />
        ) : null}
        {status === "RESOLVED" ? (
          <CaseAction
            label="Close"
            disabled={busy}
            onClick={() => changeStatus("CLOSED")}
            primary
          />
        ) : null}
        {["RESOLVED", "CLOSED"].includes(status) ? (
          <CaseAction
            label="Reopen"
            disabled={busy}
            onClick={() => changeStatus("REOPENED")}
          />
        ) : null}
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

function CaseAction({
  label,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${primary ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-700"}`}
    >
      {label}
    </button>
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
  parties,
  allowChangeRequests,
  onClose,
  onComplete,
}: {
  contractId: string;
  counterpartyName: string;
  counterpartyEmail: string;
  parties: AgreementParty[];
  allowChangeRequests: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  type RecipientDraft = {
    partyId?: string;
    name: string;
    email: string;
    role: string;
    signingOrder: number;
    isRequired: boolean;
  };
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => {
    const configured = parties
      .filter((party) => party.isSignatory)
      .map((party) => ({
        partyId: party.id,
        name: party.name,
        email: party.email,
        role: party.role.replaceAll("_", " "),
        signingOrder: party.signingOrder,
        isRequired: party.signatureRequired,
      }));
    return configured.length
      ? configured
      : [
          {
            partyId: undefined,
            name: counterpartyName,
            email: counterpartyEmail,
            role: "Authorized signatory",
            signingOrder: 1,
            isRequired: true,
          },
        ];
  });
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
            recipients,
            allowChangeRequests,
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
        <div className="mt-5 space-y-3">
          {recipients.map((recipient, index) => (
            <div
              key={recipient.partyId ?? index}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
            >
              <DialogField
                label="Signer name"
                value={recipient.name}
                onChange={(name) =>
                  setRecipients((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name } : item,
                    ),
                  )
                }
              />
              <DialogField
                label="Signer email"
                value={recipient.email}
                type="email"
                onChange={(email) =>
                  setRecipients((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, email } : item,
                    ),
                  )
                }
              />
              <DialogField
                label="Signer role"
                value={recipient.role}
                onChange={(role) =>
                  setRecipients((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, role } : item,
                    ),
                  )
                }
              />
              <label className="flex items-center gap-2 self-end pb-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={recipient.isRequired}
                  onChange={(event) =>
                    setRecipients((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, isRequired: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />{" "}
                Required signature
              </label>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <DialogField
              label="Email subject"
              value={subject}
              onChange={setSubject}
            />
            <label className="flex items-center gap-2 self-end pb-3 text-sm text-slate-700">
              <input type="checkbox" checked={allowChangeRequests} readOnly />{" "}
              Signers may request changes
            </label>
          </div>
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
            disabled={
              busy ||
              !subject ||
              !recipients.length ||
              recipients.some((item) => !item.name || !item.email)
            }
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
  const [hasOverflow, setHasOverflow] = useState(false);
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
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () =>
      setHasOverflow(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [stages.length]);
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
        {hasOverflow ? (
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
        ) : null}
      </div>
      <ol
        ref={scroller}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") scroll(-1);
          if (event.key === "ArrowRight") scroll(1);
        }}
        onWheel={(event) => {
          if (!hasOverflow) return;
          const delta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY;
          if (delta) {
            event.preventDefault();
            event.currentTarget.scrollLeft += delta;
          }
        }}
        className="flex w-full min-w-0 snap-x snap-mandatory items-stretch overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Business process stages"
      >
        {stages.map((stage, index) => (
          <li
            key={stage.key}
            className="flex min-w-52 flex-1 snap-center items-center"
            data-process-stage={stage.key}
          >
            <span
              aria-current={index === active ? "step" : undefined}
              aria-label={`${stage.label}: ${stage.blocked ? "blocked" : index < active ? "completed" : index === active ? "current" : "future"}`}
              className={`min-w-44 flex-1 rounded-2xl border px-4 py-3 text-left text-xs font-semibold ${stage.blocked ? "border-rose-200 bg-rose-50 text-rose-700" : index < active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : index === active ? "border-transparent bg-[var(--admin-primary)] text-white" : "border-slate-200 bg-slate-50 text-slate-500"}`}
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
                className={`h-px w-8 shrink-0 ${index < active ? "bg-emerald-300" : "bg-slate-200"}`}
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
    tab?: string;
    description?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    createHref?: string;
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {relationship.label}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {relationship.description ??
              `Business records linked to this ${relationship.label.toLowerCase()}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {relationship.createHref ? (
            <Link
              href={relationship.createHref}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Add
            </Link>
          ) : null}
          {target ? (
            <Link
              href={target.routeBase}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              View all
            </Link>
          ) : null}
        </div>
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
          emptyTitle={
            relationship.emptyTitle ?? `No ${relationship.label.toLowerCase()}`
          }
          emptyDescription={
            relationship.emptyDescription ??
            `No ${relationship.label.toLowerCase()} are linked to this record.`
          }
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
    { key: "reference", field: "displayName", label: "Record" },
    { key: "status", field: "status", label: "Status" },
    { key: "createdAt", field: "createdAt", label: "Created" },
  ];
}

function relatedValue(record: RuntimeRecord, field: string) {
  const resolved = field
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      record,
    );
  const value =
    field === "displayName" && (resolved == null || resolved === "")
      ? (record.title ??
        record.name ??
        record.companyName ??
        record.contractNumber ??
        record.requestNumber ??
        record.fileName)
      : resolved;
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

function TimelinePanel({
  items,
  onCreate,
}: {
  items: Array<Record<string, unknown>>;
  onCreate?: (message: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const visible = [...items]
    .filter((item) => {
      if (!filter.trim()) return true;
      const term = filter.trim().toLowerCase();
      return [
        item.actionLabel,
        item.action,
        item.activityType,
        item.eventType,
        item.message,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      );
    })
    .sort((left, right) => {
      const leftTime = new Date(
        String(left.createdAt ?? left.timestamp ?? left.occurredAt ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(right.createdAt ?? right.timestamp ?? right.occurredAt ?? 0),
      ).getTime();
      return direction === "desc" ? rightTime - leftTime : leftTime - rightTime;
    });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-950">Timeline</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Filter timeline"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter activity"
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
          />
          <select
            aria-label="Timeline sort order"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as "desc" | "asc")
            }
            className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
          >
            <option value="desc">Latest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>
      {onCreate ? (
        <form
          className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!note.trim() || busy) return;
            setBusy(true);
            setCreateError(null);
            try {
              await onCreate(note.trim());
              setNote("");
            } catch (reason) {
              setCreateError(
                reason instanceof Error
                  ? reason.message
                  : "Unable to add timeline activity.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Add a timeline note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a business note"
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !note.trim()}
            className="h-10 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add note"}
          </button>
        </form>
      ) : null}
      {createError ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {createError}
        </p>
      ) : null}
      {visible.length ? (
        <ol className="mt-4 divide-y divide-slate-100">
          {visible.slice(0, 50).map((item, index) => (
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
                {readRecordLabel(item.actorUser ?? item.actor) ??
                  String(item.actorName ?? item.actorType ?? "System")}
                {" · "}
                {formatRecordDate(
                  item.createdAt ?? item.timestamp ?? item.occurredAt ?? "",
                )}
              </p>
              {item.recordHref ? (
                <Link
                  href={String(item.recordHref)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-xs font-semibold text-[var(--admin-primary)]"
                >
                  Open linked record
                </Link>
              ) : null}
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
