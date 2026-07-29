"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";

type PolicyScope =
  | "TENANT"
  | "ORGANIZATION"
  | "BUSINESS_UNIT"
  | "DEPARTMENT"
  | "TEAM"
  | "EMPLOYEE";

type Policy = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  scopeType: PolicyScope;
  scopeId?: string | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  enabled: boolean;
  inheritUnspecified: boolean;
  version: number;
  settings: Record<string, unknown>;
};

type LookupOption = { id: string; name: string; code?: string };
type OverrideRow = { key: string; value: unknown };
type Preview = {
  effectivePolicy: Policy | null;
  appliedPolicies: Policy[];
  fields: Array<{
    key: string;
    effectiveValue: unknown;
    tenantValue: unknown;
    source: string;
    inherited: boolean;
    explanation: string;
  }>;
};

const scopePaths: Record<Exclude<PolicyScope, "TENANT">, string> = {
  ORGANIZATION: "/api/organizations?page=1&pageSize=100",
  BUSINESS_UNIT: "/api/business-units?page=1&pageSize=100",
  DEPARTMENT: "/api/departments?page=1&pageSize=100",
  TEAM: "/api/teams?page=1&pageSize=100",
  EMPLOYEE: "/api/employees?page=1&pageSize=100",
};

const initialDraft = () => ({
  name: "",
  code: "",
  description: "",
  scopeType: "TENANT" as PolicyScope,
  scopeId: "",
  priority: "0",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  enabled: true,
  inheritUnspecified: true,
});

