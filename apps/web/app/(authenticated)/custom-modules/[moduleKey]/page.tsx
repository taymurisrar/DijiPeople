import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  loadCustomModuleDefinition,
  loadCustomModuleRecords,
} from "@/lib/runtime/custom-modules/custom-module-api";
import { buildCustomModuleRuntime } from "@/lib/runtime/custom-modules/custom-module-runtime";
import { CustomModuleUnavailable } from "../_components/custom-module-unavailable";

/*
 * The list screen of a published custom module (BUG-3494 / ADR-0016).
 *
 * One route serves every custom module: `moduleKey` is the table's
 * `tableKey`, unique per tenant and immutable once created, so the URL stays
 * stable for the life of the module. The list is built from its published
 * views; records come from `/data/<moduleKey>` with the API's row scope.
 */

type PageProps = {
  params: Promise<{ moduleKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export default async function CustomModuleListPage({
  params,
  searchParams,
}: PageProps) {
  const [{ moduleKey }, query, sessionUser] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
  ]);
  const page = positiveInt(first(query.page), 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    positiveInt(first(query.pageSize), DEFAULT_PAGE_SIZE),
  );

  const [definitionLoad, recordsLoad] = await Promise.all([
    loadCustomModuleDefinition(moduleKey),
    loadCustomModuleRecords(moduleKey, { page, pageSize }),
  ]);
  if (definitionLoad.status !== "ok") {
    return <CustomModuleUnavailable status={definitionLoad.status} />;
  }
  if (recordsLoad.status !== "ok") {
    return <CustomModuleUnavailable status={recordsLoad.status} />;
  }

  const definition = definitionLoad.data;
  const { spec, runtime } = buildCustomModuleRuntime({
    definition,
    pageKind: "list",
    sessionUser,
  });
  const requestedViewId = first(query.viewId);
  const activeView =
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === requestedViewId,
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null;
  const records = recordsLoad.data.items ?? [];

  return (
    <div className="dp-theme-scope grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        pagination={{
          page: recordsLoad.data.meta?.page ?? page,
          pageSize: recordsLoad.data.meta?.pageSize ?? pageSize,
          totalItems: recordsLoad.data.meta?.total ?? records.length,
          pathname: spec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        spec={spec}
        title={spec.label}
      />
    </div>
  );
}

function first(value?: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
