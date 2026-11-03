import { redirect } from "next/navigation";
import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  loadCustomModuleDefinition,
  loadCustomModuleRecords,
} from "@/lib/runtime/custom-modules/custom-module-api";
import {
  buildCustomModuleRuntime,
  serverViewKey,
} from "@/lib/runtime/custom-modules/custom-module-runtime";
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

  /*
   * Definition first: the active view decides WHICH records to ask for, so the
   * two loads can no longer run in parallel. The view is applied by the API (its
   * filters, ordering and the page total), not by this page and not in the browser.
   */
  const definitionLoad = await loadCustomModuleDefinition(moduleKey);
  if (definitionLoad.status !== "ok") {
    return <CustomModuleUnavailable status={definitionLoad.status} />;
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

  const recordsLoad = await loadCustomModuleRecords(moduleKey, {
    page,
    pageSize,
    view: serverViewKey(definition, activeView),
  });
  if (recordsLoad.status !== "ok") {
    // A view that has since been deleted or hidden: go to the module's default list rather than a dead end.
    if (recordsLoad.status === "not-found" && requestedViewId) {
      redirect(spec.routeBase);
    }
    return <CustomModuleUnavailable status={recordsLoad.status} />;
  }
  const records = recordsLoad.data.items ?? [];

  // A deep link or a stale page number past the end of THIS view's results: go to its last page.
  const totalPages = recordsLoad.data.meta?.total
    ? Math.ceil(recordsLoad.data.meta.total / pageSize)
    : 1;
  if (page > totalPages) {
    const params = new URLSearchParams();
    const viewId = activeView?.viewId ?? activeView?.id;
    if (viewId) params.set("viewId", viewId);
    if (totalPages > 1) params.set("page", String(totalPages));
    if (pageSize !== DEFAULT_PAGE_SIZE)
      params.set("pageSize", String(pageSize));
    const qs = params.toString();
    redirect(qs ? `${spec.routeBase}?${qs}` : spec.routeBase);
  }

  return (
    <div className="dp-theme-scope grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        viewFiltering="server"
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
