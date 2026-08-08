"use client";

import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clock,
  Laptop,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  resolveSystemWidgetAvailability,
  type SystemWidgetDefinition,
} from "@repo/config";
import type {
  FormComponentMetadata,
  TimelineEntryMetadata,
  WidgetMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { flattenRuntimeRoles } from "@/lib/runtime/role-runtime";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  NumberField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { formatDateTime } from "@/lib/formatting-context";
import { DataTable } from "@/app/components/data-table/data-table";
import {
  RuntimeProfileImageCard,
  type RuntimeProfileImageSummary,
} from "@/app/components/runtime/runtime-profile-image-card";
import { DocumentList } from "@/app/(authenticated)/_components/documents/document-list";
import { DocumentUploadForm } from "@/app/(authenticated)/_components/documents/document-upload-form";
import type {
  GenericDocumentRecord,
  SharedLookupOption,
} from "@/app/(authenticated)/_components/documents/types";

export function ModuleWidgetRenderer({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  if (component.widgetType === "organization_hierarchy") {
    return (
      <OrganizationHierarchyWidget component={component} runtime={runtime} />
    );
  }

  if (component.widgetType === "agent_desktop") {
    return (
      <ModuleAgentDesktopWidget
        component={component}
        dataAdapter={dataAdapter}
        runtime={runtime}
      />
    );
  }

  if (
    component.widgetType === "currency_exchange_rate" ||
    component.widgetType === "currency_manual_override" ||
    component.widgetType === "currency_usage"
  ) {
    return (
      <CurrencyRuntimeWidget
        component={component}
        dataAdapter={dataAdapter}
        runtime={runtime}
      />
    );
  }

  if (component.widgetType === "regional_usage") {
    return (
      <RegionalUsageWidget
        component={component}
        dataAdapter={dataAdapter}
        runtime={runtime}
      />
    );
  }

  if (
    component.widgetType === "user_security" ||
    component.widgetType === "user_employee_link"
  ) {
    return <UserRecordWidget component={component} runtime={runtime} />;
  }

  if (
    component.widgetType === "user_sessions" ||
    component.widgetType === "user_login_history"
  ) {
    return <UserCollectionWidget component={component} runtime={runtime} />;
  }

  const availability = resolveSystemWidgetAvailability({
    widgetKey: component.widgetId,
    widgetType: component.widgetType,
    lifecycleState: component.lifecycleState,
    formComponentType: component.type,
    moduleKey: runtime?.module.key ?? "",
    moduleCapabilities: runtime?.module.capabilities,
    recordId: runtime?.recordId,
    adapterMethods: resolveAdapterMethods(dataAdapter),
    permissionKeys: runtime?.security.principal.permissionKeys,
    roleKeys: flattenRuntimeRoles([
      ...(runtime?.security.principal.roleKeys ?? []),
      ...(runtime?.security.principal.roles ?? []),
    ]),
  });
  const title =
    component.label ??
    availability.definition?.displayName ??
    "Widget unavailable";

  if (availability.status !== "available" || !availability.definition) {
    return (
      <WidgetState
        description={availability.message}
        title={title}
        tone={availability.status === "unsaved-record" ? "neutral" : "warning"}
      />
    );
  }

  const renderer = BUILTIN_WIDGET_RENDERERS[availability.definition.widgetKey];
  if (renderer) {
    return renderer({
      component,
      dataAdapter,
      definition: availability.definition,
      runtime,
    });
  }

  return (
    <WidgetState
      description="This System Widget has no registered renderer."
      title={title}
      tone="warning"
    />
  );
}

function RegionalUsageWidget({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(runtime?.recordId));
  const recordId = runtime?.recordId;

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!runtime || !recordId || !dataAdapter?.getWidgetData) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await dataAdapter.getWidgetData({
          runtime,
          recordId,
          widget: {
            id: component.widgetId ?? component.id,
            logicalName: `regional.${component.widgetId ?? component.id}`,
            displayName: component.label ?? "Usage",
            version: "1.0.0",
            lifecycleState: "published",
            layer: "system",
            widgetType: component.widgetType ?? "",
            isSystem: true,
            isCustom: false,
            allowedModuleKeys: [runtime.module.key],
          },
        });
        if (mounted) {
          setData(isRecord(result) ? result : null);
          setError(null);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load usage.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [component, dataAdapter, recordId, runtime]);

  if (loading) {
    return (
      <WidgetState
        title={component.label ?? "Usage"}
        description="Loading usage..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        title={component.label ?? "Usage"}
        description={error}
        tone="warning"
      />
    );
  }
  return <UsageCountsTable data={data ?? { usages: [] }} />;
}

function UserRecordWidget({
  component,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(runtime?.recordId));
  const recordId = runtime?.recordId;

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!recordId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(recordId)}`,
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            stringValue(isRecord(payload) ? payload.message : null) ||
              "Unable to load user details.",
          );
        }
        if (mounted) {
          setRecord(isRecord(payload) ? payload : null);
          setError(null);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load user details.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [recordId]);

  if (loading) {
    return (
      <WidgetState
        title={component.label ?? "User"}
        description="Loading user details..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        title={component.label ?? "User"}
        description={error}
        tone="warning"
      />
    );
  }
  if (!record) {
    return (
      <WidgetState
        title={component.label ?? "User"}
        description="User details are not available."
      />
    );
  }

  if (component.widgetType === "user_employee_link") {
    return <UserEmployeeLinkWidget user={record} />;
  }

  return <UserSecurityWidget user={record} />;
}

function UserSecurityWidget({
  user,
}: {
  readonly user: Record<string, unknown>;
}) {
  const fields = [
    ["User Status", stringValue(user.status)],
    ["Login Enabled", stringValue(user.status) === "ACTIVE" ? "Yes" : "No"],
    ["Service Account", user.isServiceAccount ? "Yes" : "No"],
    ["Last Login", formatOptionalDateTime(user.lastLoginAt)],
    ["Created On", formatOptionalDateTime(user.createdAt)],
  ] as const;

  return (
    <section className="grid gap-4">
      <div>
        <h4 className="text-base font-semibold text-foreground">Security</h4>
        <p className="mt-1 text-sm text-muted">
          Account state and login posture for this user.
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <ReadOnlyMetric key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function UserEmployeeLinkWidget({
  user,
}: {
  readonly user: Record<string, unknown>;
}) {
  const employee = isRecord(user.linkedEmployee) ? user.linkedEmployee : null;
  const isServiceAccount = Boolean(user.isServiceAccount);

  if (isServiceAccount) {
    return (
      <WidgetState
        title="Employee Link"
        description="Service accounts cannot be linked to employee profiles."
      />
    );
  }

  if (!employee) {
    return (
      <WidgetState
        title="Employee Link"
        description="No employee profile is linked to this user."
      />
    );
  }

  const profileHref =
    stringValue(employee.profileHref) ||
    stringValue(employee.profileUrl) ||
    stringValue(employee.recordHref);
  const fields = [
    ["Employee", stringValue(employee.fullName)],
    ["Email", stringValue(employee.email)],
    ["Organization", stringValue(employee.organizationName)],
    ["Business Unit", stringValue(employee.businessUnitName)],
    ["Department", stringValue(employee.departmentName)],
    ["Team", stringValue(employee.teamName)],
    ["Designation", stringValue(employee.designationName)],
    ["Reporting Manager", stringValue(employee.managerName)],
  ] as const;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-foreground">
            Employee Link
          </h4>
          <p className="mt-1 text-sm text-muted">
            HR profile connected to this identity account.
          </p>
        </div>
        {profileHref ? (
          <Button href={profileHref} type="button" variant="secondary">
            Open Profile
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-3">
        {fields.map(([label, value]) => (
          <ReadOnlyMetric key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function UserCollectionWidget({
  component,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const recordId = runtime?.recordId;
  const [rows, setRows] = useState<readonly Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(recordId));

  const path =
    component.widgetType === "user_sessions"
      ? `/api/users/${encodeURIComponent(recordId ?? "")}/sessions`
      : `/api/users/${encodeURIComponent(recordId ?? "")}/login-history`;

  const load = useMemo(
    () => async () => {
      if (!recordId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(path);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            stringValue(isRecord(payload) ? payload.message : null) ||
              "Unable to load user records.",
          );
        }
        setRows(Array.isArray(payload) ? payload.filter(isRecord) : []);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to load records.",
        );
      } finally {
        setLoading(false);
      }
    },
    [path, recordId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <WidgetState
        title={component.label ?? "Records"}
        description="Loading records..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        title={component.label ?? "Records"}
        description={error}
        tone="warning"
      />
    );
  }

  if (component.widgetType === "user_sessions") {
    return (
      <UserSessionsWidget
        onChanged={load}
        rows={[...rows]}
        userId={recordId ?? ""}
      />
    );
  }

  return <UserLoginHistoryWidget rows={rows} />;
}

function UserSessionsWidget({
  onChanged,
  rows,
  userId,
}: {
  readonly onChanged: () => Promise<void>;
  readonly rows: readonly Record<string, unknown>[];
  readonly userId: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(sessionId: string) {
    setBusyId(sessionId);
    setError(null);
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          stringValue(isRecord(payload) ? payload.message : null) ||
            "Unable to revoke session.",
        );
      }
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to revoke session.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h4 className="sr-only">Sessions</h4>
        <p className="mt-1 text-sm text-muted">
          Active and revoked browser sessions. Rotated refresh-token rows are
          grouped into a single session.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <DataTable
        columns={[
          {
            key: "sessionStatus",
            header: "Status",
            render: (row) => stringValue(row.sessionStatus),
            sortable: true,
          },
          {
            key: "appClientId",
            header: "Client",
            render: (row) => stringValue(row.appClientId),
            sortable: true,
          },
          {
            key: "ipAddress",
            header: "IP Address",
            render: (row) => stringValue(row.ipAddress),
          },
          {
            key: "device",
            header: "Device",
            render: (row) => stringValue(row.device),
          },
          {
            key: "tokenCount",
            header: "Tokens",
            render: (row) => String(numberValue(row.tokenCount)),
            sortable: true,
          },
          {
            key: "createdAt",
            header: "Created On",
            render: (row) => formatOptionalDateTime(row.createdAt),
          },
          {
            key: "lastUsedAt",
            header: "Last Used",
            render: (row) => formatOptionalDateTime(row.lastUsedAt),
          },
          {
            key: "lastActivityAt",
            header: "Last Activity",
            render: (row) => formatOptionalDateTime(row.lastActivityAt),
            sortable: true,
          },
          {
            key: "expiresAt",
            header: "Expires",
            render: (row) => formatOptionalDateTime(row.expiresAt),
          },
          {
            key: "revokedAt",
            header: "Revoked",
            render: (row) => formatOptionalDateTime(row.revokedAt),
          },
          {
            key: "actions",
            header: "",
            render: (row) => {
              const id = stringValue(row.id);
              const active = stringValue(row.sessionStatus) === "ACTIVE";
              return !active || !id ? (
                ""
              ) : (
                <Button
                  disabled={busyId === id}
                  onClick={() => void revoke(id)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Revoke
                </Button>
              );
            },
          },
        ]}
        entityLogicalName="user-sessions"
        getRowKey={(row) => stringValue(row.id)}
        pagination={{
          page: 1,
          pageSize: 10,
          totalItems: rows.length,
          pageSizeOptions: [10, 25, 50],
        }}
        rows={[...rows]}
      />
    </section>
  );
}

function UserLoginHistoryWidget({
  rows,
}: {
  readonly rows: readonly Record<string, unknown>[];
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h4 className="sr-only">Login History</h4>
        <p className="mt-1 text-sm text-muted">
          Authentication audit events currently available for this user.
        </p>
      </div>
      <DataTable
        columns={[
          {
            key: "loginTime",
            header: "Event Time",
            render: (row) => formatOptionalDateTime(row.loginTime),
            sortable: true,
          },
          {
            key: "event",
            header: "Event",
            render: (row) => stringValue(row.event),
            sortable: true,
          },
          {
            key: "result",
            header: "Result",
            render: (row) => stringValue(row.result),
            sortable: true,
          },
          {
            key: "user",
            header: "User",
            render: (row) => stringValue(row.user),
          },
          {
            key: "email",
            header: "Email",
            render: (row) => stringValue(row.email),
          },
          {
            key: "ipAddress",
            header: "IP Address",
            render: (row) => stringValue(row.ipAddress),
          },
          {
            key: "appClient",
            header: "Client",
            render: (row) => stringValue(row.appClient),
          },
          {
            key: "sessionId",
            header: "Session",
            render: (row) => stringValue(row.sessionId),
          },
          {
            key: "failureReason",
            header: "Failure Reason",
            render: (row) => stringValue(row.failureReason),
          },
          {
            key: "userAgent",
            header: "User Agent",
            render: (row) => stringValue(row.userAgent),
          },
        ]}
        entityLogicalName="user-login-history"
        getRowKey={(row) => stringValue(row.id)}
        pagination={{
          page: 1,
          pageSize: 10,
          totalItems: rows.length,
          pageSizeOptions: [10, 25, 50],
        }}
        rows={[...rows]}
      />
    </section>
  );
}

function CurrencyRuntimeWidget({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(runtime?.recordId));
  const recordId = runtime?.recordId;

  const load = useMemo(
    () => async () => {
      if (!runtime || !recordId || !dataAdapter?.getWidgetData) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await dataAdapter.getWidgetData({
          runtime,
          recordId,
          widget: {
            id: component.widgetId ?? component.id,
            logicalName: `currency.${component.widgetType}`,
            displayName: component.label ?? "Currency",
            version: "1.0.0",
            lifecycleState: "published",
            layer: "system",
            widgetType: component.widgetType ?? "",
            isSystem: true,
            isCustom: false,
            allowedModuleKeys: ["settings-currencies"],
          },
        });
        setData(isRecord(result) ? result : null);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load currency data.",
        );
      } finally {
        setLoading(false);
      }
    },
    [component, dataAdapter, recordId, runtime],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <WidgetState
        title={component.label ?? "Currency"}
        description="Loading currency details..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        title={component.label ?? "Currency"}
        description={error}
        tone="warning"
      />
    );
  }
  if (!data) {
    return (
      <WidgetState
        title={component.label ?? "Currency"}
        description="Currency details are not available."
      />
    );
  }

  if (component.widgetType === "currency_manual_override") {
    return (
      <CurrencyManualOverrideWidget
        data={data}
        recordId={recordId ?? ""}
        onSaved={load}
      />
    );
  }

  if (component.widgetType === "currency_usage") {
    return <CurrencyUsageWidget data={data} />;
  }

  return <CurrencyExchangeRateWidget data={data} />;
}

function CurrencyExchangeRateWidget({
  data,
}: {
  readonly data: Record<string, unknown>;
}) {
  const fields = [
    ["From Currency", stringValue(data.fromCurrency)],
    ["To Currency", stringValue(data.toCurrency)],
    ["Rate", stringValue(data.rate)],
    ["Source", stringValue(data.source)],
    ["Provider", stringValue(data.provider)],
    ["Last Fetched At", formatOptionalDateTime(data.lastFetchedAt)],
    ["Fetch Status", stringValue(data.fetchStatus)],
    ["Last Error", stringValue(data.lastError)],
  ] as const;

  return (
    <section className="grid gap-4">
      <div>
        <h4 className="text-base font-semibold text-foreground">
          Exchange Rate
        </h4>
        <p className="mt-1 text-sm text-muted">
          Current conversion from the tenant default currency to this currency.
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <ReadOnlyMetric key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function CurrencyManualOverrideWidget({
  data,
  onSaved,
  recordId,
}: {
  readonly data: Record<string, unknown>;
  readonly onSaved: () => Promise<void>;
  readonly recordId: string;
}) {
  const [overrideRate, setOverrideRate] = useState(
    numberValue(data.overrideRate) || null,
  );
  const [overrideReason, setOverrideReason] = useState(
    stringValue(data.overrideReason),
  );
  const [notes, setNotes] = useState(stringValue(data.notes));
  const [active, setActive] = useState(Boolean(data.active));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveOverride() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/configuration/currencies/${encodeURIComponent(recordId)}/manual-override`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            active,
            notes,
            overrideRate,
            overrideReason,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          stringValue(isRecord(payload) ? payload.message : null) ||
            "Unable to save manual override.",
        );
      }
      setMessage("Manual override saved.");
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save manual override.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h4 className="text-base font-semibold text-foreground">
          Manual Override
        </h4>
        <p className="mt-1 text-sm text-muted">
          Active manual overrides take priority over provider rates.
        </p>
      </div>
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 rounded-lg border border-border bg-white p-4 md:grid-cols-2">
        <NumberField
          label="Override Rate"
          min={0}
          onChange={setOverrideRate}
          required={active}
          step={0.000001}
          value={overrideRate}
        />
        <CheckboxField checked={active} label="Active" onChange={setActive} />
        <TextField
          className="md:col-span-2"
          label="Override Reason"
          onChange={setOverrideReason}
          required={active}
          value={overrideReason}
        />
        <TextAreaField
          className="md:col-span-2"
          label="Notes"
          onChange={setNotes}
          value={notes}
        />
      </div>
      <div>
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          loading={saving}
          onClick={() => void saveOverride()}
          type="button"
        >
          Save Override
        </Button>
      </div>
    </section>
  );
}

