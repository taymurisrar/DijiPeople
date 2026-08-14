import {
  StandardModuleListPage,
  StandardModuleRecordPage,
} from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { apiRequestJson, isApiRequestError } from "@/lib/server-api";
import { notFound, redirect } from "next/navigation";
import {
  getSettingsAdapter,
  readSettingsRecord,
  readSettingsRecords,
  type SettingsRuntimeAdapter,
} from "../_lib/settings-adapter-registry";
import type { SettingsRuntimeItem } from "../_lib/settings-runtime";
import { SettingsShell } from "./settings-shell";
import { EmptyState } from "@/app/components/ui/empty-state";
import { TenantSettingsRuntimeRecord } from "./tenant-settings-runtime-record";
import { ROLE_KEYS } from "@/lib/security-keys";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { TenantResolvedSettingsResponse } from "../types";
import {
  CompensationPackageAssignment,
  PostingRuleResolutionPreview,
  TaxCalculationPreview,
  TaxSlabManager,
} from "./payroll-configuration-tools";
import { TimesheetPolicyManager } from "./timesheet-policy-manager";
import { WorkSiteRecordPage } from "./work-site/work-site-record-page";
import type { WorkSiteReadinessPayload } from "../_lib/work-site-configuration";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function SettingsRuntimeList({
  item,
  searchParams,
}: {
  item: SettingsRuntimeItem;
  searchParams: SearchParams;
}) {
  const adapter = getSettingsAdapter(item.key);
  if (!adapter) notFound();
  if (adapter.mode === "specialized") {
    if (adapter.specializedHref) redirect(adapter.specializedHref);
    return (
      <SettingsShell title={item.label} description={item.description}>
        <EmptyState
          title={`${item.label} remains specialized`}
          description={
            adapter.blocker ??
            "This setting is not representable as generic record CRUD."
          }
        />
      </SettingsShell>
    );
  }
  if (adapter.mode === "record") {
    const [response, sessionUser, params, tenantSlugResponse] =
      await Promise.all([
        apiRequestJson<unknown>(adapter.serverApiPath),
        getSessionUser(),
        searchParams,
        item.key === "tenant"
          ? apiRequestJson<{ slug?: string | null }>("/tenants/current/slug")
          : Promise.resolve(null),
      ]);
    const record = {
      ...readRecordSettings(response, adapter),
      ...(item.key === "tenant"
        ? { tenantSlug: tenantSlugResponse?.slug ?? "" }
        : {}),
    };
    const spec = { ...adapter.spec, routeBase: item.route };
    const runtime = buildStandardRouteRuntime({
      pageKind: "edit",
      recordId: adapter.recordCategory,
      sessionUser,
      spec,
    });
    const canEditTenantSlug =
      item.key === "tenant" &&
      Boolean(sessionUser?.roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER));
    const activeForm = lockTenantSlugForNonCustomizers(
      item.key,
      resolveStandardActiveForm(
        runtime.metadata.forms,
        first(params.formId),
        "main",
      ),
      sessionUser?.roleKeys ?? [],
    );
    return (
      <SettingsShell title={item.label} description={item.description}>
        <TenantSettingsRuntimeRecord
          activeForm={activeForm}
          canEditTenantSlug={canEditTenantSlug}
          category={adapter.recordCategory ?? item.key}
          fieldCategories={adapter.settingFieldCategories}
          record={record}
          runtime={runtime}
          spec={spec}
          tabContent={
            item.key === "timesheets"
              ? { scope: <TimesheetScopePanel /> }
              : undefined
          }
          title={item.label}
        />
      </SettingsShell>
    );
  }
  const [response, sessionUser, params] = await Promise.all([
    apiRequestJson<unknown>(settingsListApiPath(adapter)),
    getSessionUser(),
    searchParams,
  ]);
  const records = readSettingsRecords(response, adapter.collectionKey, adapter);
  const spec = { ...adapter.spec, routeBase: item.route };
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser,
    spec,
  });
  const activeView =
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === first(params.viewId),
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null;
  const page = positiveInteger(first(params.page), 1);
  const pageSize = positiveInteger(first(params.pageSize), 10);

  return (
    <SettingsShell title={item.label} description={item.description}>
      <StandardModuleListPage
        activeView={activeView}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page,
          pageSize,
          totalItems: records.length,
          pathname: item.route,
          searchParams: { viewId: activeView?.viewId ?? activeView?.id },
        }}
        paginationMode="client"
        records={records}
        runtime={runtime}
        spec={spec}
        title={item.label}
      />
    </SettingsShell>
  );
}