export function TimesheetPolicyManager() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tenantSettings, setTenantSettings] = useState<Record<string, unknown>>(
    {},
  );
  const [employees, setEmployees] = useState<LookupOption[]>([]);
  const [scopeOptions, setScopeOptions] = useState<LookupOption[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSetting, setSelectedSetting] = useState("");
  const [previewEmployeeId, setPreviewEmployeeId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [policyResponse, settingsResponse, employeeResponse] =
      await Promise.all([
        fetch("/api/timesheet-policies", { cache: "no-store" }),
        fetch("/api/tenant-settings", { cache: "no-store" }),
        fetch(scopePaths.EMPLOYEE, { cache: "no-store" }),
      ]);
    if (!policyResponse.ok || !settingsResponse.ok || !employeeResponse.ok) {
      throw new Error("Unable to load timesheet policies and lookups.");
    }
    const policyPayload = (await policyResponse.json()) as unknown;
    const settingsPayload = (await settingsResponse.json()) as unknown;
    const employeePayload = (await employeeResponse.json()) as unknown;
    setPolicies(readItems(policyPayload) as Policy[]);
    setTenantSettings(readTimesheetSettings(settingsPayload));
    setEmployees(readLookupOptions(employeePayload));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load policies.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (draft.scopeType === "TENANT") {
      return;
    }
    const controller = new AbortController();
    void fetch(scopePaths[draft.scopeType], {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load scope records.");
        setScopeOptions(readLookupOptions(await response.json()));
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load scope records.",
          );
        }
      });
    return () => controller.abort();
  }, [draft.scopeType]);

  const availableSettingKeys = useMemo(
    () =>
      Object.keys(tenantSettings)
        .filter((key) => !overrides.some((row) => row.key === key))
        .sort((left, right) => left.localeCompare(right)),
    [overrides, tenantSettings],
  );
  const filteredPreviewFields = useMemo(() => {
    const search = filter.trim().toLowerCase();
    return (preview?.fields ?? []).filter(
      (field) =>
        !search ||
        field.key.toLowerCase().includes(search) ||
        field.source.toLowerCase().includes(search),
    );
  }, [filter, preview]);

  async function savePolicy() {
    if (!draft.name.trim() || (!editingId && !draft.code.trim())) {
      setError("Policy name and code are required.");
      return;
    }
    if (draft.scopeType !== "TENANT" && !draft.scopeId) {
      setError("Select a scope record.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = {
      name: draft.name.trim(),
      ...(!editingId ? { code: draft.code.trim() } : {}),
      description: draft.description.trim() || null,
      ...(!editingId
        ? { scopeType: draft.scopeType, scopeId: draft.scopeId || null }
        : {}),
      priority: Number(draft.priority || 0),
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || null,
      enabled: draft.enabled,
      inheritUnspecified: draft.inheritUnspecified,
      settings: Object.fromEntries(
        overrides.map((row) => [row.key, row.value]),
      ),
    };
    const response = await fetch(
      editingId
        ? `/api/timesheet-policies/${editingId}`
        : "/api/timesheet-policies",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setError(payload.message ?? "Unable to save timesheet policy.");
      setBusy(false);
      return;
    }
    setDraft(initialDraft());
    setOverrides([]);
    setEditingId(null);
    setNotice(
      editingId ? "A new policy version was created." : "Policy created.",
    );
    await load();
    setBusy(false);
  }

  function editPolicy(policy: Policy) {
    setEditingId(policy.id);
    setDraft({
      name: policy.name,
      code: policy.code,
      description: policy.description ?? "",
      scopeType: policy.scopeType,
      scopeId: policy.scopeId ?? "",
      priority: String(policy.priority),
      effectiveFrom: policy.effectiveFrom.slice(0, 10),
      effectiveTo: policy.effectiveTo?.slice(0, 10) ?? "",
      enabled: policy.enabled,
      inheritUnspecified: policy.inheritUnspecified,
    });
    setOverrides(
      Object.entries(policy.settings).map(([key, value]) => ({ key, value })),
    );
    setNotice(null);
    setError(null);
  }

  async function disablePolicy(policy: Policy) {
    if (
      !window.confirm(
        `Disable ${policy.name}? Existing policy history will be retained.`,
      )
    )
      return;
    setBusy(true);
    const response = await fetch(`/api/timesheet-policies/${policy.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setError(payload.message ?? "Unable to disable policy.");
    } else {
      setNotice("Policy disabled; historical versions were retained.");
      await load();
    }
    setBusy(false);
  }

  async function resolvePreview() {
    if (!previewEmployeeId) return;
    setBusy(true);
    setError(null);
    const previewResponse = await fetch(
      `/api/timesheet-policies/preview?employeeId=${encodeURIComponent(previewEmployeeId)}`,
      { cache: "no-store" },
    );
    const payload = (await previewResponse
      .json()
      .catch(() => ({}))) as Preview & {
      message?: string;
    };
    if (!previewResponse.ok)
      setError(payload.message ?? "Unable to resolve policy.");
    else setPreview(payload);
    setBusy(false);
  }

  function addOverride() {
    if (!selectedSetting) return;
    setOverrides((current) => [
      ...current,
      { key: selectedSetting, value: tenantSettings[selectedSetting] },
    ]);
    setSelectedSetting("");
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Scoped policies
            </h3>
            <p className="mt-1 max-w-4xl text-sm text-muted">
              More specific policies win: Employee, Team, Department,
              Business Unit, Organization, then Tenant. Values you do not
              override inherit the tenant defaults. Create one scoped policy
              per target, including one per business unit when several units
              need the same override.
            </p>
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
            {policies.filter((policy) => policy.enabled).length} active
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <Input
            label="Name"
            value={draft.name}
            onChange={(name) => setDraft((value) => ({ ...value, name }))}
          />
          <Input
            disabled={Boolean(editingId)}
            label="Code"
            value={draft.code}
            onChange={(code) => setDraft((value) => ({ ...value, code }))}
          />
          <Select
            disabled={Boolean(editingId)}
            label="Scope"
            value={draft.scopeType}
            onChange={(scopeType) =>
              setDraft((value) => ({
                ...value,
                scopeType: scopeType as PolicyScope,
                scopeId: "",
              }))
            }
            options={[
              "TENANT",
              "ORGANIZATION",
              "BUSINESS_UNIT",
              "DEPARTMENT",
              "TEAM",
              "EMPLOYEE",
            ].map((value) => ({ value, label: readable(value) }))}
          />
          {draft.scopeType !== "TENANT" ? (
            <Select
              disabled={Boolean(editingId)}
              label="Scope record"
              value={draft.scopeId}
              onChange={(scopeId) =>
                setDraft((value) => ({ ...value, scopeId }))
              }
              options={scopeOptions.map((record) => ({
                value: record.id,
                label: record.code
                  ? `${record.name} (${record.code})`
                  : record.name,
              }))}
            />
          ) : (
            <Input
              label="Priority"
              type="number"
              value={draft.priority}
              onChange={(priority) =>
                setDraft((value) => ({ ...value, priority }))
              }
            />
          )}
          <Input
            label="Effective from"
            type="date"
            value={draft.effectiveFrom}
            onChange={(effectiveFrom) =>
              setDraft((value) => ({ ...value, effectiveFrom }))
            }
          />
          <Input
            label="Effective to"
            type="date"
            value={draft.effectiveTo}
            onChange={(effectiveTo) =>
              setDraft((value) => ({ ...value, effectiveTo }))
            }
          />
          {draft.scopeType !== "TENANT" ? (
            <Input
              label="Priority"
              type="number"
              value={draft.priority}
              onChange={(priority) =>
                setDraft((value) => ({ ...value, priority }))
              }
            />
          ) : null}
          <Input
            label="Description"
            value={draft.description}
            onChange={(description) =>
              setDraft((value) => ({ ...value, description }))
            }
          />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface/50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Add setting override"
              value={selectedSetting}
              onChange={setSelectedSetting}
              options={availableSettingKeys.map((key) => ({
                value: key,
                label: readable(key),
              }))}
            />
            <button
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-medium"
              onClick={addOverride}
              type="button"
            >
              Add override
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {overrides.map((row) => (
              <OverrideInput
                key={row.key}
                row={row}
                onChange={(value) =>
                  setOverrides((current) =>
                    current.map((item) =>
                      item.key === row.key ? { ...item, value } : item,
                    ),
                  )
                }
                onRemove={() =>
                  setOverrides((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
              />
            ))}
          </div>
          {overrides.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No overrides. This policy inherits every tenant setting.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <Checkbox
            checked={draft.inheritUnspecified}
            label="Inherit unspecified values"
            onChange={(inheritUnspecified) =>
              setDraft((value) => ({ ...value, inheritUnspecified }))
            }
          />
          <Checkbox
            checked={draft.enabled}
            label="Active"
            onChange={(enabled) => setDraft((value) => ({ ...value, enabled }))}
          />
          <PermissionGate permission="timesheets.settings.update">
            <button
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
              disabled={busy}
              onClick={savePolicy}
              type="button"
            >
              {busy
                ? "Saving…"
                : editingId
                  ? "Create new version"
                  : "Create policy"}
            </button>
          </PermissionGate>
          {editingId ? (
            <button
              className="rounded-lg border border-border px-4 py-2"
              onClick={() => {
                setEditingId(null);
                setDraft(initialDraft());
                setOverrides([]);
              }}
              type="button"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </section>

      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Policy</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Overrides</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map((policy) => (
                <tr
                  key={policy.id}
                  className={!policy.enabled ? "opacity-55" : ""}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{policy.name}</p>
                    <p className="text-xs text-muted">{policy.code}</p>
                  </td>
                  <td className="px-4 py-3">{readable(policy.scopeType)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {policy.effectiveFrom.slice(0, 10)} →{" "}
                    {policy.effectiveTo?.slice(0, 10) ?? "Open"}
                  </td>
                  <td className="px-4 py-3">v{policy.version}</td>
                  <td className="px-4 py-3">
                    {Object.keys(policy.settings).length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className="text-accent"
                        onClick={() => editPolicy(policy)}
                        type="button"
                      >
                        Edit
                      </button>
                      {policy.enabled ? (
                        <button
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => void disablePolicy(policy)}
                          type="button"
                        >
                          Disable
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {policies.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={6}>
                    No scoped policies. Tenant settings are currently effective.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-4">
        <h3 className="text-base font-semibold text-foreground">
          Resolved Policy Preview
        </h3>
        <p className="mt-1 text-sm text-muted">
          This calls the same resolver used by generation, validation,
          approvals, jobs, exports, and payroll readiness.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select
            label="Employee"
            value={previewEmployeeId}
            onChange={setPreviewEmployeeId}
            options={employees.map((employee) => ({
              value: employee.id,
              label: employee.code
                ? `${employee.name} (${employee.code})`
                : employee.name,
            }))}
          />
          <button
            className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy || !previewEmployeeId}
            onClick={() => void resolvePreview()}
            type="button"
          >
            Resolve
          </button>
          {preview ? (
            <Input
              label="Filter resolved fields"
              value={filter}
              onChange={setFilter}
            />
          ) : null}
        </div>
        {preview ? (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Effective: {preview.effectivePolicy?.name ?? "Tenant defaults"}
              </span>
              <span className="rounded-full bg-surface px-3 py-1 text-muted">
                {preview.appliedPolicies.length} applied policy layers
              </span>
            </div>
            <div className="max-h-[32rem] overflow-auto rounded-xl border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Setting</th>
                    <th className="px-3 py-2">Effective value</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPreviewFields.map((field) => (
                    <tr key={field.key}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{readable(field.key)}</p>
                        <p className="text-xs text-muted">
                          {field.explanation}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {displayValue(field.effectiveValue)}
                      </td>
                      <td className="px-3 py-2">{field.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Input({
  disabled,
  label,
  onChange,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid min-w-44 flex-1 gap-1 text-xs font-medium text-muted">
      <span>{label}</span>
      <input
        className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-accent disabled:bg-surface"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Select({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium text-muted">
      <span>{label}</span>
      <select
        className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-accent disabled:bg-surface"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Select…</option>
        {options.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function OverrideInput({
  onChange,
  onRemove,
  row,
}: {
  onChange: (value: unknown) => void;
  onRemove: () => void;
  row: OverrideRow;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {readable(row.key)}
        </span>
        <button
          className="text-xs text-red-600"
          onClick={onRemove}
          type="button"
        >
          Remove
        </button>
      </div>
      <div className="mt-2">
        {typeof row.value === "boolean" ? (
          <Checkbox
            checked={row.value}
            label={row.value ? "Enabled" : "Disabled"}
            onChange={onChange}
          />
        ) : (
          <input
            className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            onChange={(event) =>
              onChange(
                typeof row.value === "number"
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
            type={typeof row.value === "number" ? "number" : "text"}
            value={String(row.value ?? "")}
          />
        )}
      </div>
    </div>
  );
}

function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  return Array.isArray(value.items) ? value.items : [];
}

function readTimesheetSettings(value: unknown) {
  if (!isRecord(value)) return {};
  const root = isRecord(value.settings) ? value.settings : value;
  return isRecord(root.timesheets) ? root.timesheets : {};
}

function readLookupOptions(value: unknown): LookupOption[] {
  return readItems(value).flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = string(item.id);
    const name =
      string(item.name) ||
      [string(item.firstName), string(item.lastName)]
        .filter(Boolean)
        .join(" ") ||
      string(item.label);
    return id && name
      ? [
          {
            id,
            name,
            code: string(item.code) || string(item.employeeCode) || undefined,
          },
        ]
      : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function readable(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function displayValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