function CurrencyUsageWidget({
  data,
}: {
  readonly data: Record<string, unknown>;
}) {
  return <UsageCountsTable data={data} />;
}

function UsageCountsTable({
  data,
}: {
  readonly data: Record<string, unknown>;
}) {
  const usages = Array.isArray(data.usages) ? data.usages.filter(isRecord) : [];
  const total = usages.reduce((sum, item) => sum + numberValue(item.count), 0);
  const hasBlocksDelete = usages.some((item) => "blocksDelete" in item);

  return (
    <section className="grid gap-4">
      <div>
        <h4 className="text-base font-semibold text-foreground">Usage</h4>
        <p className="mt-1 text-sm text-muted">
          This currency is referenced by {total} record{total === 1 ? "" : "s"}.
        </p>
      </div>
      <DataTable
        columns={[
          {
            key: "area",
            header: "Area",
            render: (row) => stringValue(row.area),
          },
          {
            key: "count",
            header: "Records",
            render: (row) => String(numberValue(row.count)),
            sortable: true,
          },
          ...(hasBlocksDelete
            ? [
                {
                  key: "blocksDelete",
                  header: "Blocks Delete",
                  render: (row: Record<string, unknown>) =>
                    row.blocksDelete ? "Yes" : "No",
                },
              ]
            : []),
        ]}
        getRowKey={(row) => stringValue(row.area)}
        rows={usages}
      />
    </section>
  );
}

function ReadOnlyMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 min-h-6 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ModuleAgentDesktopWidget({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) {
      return;
    }
    let active = true;
    const getWidgetData = dataAdapter.getWidgetData;
    const load = () =>
      getWidgetData({
        runtime,
        recordId,
        widget: {
          id: component.widgetId ?? component.id,
          logicalName: "system.agentDesktop",
          displayName: component.label ?? "Agent Desktop",
          version: "1.0.0",
          lifecycleState: "published",
          layer: "system",
          widgetType: "agent_desktop",
          isSystem: true,
          isCustom: false,
          allowedModuleKeys: ["employees"],
        },
      })
        .then((result) => {
          if (!active) return;
          setData(isRecord(result) ? result : null);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Agent Desktop data.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    void load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [component, dataAdapter, recordId, reloadToken, runtime]);

  if (loading) {
    return (
      <WidgetState
        title="Agent Desktop"
        description="Loading Agent Desktop data..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState title="Agent Desktop" description={error} tone="warning" />
    );
  }
  if (!data) {
    return (
      <WidgetState
        title="Agent Desktop"
        description="No Agent Desktop activity is available for this employee."
      />
    );
  }

  const latestSession = isRecord(data.latestSession)
    ? data.latestSession
    : null;
  const todaySummary = isRecord(data.todaySummary) ? data.todaySummary : null;
  const employee = isRecord(data.employee) ? data.employee : null;
  const retention = isRecord(data.retention) ? data.retention : null;
  const devices = Array.isArray(data.devices)
    ? data.devices.filter(isRecord)
    : [];
  const recentEvents = Array.isArray(data.recentEvents)
    ? data.recentEvents.filter(isRecord)
    : [];
  const latestLocationRequest = isRecord(data.latestLocationRequest)
    ? data.latestLocationRequest
    : null;
  const liveStatus = stringValue(data.liveStatus) || "OFFLINE";
  const lastActivityAt =
    stringValue(latestSession?.lastHeartbeatAt) ||
    stringValue(latestSession?.endedAt) ||
    stringValue(latestSession?.startedAt);
  const canRequestLocation = devices.some(
    (device) =>
      device.isActive !== false &&
      stringValue(device.locationPermission).toUpperCase() === "GRANTED",
  );

  async function requestLocation() {
    if (!recordId || requestingLocation) return;

    setRequestingLocation(true);
    setLocationMessage(null);

    /*
     * The module segment comes from the widget's own configuration so this
     * shared renderer stays free of module specific routes.
     */
    const moduleSegment = runtime.module.key;

    try {
      const response = await fetch(
        `/api/agent/${moduleSegment}/${encodeURIComponent(recordId)}/location-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to request location.");
      }

      setLocationMessage(
        "Location request sent. It will update here after the employee responds.",
      );
      setReloadToken((value) => value + 1);
    } catch (caught) {
      setLocationMessage(
        caught instanceof Error ? caught.message : "Unable to request location.",
      );
    } finally {
      setRequestingLocation(false);
    }
  }

  return (
    <section className="grid w-full min-w-0 gap-5 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-foreground">
            {component.label ?? "Agent Desktop"}
          </h4>
          <p className="mt-1 text-sm text-muted">
            {stringValue(employee?.fullName) || "Employee"} activity, device,
            and productivity telemetry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!canRequestLocation || requestingLocation}
            onClick={requestLocation}
            type="button"
            variant="secondary"
          >
            <MapPin className="h-4 w-4" />
            {requestingLocation ? "Requesting..." : "Request location"}
          </Button>
          <AgentStatusBadge value={liveStatus} />
          <span className="inline-flex h-9 min-w-24 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border px-3 text-xs font-medium text-muted">
            {devices.length} device{devices.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex h-9 min-w-24 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border px-3 text-xs font-medium text-muted">
            {recentEvents.length} recent
          </span>
        </div>
      </div>

      {locationMessage ? (
        <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm font-medium text-info">
          {locationMessage}
        </div>
      ) : !canRequestLocation ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
          {devices.length === 0
            ? "Location cannot be requested until this employee signs in to the desktop agent at least once."
            : "Location cannot be requested until the desktop agent reports granted location permission. Ask the employee to open the agent's Device permissions window with Windows location enabled for desktop apps."}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AgentMetric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Live status"
          value={formatStatus(liveStatus)}
        />
        <AgentMetric
          icon={<Activity className="h-4 w-4" />}
          label="Logged in"
          value={durationLabel(todaySummary?.loggedInSeconds)}
        />
        <AgentMetric
          icon={<Timer className="h-4 w-4" />}
          label="Active time"
          value={durationLabel(todaySummary?.activeSeconds)}
        />
        <AgentMetric
          icon={<Clock className="h-4 w-4" />}
          label="Idle time"
          value={durationLabel(todaySummary?.idleSeconds)}
        />
        <AgentMetric
          icon={<Clock className="h-4 w-4" />}
          label="Away time"
          value={durationLabel(todaySummary?.awaySeconds)}
        />
        <AgentMetric
          icon={<Activity className="h-4 w-4" />}
          label="Utilization"
          value={`${Math.round(numberValue(todaySummary?.utilizationPercent))}%`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AgentDetailPanel title="Latest session">
          <AgentDetailItem
            label="Status"
            value={formatStatus(stringValue(latestSession?.status))}
          />
          <AgentDetailItem
            label="Started"
            value={
              formatDateTime(
                stringValue(latestSession?.startedAt),
                runtime?.tenant,
              ) || "Not set"
            }
          />
          <AgentDetailItem
            label="Last heartbeat"
            value={
              formatDateTime(
                stringValue(latestSession?.lastHeartbeatAt),
                runtime?.tenant,
              ) || "Not set"
            }
          />
          <AgentDetailItem
            label="Ended"
            value={
              formatDateTime(
                stringValue(latestSession?.endedAt),
                runtime?.tenant,
              ) || "Not ended"
            }
          />
          <AgentDetailItem
            label="Session active"
            value={durationLabel(latestSession?.totalActiveSeconds)}
          />
          <AgentDetailItem
            label="Session idle"
            value={durationLabel(latestSession?.totalIdleSeconds)}
          />
          <AgentDetailItem
            label="Session away"
            value={durationLabel(latestSession?.totalAwaySeconds)}
          />
        </AgentDetailPanel>

        <AgentDetailPanel title="Reporting window">
          <AgentDetailItem
            label="Last activity"
            value={
              formatDateTime(lastActivityAt, runtime?.tenant) || "Not seen yet"
            }
          />
          <AgentDetailItem
            label="Retention"
            value={`${numberValue(retention?.historyRetentionDays)} days`}
          />
          <AgentDetailItem
            label="From"
            value={
              formatDateTime(stringValue(retention?.from), runtime?.tenant) ||
              "Not set"
            }
          />
          <AgentDetailItem
            label="To"
            value={
              formatDateTime(stringValue(retention?.to), runtime?.tenant) ||
              "Not set"
            }
          />
          <AgentDetailItem
            label="Employee ID"
            value={stringValue(employee?.id) || "Not set"}
          />
          <AgentDetailItem
            label="User ID"
            value={stringValue(employee?.userId) || "Not linked"}
          />
        </AgentDetailPanel>
      </div>

      <AgentLocationPanel
        location={latestLocationRequest}
        tenant={runtime?.tenant}
      />

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-muted" />
          <h5 className="text-sm font-semibold text-foreground">
            Registered devices
          </h5>
        </div>
        <p className="text-xs text-muted">
          Camera, microphone, and location permissions are requested by the
          installed desktop agent and shown here after the employee responds.
        </p>
        <DataTable
          columns={[
            {
              key: "deviceName",
              header: "Device",
              searchable: true,
              render: (row) =>
                stringValue(row.deviceName) || stringValue(row.id) || "Unknown",
            },
            {
              key: "platform",
              header: "Platform",
              render: (row) => stringValue(row.platform) || "Not set",
            },
            {
              key: "os",
              header: "OS",
              render: (row) => stringValue(row.os) || "Not set",
            },
            {
              key: "agentVersion",
              header: "Agent Version",
              render: (row) => stringValue(row.agentVersion) || "Not set",
            },
            {
              key: "isActive",
              header: "Active",
              render: (row) => (row.isActive === false ? "No" : "Yes"),
            },
            {
              key: "cameraPermission",
              header: "Camera",
              render: (row) => (
                <AgentPermissionBadge value={stringValue(row.cameraPermission)} />
              ),
            },
            {
              key: "microphonePermission",
              header: "Microphone",
              render: (row) => (
                <AgentPermissionBadge
                  value={stringValue(row.microphonePermission)}
                />
              ),
            },
            {
              key: "locationPermission",
              header: "Location",
              render: (row) => (
                <AgentPermissionBadge value={stringValue(row.locationPermission)} />
              ),
            },
            {
              key: "lastSeenAt",
              header: "Last Seen",
              sortable: true,
              sortAccessor: (row) => stringValue(row.lastSeenAt),
              render: (row) =>
                formatDateTime(
                  stringValue(row.lastSeenAt) ||
                    stringValue(row.lastHeartbeatAt),
                  runtime?.tenant,
                ) || "Not set",
            },
          ]}
          emptyState={
            <p className="p-4 text-sm text-muted">
              No registered Agent Desktop devices.
            </p>
          }
          enableSearch
          getRowKey={(row) => stringValue(row.id)}
          pagination={{
            page: 1,
            pageSize: 5,
            totalItems: devices.length,
            pageSizeOptions: [5, 10, 25],
          }}
          rows={devices}
          searchPlaceholder="Search devices"
        />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted" />
          <h5 className="text-sm font-semibold text-foreground">
            Recent activity events
          </h5>
        </div>
        <DataTable
          columns={[
            {
              key: "occurredAt",
              header: "Occurred At",
              sortable: true,
              sortAccessor: (row) => stringValue(row.occurredAt),
              searchAccessor: (row) =>
                formatDateTime(stringValue(row.occurredAt), runtime?.tenant) ||
                stringValue(row.occurredAt),
              render: (row) =>
                formatDateTime(stringValue(row.occurredAt), runtime?.tenant) ||
                "Not set",
            },
            {
              key: "state",
              header: "State",
              filterable: true,
              filterType: "select",
              filterOptions: [
                { label: "Active", value: "ACTIVE" },
                { label: "Idle", value: "IDLE" },
                { label: "Away", value: "AWAY" },
              ],
              filterAccessor: (row) => stringValue(row.state),
              searchAccessor: (row) => formatStatus(stringValue(row.state)),
              render: (row) => formatStatus(stringValue(row.state)),
            },
            {
              key: "idleSeconds",
              header: "Idle Seconds",
              searchAccessor: (row) => numberValue(row.idleSeconds),
              render: (row) => String(numberValue(row.idleSeconds)),
            },
            {
              key: "activeApp",
              header: "Active App",
              searchable: true,
              searchAccessor: (row) => stringValue(row.activeApp),
              render: (row) => stringValue(row.activeApp) || "Not captured",
            },
            {
              key: "windowTitle",
              header: "Window Title",
              searchable: true,
              searchAccessor: (row) => stringValue(row.windowTitle),
              render: (row) => stringValue(row.windowTitle) || "Not captured",
            },
            {
              key: "browserTabTitle",
              header: "Browser Tab",
              searchable: true,
              searchAccessor: (row) => stringValue(row.browserTabTitle),
              render: (row) =>
                stringValue(row.browserTabTitle) || "Not captured",
            },
            {
              key: "agentVersion",
              header: "Agent Version",
              searchAccessor: (row) => stringValue(row.agentVersion),
              render: (row) => stringValue(row.agentVersion) || "Not set",
            },
          ]}
          emptyState={
            <p className="p-4 text-sm text-muted">
              No Agent Desktop activity events were found for this window.
            </p>
          }
          enableSearch
          getRowKey={(row) => stringValue(row.id)}
          initialSort={{ columnKey: "occurredAt", direction: "desc" }}
          pagination={{
            page: 1,
            pageSize: 10,
            totalItems: recentEvents.length,
            pageSizeOptions: [10, 25],
          }}
          rows={recentEvents}
          searchPlaceholder="Search activity events"
        />
      </div>
    </section>
  );
}

function AgentMetric({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/5 p-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 break-words text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function AgentLocationPanel({
  location,
  tenant,
}: {
  readonly location: Record<string, unknown> | null;
  readonly tenant?: ModuleRuntimeContext["tenant"];
}) {
  // Must stay in sync with MAX_LOCATION_ACCURACY_METERS in
  // services/api/src/modules/agent/agent.service.ts.
  const maxAcceptedAccuracyMeters = 2000;
  const status = stringValue(location?.status);
  const latitude = numberOrNull(location?.latitude);
  const longitude = numberOrNull(location?.longitude);
  const accuracyMeters = numberOrNull(location?.accuracyMeters);
  const isPrecise =
    accuracyMeters !== null && accuracyMeters <= maxAcceptedAccuracyMeters;
  const hasCoordinates =
    status.toUpperCase() === "CAPTURED" &&
    isPrecise &&
    latitude !== null &&
    longitude !== null;
  const mapsHref = hasCoordinates
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : null;

  return (
    <AgentDetailPanel title="Latest location request">
      <AgentDetailItem label="Status" value={formatStatus(status)} />
      <AgentDetailItem
        label="Requested"
        value={
          formatDateTime(stringValue(location?.requestedAt), tenant) ||
          "Not requested"
        }
      />
      <AgentDetailItem
        label="Captured"
        value={
          formatDateTime(stringValue(location?.capturedAt), tenant) ||
          "Not captured"
        }
      />
      <AgentDetailItem
        label="Accuracy"
        value={
          accuracyMeters === null
            ? "Not captured"
            : `${Math.round(accuracyMeters).toLocaleString()} m${
                isPrecise ? "" : " (not accepted)"
              }`
        }
      />
      <AgentDetailItem
        label="Coordinates"
        value={
          hasCoordinates
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : "Not captured"
        }
      />
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">
          Map
        </dt>
        <dd className="mt-1 text-sm font-medium">
          {mapsHref ? (
            <Link
              className="text-accent hover:underline"
              href={mapsHref}
              target="_blank"
            >
              Open map
            </Link>
          ) : (
            <span className="text-muted">Not available</span>
          )}
        </dd>
      </div>
      {formatAgentLocationResponse(location?.errorMessage) ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Response
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground">
            {formatAgentLocationResponse(location?.errorMessage)}
          </dd>
        </div>
      ) : null}
      {status.toUpperCase() === "CAPTURED" && !isPrecise ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Precision
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-warning">
            This capture is approximate. Request a new location and wait for
            accuracy under {maxAcceptedAccuracyMeters} m.
          </dd>
        </div>
      ) : null}
    </AgentDetailPanel>
  );
}

function formatAgentLocationResponse(value: unknown) {
  const message = stringValue(value);

  if (!message) return "";

  if (/GeoCoordinateWatcher|System\.Device|TryStart|powershell/i.test(message)) {
    return "Windows Location Services could not provide a position. Check that Windows Location is enabled for desktop apps.";
  }

  if (/Failed to query location from network service/i.test(message)) {
    return "Device location failed. The desktop agent tried the fallback location services but could not get coordinates.";
  }

  if (/IP location lookup also failed/i.test(message)) {
    return "The desktop agent could not reach Windows Location Services or any fallback provider. Check the device's location settings and network connection.";
  }

  if (message.length <= 180) return message;

  return `${message.slice(0, 177)}...`;
}

function AgentDetailPanel({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/5 p-4">
      <h5 className="text-sm font-semibold text-foreground">{title}</h5>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function AgentDetailItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function AgentStatusBadge({ value }: { readonly value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized === "LIVE" || normalized === "ACTIVE"
      ? "border-success/30 bg-success/10 text-success"
      : normalized === "STALE" || normalized === "IDLE" || normalized === "AWAY"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-muted/10 text-muted";

  return (
    <span
      className={`inline-flex h-9 min-w-24 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold ${tone}`}
    >
      {formatStatus(value)}
    </span>
  );
}

function AgentPermissionBadge({ value }: { readonly value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized === "GRANTED"
      ? "border-success/30 bg-success/10 text-success"
      : normalized === "DENIED" || normalized === "RESTRICTED"
        ? "border-danger/30 bg-danger/10 text-danger"
        : normalized === "PROMPT" || normalized === "UNKNOWN"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-muted/10 text-muted";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {formatStatus(normalized || "UNKNOWN")}
    </span>
  );
}

function formatStatus(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Not set";
  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function durationLabel(value: unknown) {
  const seconds = Math.max(0, numberValue(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type WidgetRenderer = (props: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) => ReactNode;

const BUILTIN_WIDGET_RENDERERS: Readonly<Record<string, WidgetRenderer>> = {
  "employee.profilePhoto": (props) => <EmployeeProfilePhotoWidget {...props} />,
  "system.timeline": (props) => <ModuleTimelineWidget {...props} />,
  "system.documents": (props) => <ModuleDocumentsWidget {...props} />,
  "system.reportingHierarchy": (props) => (
    <ModuleReportingHierarchyWidget {...props} />
  ),
  "system.approvalTracker": (props) => (
    <ModuleApprovalTrackerWidget {...props} />
  ),
};

function ModuleDocumentsWidget({
  component,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const recordId = runtime?.recordId;
  const entityType = documentEntityTypeForRuntime(runtime);
  const [documents, setDocuments] = useState<GenericDocumentRecord[]>([]);
  const [documentTypes, setDocumentTypes] = useState<SharedLookupOption[]>([]);
  const [documentCategories, setDocumentCategories] = useState<
    SharedLookupOption[]
  >([]);
  const [loading, setLoading] = useState(Boolean(recordId && entityType));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId || !entityType) return;
    let active = true;
    Promise.all([
      fetch(
        `/api/documents/entity/${entityType}/${encodeURIComponent(recordId)}`,
      )
        .then(readJsonResponse)
        .then(readDocumentList),
      fetch("/api/lookups/document-types")
        .then(readJsonResponse)
        .then(readLookupOptions),
      fetch("/api/lookups/document-categories")
        .then(readJsonResponse)
        .then(readLookupOptions),
    ])
      .then(([nextDocuments, nextTypes, nextCategories]) => {
        if (!active) return;
        setDocuments(nextDocuments);
        setDocumentTypes(nextTypes);
        setDocumentCategories(nextCategories);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load documents.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entityType, recordId]);

  if (!recordId || !entityType) {
    return (
      <WidgetState
        title={component.label ?? definition.displayName}
        description={definition.unsavedRecordMessage}
      />
    );
  }

  if (loading) {
    return (
      <WidgetState
        title={component.label ?? definition.displayName}
        description="Loading documents..."
      />
    );
  }

  if (error) {
    return (
      <WidgetState
        title={component.label ?? definition.displayName}
        description={error}
        tone="warning"
      />
    );
  }

  return (
    <div className="space-y-4">
      <DocumentUploadForm
        documentCategories={documentCategories}
        documentTypes={documentTypes}
        entityId={recordId}
        entityType={entityType}
        submitLabel="Upload project document"
      />
      <DocumentList
        documents={documents}
        emptyMessage={definition.emptyState}
      />
    </div>
  );
}

function EmployeeProfilePhotoWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(isRecord(result) ? result : null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Profile Photo.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  if (loading) {
    return (
      <WidgetState
        title="Profile Photo"
        description="Loading Profile Photo..."
      />
    );
  }
  if (error || !data || !recordId) {
    return (
      <WidgetState
        title="Profile Photo"
        description={error ?? definition.emptyState}
        tone={error ? "warning" : "neutral"}
      />
    );
  }

  const displayName =
    stringValue(data.fullName) ||
    [stringValue(data.firstName), stringValue(data.lastName)]
      .filter(Boolean)
      .join(" ") ||
    "Employee";
  const profileImage = isRecord(data.profileImage)
    ? ({
        id: stringValue(data.profileImage.id),
        fileName: stringValue(data.profileImage.fileName),
        mimeType: stringValue(data.profileImage.mimeType),
        size: numberValue(data.profileImage.size),
        createdAt: stringValue(data.profileImage.createdAt) || undefined,
      } as RuntimeProfileImageSummary)
    : null;
  const permissionKeys = new Set(
    runtime?.security.principal.permissionKeys ?? [],
  );
  const isOwnProfile =
    stringValue(data.userId) === runtime?.security.principal.userId ||
    stringValue(data.ownerUserId) === runtime?.security.principal.userId;
  const canUpload =
    isOwnProfile ||
    permissionKeys.has("employees.update.self") ||
    permissionKeys.has("employees.documents.upload");
  const canRemove = permissionKeys.has("employees.documents.delete");

  return (
    <RuntimeProfileImageCard
      canRemove={canRemove}
      canUpload={canUpload}
      displayName={displayName}
      profileImage={profileImage}
      recordId={recordId}
      resourcePath="employees"
    />
  );
}

function ModuleReportingHierarchyWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Reporting Hierarchy.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  const hierarchy = readReportingHierarchy(data);
  if (loading) {
    return (
      <WidgetState
        description="Loading Reporting Hierarchy..."
        title={component.label ?? definition.displayName}
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        description={error}
        title={component.label ?? definition.displayName}
        tone="warning"
      />
    );
  }
  if (!hierarchy) {
    return (
      <WidgetState
        description={definition.emptyState}
        title={component.label ?? definition.displayName}
      />
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h4 className="font-semibold text-foreground">
        {component.label ?? definition.displayName}
      </h4>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <HierarchyGroup
          emptyText="No manager is recorded."
          label="Reporting line"
          nodes={hierarchy.reportingLine}
        />
        <HierarchyGroup
          emptyText="Current Employee is unavailable."
          label="Current Employee"
          nodes={hierarchy.currentEmployee ? [hierarchy.currentEmployee] : []}
        />
        <HierarchyGroup
          emptyText="No direct reports."
          label="Direct reports"
          nodes={hierarchy.directReports}
        />
      </div>
    </section>
  );
}

function HierarchyGroup({
  emptyText,
  label,
  nodes,
}: {
  readonly emptyText: string;
  readonly label: string;
  readonly nodes: readonly ReportingHierarchyNode[];
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-2 grid gap-2">
        {nodes.length ? (
          nodes.map((node) => (
            <div key={node.id}>
              <p className="text-sm font-medium text-foreground">{node.name}</p>
              {node.subtitle ? (
                <p className="text-xs text-muted">{node.subtitle}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

type OrganizationHierarchyTree = {
  readonly organizations?: readonly OrganizationHierarchyNode[];
  readonly businessUnitsByOrganization?: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
  readonly departmentsByBusinessUnit?: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
  readonly teamsByDepartment?: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
};

type OrganizationHierarchyNode = {
  readonly id: string;
  readonly name: string;
  readonly children?: readonly OrganizationHierarchyNode[];
};

function OrganizationHierarchyWidget({
  component,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<OrganizationHierarchyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId ?? "";

  useEffect(() => {
    let active = true;
    fetch("/api/organization-hierarchy/tree", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load hierarchy (${response.status}).`);
        }
        return (await response.json()) as OrganizationHierarchyTree;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load organization hierarchy.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <WidgetState
        description="Loading organization hierarchy..."
        title={component.label ?? "Organization Hierarchy"}
      />
    );
  }

  if (error) {
    return (
      <WidgetState
        description={error}
        title={component.label ?? "Organization Hierarchy"}
        tone="warning"
      />
    );
  }

  const organizations = data?.organizations ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h4 className="font-semibold text-foreground">
        {component.label ?? "Organization Hierarchy"}
      </h4>
      <div className="mt-4 grid gap-3">
        {organizations.length ? (
          organizations.map((organization) => (
            <OrganizationHierarchyNodeView
              businessUnitsByOrganization={
                data?.businessUnitsByOrganization ?? {}
              }
              departmentsByBusinessUnit={data?.departmentsByBusinessUnit ?? {}}
              teamsByDepartment={data?.teamsByDepartment ?? {}}
              currentOrganizationId={recordId}
              key={organization.id}
              node={organization}
            />
          ))
        ) : (
          <p className="text-sm text-muted">
            No organization hierarchy is configured.
          </p>
        )}
      </div>
    </section>
  );
}

