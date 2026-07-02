import {
  StandardModuleListPage,
  StandardModuleRecordPage,
} from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { apiRequestJson } from "@/lib/server-api";
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
import { TenantSlugForm } from "../tenant/_components/tenant-slug-form";
import { ROLE_KEYS } from "@/lib/security-keys";

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
    const record = readRecordSettings(response);
    const spec = { ...adapter.spec, routeBase: item.route };
    const runtime = buildStandardRouteRuntime({
      pageKind: "edit",
      recordId: adapter.recordCategory,
      sessionUser,
      spec,
    });
    const activeForm = resolveStandardActiveForm(
      runtime.metadata.forms,
      first(params.formId),
      "main",
    );
    return (
      <SettingsShell title={item.label} description={item.description}>
        {item.key === "tenant" ? (
          <TenantSlugForm
            canEdit={
              sessionUser?.roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER) ??
              false
            }
            initialSlug={tenantSlugResponse?.slug ?? ""}
          />
        ) : null}
        <TenantSettingsRuntimeRecord
          activeForm={activeForm}
          category={adapter.recordCategory ?? item.key}
          record={record}
          runtime={runtime}
          spec={spec}
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
          page: 1,
          pageSize: Math.max(records.length, 10),
          totalItems: records.length,
          pathname: item.route,
          searchParams: { viewId: activeView?.viewId ?? activeView?.id },
        }}
        records={records}
        runtime={runtime}
        spec={spec}
        title={item.label}
      />
    </SettingsShell>
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
  const [sessionUser, params, response] = await Promise.all([
    getSessionUser(),
    searchParams,
    recordId
      ? apiRequestJson<unknown>(
          `${adapter.serverApiPath}/${encodeURIComponent(recordId)}`,
        )
      : Promise.resolve(adapter.initialValues),
  ]);
  const record = readSettingsRecord(response, adapter);
  const spec = { ...adapter.spec, routeBase: item.route };
  const runtime = buildStandardRouteRuntime({
    pageKind: mode === "read" ? "detail" : mode,
    recordId,
    sessionUser,
    spec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    first(params.formId),
    mode === "create" ? "quickCreate" : "main",
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

  return (
    <SettingsShell title={title} description={item.description}>
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode={mode}
        record={record}
        recordId={recordId}
        runtime={runtime}
        spec={spec}
        title={title}
      />
    </SettingsShell>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
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

function shouldDefaultToActiveRecords(adapter: SettingsRuntimeAdapter) {
  return (
    adapter.softDelete &&
    adapter.spec.fields.some((field) => field.logicalName === "isActive")
  );
}

function readRecordSettings(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return record.settings &&
    typeof record.settings === "object" &&
    !Array.isArray(record.settings)
    ? (record.settings as Record<string, unknown>)
    : record;
}