function TimesheetScopePanel() {
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-border bg-white p-4">
        <h3 className="text-base font-semibold text-foreground">
          How scope resolution works
        </h3>
        <p className="mt-1 text-sm text-muted">
          Tenant settings are the shared baseline, so they are configured once.
          Optional policies override only the selected values for an
          organization, business unit, department, team, or employee.
        </p>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-surface p-3">
            <p className="font-medium text-foreground">Resolution order</p>
            <p className="mt-1 text-muted">
              Employee, Team, Department, Business Unit, Organization, then
              Tenant. The most specific active policy wins.
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="font-medium text-foreground">Multiple scopes</p>
            <p className="mt-1 text-muted">
              Create one policy per target. For several business units, create
              one policy for each unit; unspecified values keep inheriting the
              tenant baseline.
            </p>
          </div>
        </div>
      </section>
      <TimesheetPolicyManager />
    </div>
  );
}

export async function SettingsRuntimeRecord({
  item,
  mode,
  recordId,
  searchParams,
}: {
  item: SettingsRuntimeItem;
  mode: "create" | "read" | "edit";
  recordId?: string;
  searchParams: SearchParams;
}) {
  const adapter = getSettingsAdapter(item.key);
  if (!adapter || adapter.mode === "specialized" || adapter.mode === "record")
    notFound();
  if (adapter.mode === "read-only" && mode !== "read") notFound();
  const [sessionUser, params, response, resolvedSettings] = await Promise.all([
    getSessionUser(),
    searchParams,
    recordId
      ? loadSettingsRecordResponse(adapter, recordId)
      : Promise.resolve(adapter.initialValues),
    mode === "create"
      ? apiRequestJson<TenantResolvedSettingsResponse>(
          "/tenant-settings/resolved",
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (recordId && response === null) notFound();
  const record = withResolvedPayrollDefaults(
    readSettingsRecord(response, adapter),
    adapter,
    resolvedSettings,
  );
  const tabContent = payrollConfigurationTabContent(
    adapter.key,
    recordId,
    record,
  );
  const spec = { ...adapter.spec, routeBase: item.route };
  const runtime = buildStandardRouteRuntime({
    pageKind: mode === "read" ? "detail" : mode,
    recordId,
    sessionUser,
    spec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    mode === "create" ? "" : first(params.formId),
    "main",
  );
  const primaryName = record[spec.primaryNameField];
  const fallbackTitle = spec.singularLabel ?? item.label;
  const title =
    mode === "create"
      ? `New ${fallbackTitle}`
      : mode === "edit"
        ? `Edit ${typeof primaryName === "string" ? primaryName : fallbackTitle}`
        : typeof primaryName === "string"
          ? primaryName
          : fallbackTitle;

  /*
   * Work sites get a purpose-built record page. It renders the same runtime
   * record page and the same API, and only substitutes bodies for the sections
   * a field grid cannot express — the map, the inheritance switches, readiness.
   */
  if (adapter.key === "locations") {
    const readiness = recordId ? await loadWorkSiteReadiness(recordId) : null;
    return (
      <SettingsShell title={title} description={item.description}>
        <WorkSiteRecordPage
          activeForm={activeForm}
          mode={mode}
          readiness={readiness?.payload ?? null}
          readinessError={readiness?.error ?? null}
          record={record}
          recordId={recordId}
          runtime={runtime}
          spec={spec}
          title={title}
        />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title={title} description={item.description}>
      <StandardModuleRecordPage
        activeForm={activeForm}
        lookupDisplayValues={settingsLookupDisplayValues(adapter, record)}
        mode={mode}
        record={record}
        recordId={recordId}
        runtime={runtime}
        spec={spec}
        tabContent={tabContent}
        title={title}
      />
    </SettingsShell>
  );
}

/**
 * Operational context for a work site.
 *
 * Failure is not fatal: the configuration form must stay usable when the
 * readiness read is unavailable, so the error is surfaced in the summary card
 * rather than taking the page down.
 */
async function loadWorkSiteReadiness(recordId: string) {
  try {
    const payload = await apiRequestJson<WorkSiteReadinessPayload>(
      `/integrations/attendance/work-sites/${encodeURIComponent(recordId)}/readiness`,
    );
    return { payload, error: null };
  } catch (error) {
    return {
      payload: null,
      error:
        error instanceof Error
          ? error.message
          : "Operational summary could not be loaded for this work site.",
    };
  }
}

async function loadSettingsRecordResponse(
  adapter: SettingsRuntimeAdapter,
  recordId: string,
) {
  try {
    return await apiRequestJson<unknown>(
      settingsRecordApiPath(adapter, recordId),
    );
  } catch (error) {
    if (
      adapter.mode !== "read-only" ||
      !isApiRequestError(error) ||
      ![404, 405, 500].includes(error.status)
    ) {
      throw error;
    }

    const listResponse = await apiRequestJson<unknown>(
      settingsListFallbackApiPath(adapter),
    );
    const records = readSettingsRecords(
      listResponse,
      adapter.collectionKey,
      adapter,
    );
    const primaryIdField = adapter.spec.primaryIdField ?? "id";
    return (
      records.find((record) => String(record[primaryIdField]) === recordId) ??
      null
    );
  }
}

function settingsListFallbackApiPath(adapter: SettingsRuntimeAdapter) {
  const basePath = settingsListApiPath(adapter);
  const [path, query = ""] = basePath.split("?", 2);
  const params = new URLSearchParams(query);
  if (!params.has("page")) params.set("page", "1");
  if (!params.has("pageSize")) params.set("pageSize", "100");
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function payrollConfigurationTabContent(
  adapterKey: string,
  recordId: string | undefined,
  record: Readonly<Record<string, unknown>>,
) {
  if (adapterKey === "tax-rules") {
    return {
      slabs: <TaxSlabManager recordId={recordId} />,
      calculation: (
        <TaxCalculationPreview
          currencyCode={
            typeof record.currencyCode === "string"
              ? record.currencyCode
              : undefined
          }
          recordId={recordId}
        />
      ),
    };
  }
  if (adapterKey === "posting-rules") {
    return {
      "source-criteria": (
        <PostingRuleResolutionPreview record={record} recordId={recordId} />
      ),
    };
  }
  if (adapterKey === "salary-package-rules") {
    return {
      assignments: (
        <CompensationPackageAssignment
          currencyCode={
            typeof record.currencyCode === "string"
              ? record.currencyCode
              : undefined
          }
          payFrequency={
            typeof record.payFrequency === "string"
              ? record.payFrequency
              : undefined
          }
          recordId={recordId}
        />
      ),
    };
  }
  return undefined;
}

function withResolvedPayrollDefaults(
  record: Readonly<Record<string, unknown>>,
  adapter: SettingsRuntimeAdapter,
  resolvedSettings: TenantResolvedSettingsResponse | null,
) {
  if (!resolvedSettings || !adapter.key) return record;

  const fieldNames = new Set(
    adapter.spec.fields.map((field) => field.logicalName),
  );
  const defaults: Record<string, unknown> = { ...record };
  const setWhenBlank = (fieldName: string, value: unknown) => {
    if (
      fieldNames.has(fieldName) &&
      (defaults[fieldName] === undefined || defaults[fieldName] === "") &&
      value
    ) {
      defaults[fieldName] = value;
    }
  };

  setWhenBlank("currencyCode", resolvedSettings.payroll.defaultCurrency);
  setWhenBlank("currency", resolvedSettings.payroll.defaultCurrency);
  setWhenBlank(
    "payrollRegionId",
    resolvedSettings.payroll.defaultPayrollRegionId,
  );
  setWhenBlank(
    "payrollCalendarId",
    resolvedSettings.payroll.defaultPayrollCalendarId,
  );

  return defaults;
}

function settingsLookupDisplayValues(
  adapter: SettingsRuntimeAdapter,
  record: Readonly<Record<string, unknown>>,
) {
  if (adapter.key !== "field-security") return undefined;
  const entityKey =
    typeof record.entityKey === "string" ? record.entityKey : "";
  if (!entityKey) return undefined;
  return { entityKey: readableSettingLookupLabel(entityKey) };
}

function readableSettingLookupLabel(value: string) {
  if (!value) return "";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function lockTenantSlugForNonCustomizers(
  itemKey: string,
  form: FormMetadata | null,
  roleKeys: readonly string[],
) {
  if (
    itemKey !== "tenant" ||
    !form ||
    roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER)
  ) {
    return form;
  }

  return {
    ...form,
    sections: form.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.fieldLogicalName === "tenantSlug"
          ? { ...field, isReadonly: true }
          : field,
      ),
    })),
  } satisfies FormMetadata;
}

function settingsListApiPath(adapter: SettingsRuntimeAdapter) {
  if (!shouldDefaultToActiveRecords(adapter)) return adapter.serverApiPath;

  const [path, query = ""] = adapter.serverApiPath.split("?", 2);
  const params = new URLSearchParams(query);

  if (!params.has("isActive") && !params.has("includeInactive")) {
    params.set("isActive", "true");
  }

  params.delete("includeInactive");
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function settingsRecordApiPath(
  adapter: SettingsRuntimeAdapter,
  recordId: string,
) {
  const [path] = adapter.serverApiPath.split("?", 2);
  return `${path}/${encodeURIComponent(recordId)}`;
}

function shouldDefaultToActiveRecords(adapter: SettingsRuntimeAdapter) {
  return (
    adapter.softDelete &&
    adapter.spec.fields.some((field) => field.logicalName === "isActive")
  );
}

function readRecordSettings(
  value: unknown,
  adapter?: SettingsRuntimeAdapter,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const settings =
    record.settings &&
    typeof record.settings === "object" &&
    !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : record;

  const flattened = adapter
    ? flattenSettingsRecord(settings, adapter)
    : settings;

  return adapter
    ? normalizeRecordForRuntimeFields(flattened, adapter)
    : flattened;
}

function flattenSettingsRecord(
  settings: Readonly<Record<string, unknown>>,
  adapter: SettingsRuntimeAdapter,
) {
  if (!adapter.settingFieldCategories) return settings;

  const flattened: Record<string, unknown> = {};

  for (const [field, category] of Object.entries(
    adapter.settingFieldCategories,
  )) {
    const categorySettings = settings[category];
    if (
      categorySettings &&
      typeof categorySettings === "object" &&
      !Array.isArray(categorySettings)
    ) {
      flattened[field] = (categorySettings as Record<string, unknown>)[field];
    }
  }

  return flattened;
}

function normalizeRecordForRuntimeFields(
  record: Readonly<Record<string, unknown>>,
  adapter: SettingsRuntimeAdapter,
) {
  const normalized: Record<string, unknown> = { ...record };

  for (const field of adapter.spec.fields) {
    if (field.dataType !== "multi-optionset") continue;

    const value = normalized[field.logicalName];
    if (Array.isArray(value)) {
      normalized[field.logicalName] = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    if (typeof value === "string") {
      normalized[field.logicalName] = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return normalized;
}