function OrganizationHierarchyNodeView({
  businessUnitsByOrganization,
  departmentsByBusinessUnit,
  currentOrganizationId,
  depth = 0,
  node,
  teamsByDepartment,
}: {
  readonly businessUnitsByOrganization: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
  readonly departmentsByBusinessUnit: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
  readonly currentOrganizationId: string;
  readonly depth?: number;
  readonly node: OrganizationHierarchyNode;
  readonly teamsByDepartment: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
}) {
  const businessUnits = businessUnitsByOrganization[node.id] ?? [];
  const active = node.id === currentOrganizationId;

  return (
    <div className="grid gap-2" style={{ marginLeft: depth ? 18 : 0 }}>
      <div
        className={[
          "rounded-lg border px-3 py-2",
          active ? "border-accent bg-accent/5" : "border-border bg-white",
        ].join(" ")}
      >
        <Link
          className="text-sm font-semibold text-foreground hover:text-accent"
          href={`/settings/general-setup/organization/organizations/${node.id}`}
        >
          {node.name}
        </Link>
      </div>

      {businessUnits.map((unit) => (
        <OrganizationBusinessUnitNodeView
          departmentsByBusinessUnit={departmentsByBusinessUnit}
          key={unit.id}
          node={unit}
          depth={depth + 1}
          teamsByDepartment={teamsByDepartment}
        />
      ))}

      {(node.children ?? []).map((child) => (
        <OrganizationHierarchyNodeView
          businessUnitsByOrganization={businessUnitsByOrganization}
          departmentsByBusinessUnit={departmentsByBusinessUnit}
          currentOrganizationId={currentOrganizationId}
          depth={depth + 1}
          key={child.id}
          node={child}
          teamsByDepartment={teamsByDepartment}
        />
      ))}
    </div>
  );
}

function OrganizationBusinessUnitNodeView({
  departmentsByBusinessUnit,
  depth,
  node,
  teamsByDepartment,
}: {
  readonly departmentsByBusinessUnit: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
  readonly depth: number;
  readonly node: OrganizationHierarchyNode;
  readonly teamsByDepartment: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
}) {
  const departments = departmentsByBusinessUnit[node.id] ?? [];

  return (
    <div className="grid gap-2" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
        <Link
          className="text-sm font-medium text-foreground hover:text-accent"
          href={`/settings/general-setup/organization/business-units/${node.id}`}
        >
          {node.name}
        </Link>
      </div>

      {(node.children ?? []).map((child) => (
        <OrganizationBusinessUnitNodeView
          departmentsByBusinessUnit={departmentsByBusinessUnit}
          depth={depth + 1}
          key={child.id}
          node={child}
          teamsByDepartment={teamsByDepartment}
        />
      ))}

      {departments.map((department) => (
        <OrganizationDepartmentNodeView
          key={department.id}
          node={department}
          depth={depth + 1}
          teamsByDepartment={teamsByDepartment}
        />
      ))}
    </div>
  );
}

function OrganizationDepartmentNodeView({
  depth,
  node,
  teamsByDepartment,
}: {
  readonly depth: number;
  readonly node: OrganizationHierarchyNode;
  readonly teamsByDepartment: Record<
    string,
    readonly OrganizationHierarchyNode[]
  >;
}) {
  const teams = teamsByDepartment[node.id] ?? [];

  return (
    <div className="grid gap-2" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="rounded-lg border border-border bg-white px-3 py-2">
        <Link
          className="text-sm font-medium text-foreground hover:text-accent"
          href={`/settings/general-setup/organization/departments/${node.id}`}
        >
          {node.name}
        </Link>
      </div>

      {teams.map((team) => (
        <div
          className="rounded-lg border border-border bg-slate-50 px-3 py-2"
          key={team.id}
          style={{ marginLeft: 18 }}
        >
          <Link
            className="text-sm font-medium text-foreground hover:text-accent"
            href={`/settings/access/teams/${team.id}`}
          >
            {team.name}
          </Link>
        </div>
      ))}
    </div>
  );
}

function ModuleApprovalTrackerWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Approval tracker data is not available for this record.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  const approval = readApprovalTrackerItem(data);
  if (loading) {
    return (
      <WidgetState
        description="Loading approval tracker..."
        title={component.label ?? "Approval Tracker"}
      />
    );
  }
  if (error || !approval) {
    return (
      <WidgetState
        description={error ?? definition.emptyState}
        title={component.label ?? "Approval Tracker"}
        tone="warning"
      />
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-foreground">
          {component.label ?? "Approval Tracker"}
        </h4>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
          {approval.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {approval.steps.map((step) => (
          <article
            className="rounded-lg border border-border p-3"
            key={step.id}
          >
            <p className="text-sm font-medium text-foreground">
              {step.name} - {step.status}
            </p>
            <p className="mt-1 text-xs text-muted">
              {step.actors || "Approver is not assigned."}
            </p>
            {step.actionAt ? (
              <p className="mt-1 text-xs text-muted">{step.actionAt}</p>
            ) : null}
            {step.comment ? (
              <p className="mt-2 text-sm text-foreground">{step.comment}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function readApprovalTrackerItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items) || !items.length) return null;
  const item = items[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const steps = Array.isArray(record.steps) ? record.steps : [];

  return {
    status: stringValue(record.status) || "Pending",
    steps: steps
      .filter((step): step is Record<string, unknown> =>
        Boolean(step && typeof step === "object" && !Array.isArray(step)),
      )
      .map((step, index) => {
        const assignments = Array.isArray(step.assignments)
          ? step.assignments
          : [];
        const actions = Array.isArray(step.actions) ? step.actions : [];
        const latestAction = actions.at(-1);
        const action =
          latestAction &&
          typeof latestAction === "object" &&
          !Array.isArray(latestAction)
            ? (latestAction as Record<string, unknown>)
            : null;
        return {
          id: stringValue(step.id) || `approval-step-${index}`,
          name: stringValue(step.name) || `Approval step ${index + 1}`,
          status: stringValue(step.status) || "Pending",
          actors: assignments.map(readApprovalActor).filter(Boolean).join(", "),
          actionAt:
            stringValue(action?.actionAtUtc) || stringValue(action?.createdAt),
          comment:
            stringValue(action?.comment) ||
            stringValue(action?.reason) ||
            stringValue(step.comment),
        };
      }),
  };
}

function readApprovalActor(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const assignment = value as Record<string, unknown>;
  const user = assignment.assignedToUser;
  const role = assignment.assignedToRole;
  if (user && typeof user === "object" && !Array.isArray(user)) {
    const record = user as Record<string, unknown>;
    return (
      [stringValue(record.firstName), stringValue(record.lastName)]
        .filter(Boolean)
        .join(" ") || stringValue(record.email)
    );
  }
  if (role && typeof role === "object" && !Array.isArray(role)) {
    return stringValue((role as Record<string, unknown>).name);
  }
  return "";
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Request failed with ${response.status}.`,
    );
  }
  return data;
}

function readDocumentList(value: unknown): GenericDocumentRecord[] {
  if (Array.isArray(value))
    return value.filter(isRecord) as GenericDocumentRecord[];
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items.filter(isRecord) as GenericDocumentRecord[];
  }
  return [];
}

function readLookupOptions(value: unknown): SharedLookupOption[] {
  const records = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : [];
  return records.filter(isRecord).flatMap((record) => {
    const id = stringValue(record.id);
    const name =
      stringValue(record.name) ||
      stringValue(record.label) ||
      stringValue(record.key) ||
      stringValue(record.code);
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        key: stringValue(record.key) || null,
        code: stringValue(record.code) || null,
      },
    ];
  });
}

/**
 * DocumentEntityType values accepted by the documents API. The API validates
 * this with a ParseEnumPipe, so anything not in this set is rejected outright.
 */
const DOCUMENT_ENTITY_TYPES = new Set([
  "EMPLOYEE",
  "PROJECT",
  "LEAVE_REQUEST",
  "ATTENDANCE",
  "PAYROLL_RECORD",
  "PAYSLIP",
  "PAYROLL_BANK_EXPORT",
  "CANDIDATE",
  "ONBOARDING_RECORD",
  "TENANT",
  "INVOICE",
  "POLICY",
  "OTHER",
]);

/**
 * Maps a module onto the entity type its documents are linked by.
 *
 * Modules whose entity name does not match the enum need an explicit case:
 * leaves resolve to leaveRequest and attendance to attendanceEntry, which would
 * otherwise be upper-cased into LEAVEREQUEST and ATTENDANCEENTRY and rejected.
 * The fallback is validated for the same reason rather than trusted blindly.
 */
function documentEntityTypeForRuntime(runtime?: ModuleRuntimeContext) {
  switch (runtime?.module.key) {
    case "projects":
      return "PROJECT";
    case "employees":
      return "EMPLOYEE";
    case "leaves":
      return "LEAVE_REQUEST";
    case "attendance":
      return "ATTENDANCE";
    case "recruitmentCandidates":
    case "recruitmentTalentPool":
      return "CANDIDATE";
    case "onboarding":
      return "ONBOARDING_RECORD";
    default: {
      const derived = runtime?.metadata.entity.logicalName.toUpperCase();
      return derived && DOCUMENT_ENTITY_TYPES.has(derived) ? derived : undefined;
    }
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatOptionalDateTime(value: unknown) {
  const raw = stringValue(value);
  return raw ? formatDateTime(raw) : "";
}

type ReportingHierarchyNode = {
  readonly id: string;
  readonly name: string;
  readonly subtitle?: string;
};

function readReportingHierarchy(value: unknown) {
  if (!isRecord(value)) return null;
  const currentEmployee = readHierarchyNode(value.currentEmployee);
  const reportingLine = readHierarchyNodes(value.reportingLine);
  const directReports = readHierarchyNodes(value.directReports);
  if (!currentEmployee && !reportingLine.length && !directReports.length) {
    return null;
  }
  return { currentEmployee, reportingLine, directReports };
}

function readHierarchyNodes(value: unknown) {
  return Array.isArray(value)
    ? value.map(readHierarchyNode).filter(isHierarchyNode)
    : [];
}

function readHierarchyNode(value: unknown): ReportingHierarchyNode | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id) || stringValue(value.userId);
  const name =
    stringValue(value.displayName) ||
    stringValue(value.name) ||
    stringValue(value.label);
  if (!id || !name) return null;
  const subtitle =
    stringValue(value.subtitle) || stringValue(value.secondaryLabel);
  return { id, name, subtitle: subtitle || undefined };
}

function isHierarchyNode(
  value: ReportingHierarchyNode | null,
): value is ReportingHierarchyNode {
  return Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function systemWidgetMetadata(
  component: FormComponentMetadata,
  definition: SystemWidgetDefinition,
): WidgetMetadata {
  return {
    id: component.widgetId ?? component.id,
    logicalName: definition.widgetKey,
    displayName: component.label ?? definition.displayName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    widgetType: component.widgetType ?? definition.aliases[0] ?? "system",
    isSystem: true,
    isCustom: false,
    allowedModuleKeys: definition.supportedModules,
  };
}

function resolveAdapterMethods(dataAdapter?: ModuleDataAdapter) {
  if (!dataAdapter) return [];
  return ["getTimelineEntries", "getWidgetData"].filter(
    (method) =>
      typeof dataAdapter[method as "getTimelineEntries" | "getWidgetData"] ===
      "function",
  );
}

function ModuleTimelineWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [entries, setEntries] = useState<readonly TimelineEntryMetadata[]>([]);
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getTimelineEntries),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getTimelineEntries) return;
    let active = true;
    dataAdapter
      .getTimelineEntries({
        runtime,
        recordId,
        search,
        sortDirection,
      })
      .then((result) => {
        if (active) {
          setError(null);
          setEntries(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Timeline.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataAdapter, recordId, runtime, search, sortDirection]);

  const visibleEntries = useMemo(
    () =>
      [...entries].sort((left, right) =>
        sortDirection === "desc"
          ? right.occurredAt.localeCompare(left.occurredAt)
          : left.occurredAt.localeCompare(right.occurredAt),
      ),
    [entries, sortDirection],
  );

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <h4 className="font-semibold text-foreground">
          {component.label ?? "Timeline"}
        </h4>
        <div className="flex w-full items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Timeline"
              value={search}
            />
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              leftIcon={
                sortDirection === "desc" ? (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                ) : (
                  <ArrowUpNarrowWide className="h-4 w-4" />
                )
              }
              onClick={() =>
                setSortDirection((current) =>
                  current === "desc" ? "asc" : "desc",
                )
              }
              size="icon-sm"
              title={sortDirection === "desc" ? "Latest first" : "Oldest first"}
              aria-label={
                sortDirection === "desc" ? "Latest first" : "Oldest first"
              }
              variant="secondary"
            />

            <Button
              disabled
              leftIcon={<Plus className="h-4 w-4" />}
              size="icon-sm"
              title="Quick Create"
              aria-label="Quick Create"
              variant="secondary"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {loading ? (
          <p className="text-sm text-muted">Loading Timeline...</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !dataAdapter?.getTimelineEntries ? (
          <p className="text-sm text-muted">
            {definition.missingAdapterDiagnostic}
          </p>
        ) : visibleEntries.length === 0 ? (
          <p className="text-sm text-muted">{definition.emptyState}</p>
        ) : (
          visibleEntries.map((entry) => (
            <article
              className="rounded-lg border border-border bg-muted/5 p-3"
              key={entry.id}
            >
              <p className="text-sm text-foreground">
                <TimelineTemplate entry={entry} runtime={runtime} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {entry.actorDisplayName ? `${entry.actorDisplayName} - ` : ""}
                {formatDateTime(entry.occurredAt, runtime?.tenant)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TimelineTemplate({
  entry,
  runtime,
}: {
  entry: TimelineEntryMetadata;
  runtime?: ModuleRuntimeContext;
}) {
  const placeholders = new Map(
    (entry.placeholders ?? []).map((placeholder) => [
      placeholder.key,
      placeholder,
    ]),
  );
  const parts = entry.template.split(/(\{\{[^}]+\}\})/g);

  return parts.map((part, index) => {
    const match = /^\{\{([^}]+)\}\}$/.exec(part);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;
    const placeholder = placeholders.get(match[1] ?? "");
    if (!placeholder) return <span key={`${part}-${index}`}>{part}</span>;
    const canOpen =
      placeholder.href &&
      (!placeholder.permission ||
        runtime?.security.principal.permissionKeys.includes(
          placeholder.permission.permissionKey,
        ));
    return canOpen ? (
      <a
        className="font-medium text-accent hover:underline"
        href={placeholder.href}
        key={`${placeholder.key}-${index}`}
        rel="noreferrer"
        target="_blank"
      >
        {placeholder.value}
      </a>
    ) : (
      <span className="font-medium" key={`${placeholder.key}-${index}`}>
        {placeholder.value}
      </span>
    );
  });
}

function WidgetState({
  description,
  title,
  tone = "neutral",
}: {
  description: string;
  title: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-lg border border-dashed p-4 ${
        tone === "warning" ? "border-warning/40 bg-warning/5" : "border-border"
      }`}
    >
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}
