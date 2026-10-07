import { getPlatformModuleDefinition } from "./platform-module-registry";
import type {
  ModuleRuntimeAdapter,
  PlatformModuleKey,
  RuntimeActionResult,
  RuntimeListResponse,
  RuntimeQuery,
  RuntimeRecord,
  RuntimeRecordResponse,
} from "./platform-runtime.types";

export function createHttpModuleRuntimeAdapter<
  T extends RuntimeRecord = RuntimeRecord,
>(moduleKey: PlatformModuleKey): ModuleRuntimeAdapter<T> {
  const definition = getPlatformModuleDefinition(moduleKey);
  const base = `/api/platform-runtime/${moduleKey}`;

  async function json<R>(path: string, init?: RequestInit): Promise<R> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new RuntimeApiError(
        payload?.message ??
          `Unable to complete ${definition.displayName.toLowerCase()} request.`,
        response.status,
        payload?.traceId,
        readFieldErrors(payload),
      );
    return payload as R;
  }

  return {
    async getModuleDefinition() {
      return definition;
    },
    async getViews() {
      return definition.views;
    },
    async getView(viewKey) {
      const view = definition.views.find((item) => item.key === viewKey);
      if (!view) throw new RuntimeApiError("View was not found.", 404);
      return view;
    },
    async getRecords(query) {
      return json<RuntimeListResponse<T>>(`?${queryString(query)}`, {
        signal: query.signal,
      });
    },
    async getRecord(id) {
      return json<RuntimeRecordResponse<T>>(`/${encodeURIComponent(id)}`);
    },
    async createRecord(values) {
      return json<RuntimeRecordResponse<T>>("", {
        method: "POST",
        body: JSON.stringify({ values }),
      });
    },
    async updateRecord(id, values, version) {
      return json<RuntimeRecordResponse<T>>(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ values, version }),
      });
    },
    async deleteRecord(id) {
      return json<RuntimeActionResult>(`/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async bulkDelete(ids) {
      return json<RuntimeActionResult>("/actions/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    async assign(id, ownerId) {
      return json<RuntimeActionResult>(
        `/${encodeURIComponent(id)}/actions/assign`,
        { method: "POST", body: JSON.stringify({ ownerId }) },
      );
    },
    async bulkAssign(ids, ownerId) {
      return json<RuntimeActionResult>("/actions/bulk-assign", {
        method: "POST",
        body: JSON.stringify({ ids, ownerId }),
      });
    },
    async changeStatus(id, status, reason, subStatus) {
      return json<RuntimeActionResult>(
        `/${encodeURIComponent(id)}/actions/change-status`,
        { method: "POST", body: JSON.stringify({ status, reason, subStatus }) },
      );
    },
    /*
     * Module-level actions only — those that act on a selection or on the
     * module as a whole, and so have no record in the URL.
     */
    async executeAction(actionKey, input) {
      return json<RuntimeActionResult>(
        `/actions/${encodeURIComponent(actionKey)}`,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    /*
     * Actions on one record go to the record's own route.
     *
     * Every record command used to be sent through `executeAction` with the id
     * tucked into the body. The API's id-less route never read it, so each
     * partner lifecycle command, lead conversion and agreement amendment
     * answered 400 "Action <key> is not available for <module>" — the dispatch
     * in `PlatformRuntimeService.execute` only matched when it was given the
     * positional id. `record-action-routing.spec.ts` pins every registry record
     * command to this route.
     */
    async executeRecordAction(id, actionKey, input = {}) {
      return json<RuntimeActionResult>(
        `/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionKey)}`,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    async getFormDefinition(mode) {
      const form = definition.forms.find((item) => item.key === mode);
      if (!form)
        throw new RuntimeApiError("Form definition was not found.", 404);
      return form;
    },
    async getRelatedRecords(id, relationshipKey, query) {
      return json<RuntimeListResponse>(
        `/${encodeURIComponent(id)}/related/${encodeURIComponent(relationshipKey)}?${queryString(query ?? {})}`,
      );
    },
    async getTimeline(id, query) {
      return json<RuntimeListResponse>(
        `/${encodeURIComponent(id)}/timeline?${queryString(query ?? {})}`,
      );
    },
    async addTimelineActivity(id, activity) {
      return json<RuntimeActionResult>(`/${encodeURIComponent(id)}/timeline`, {
        method: "POST",
        body: JSON.stringify(activity),
      });
    },
    async getBusinessProcess(id) {
      return json<RuntimeActionResult>(`/${encodeURIComponent(id)}/process`);
    },
    async updateBusinessProcessStage(id, stage, input) {
      return json<RuntimeActionResult>(`/${encodeURIComponent(id)}/process`, {
        method: "PATCH",
        body: JSON.stringify({ stage, ...input }),
      });
    },
    async validateRecord(values, mode, id) {
      return json<RuntimeActionResult>("/validate", {
        method: "POST",
        body: JSON.stringify({ values, mode, id }),
      });
    },
    async exportRecords(query, format = "csv") {
      const response = await fetch(
        `${base}/export?${queryString({ ...query })}&format=${encodeURIComponent(format)}`,
      );
      if (!response.ok)
        throw new RuntimeApiError("Unable to export records.", response.status);
      return response.blob();
    },
  };
}

function queryString(query: RuntimeQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.viewKey) params.set("viewKey", query.viewKey);
  if (query.filters?.length)
    params.set("filters", JSON.stringify(query.filters));
  if (query.sort?.length) params.set("sort", JSON.stringify(query.sort));
  if (query.selectedColumns?.length)
    params.set("selectedColumns", query.selectedColumns.join(","));
  return params.toString();
}

/**
 * The field errors an API failure carries.
 *
 * The error contract names them `fieldErrors` (`HttpExceptionFilter`), but this
 * adapter only ever read `errors` — so a DTO rejection that named the exact
 * field reached the form as a bare message and highlighted nothing. `errors`
 * stays as the fallback because `/validate` answers with that key, in a 200
 * body rather than an error contract.
 */
export function readFieldErrors(
  payload: unknown,
): Array<{ field?: string; message: string }> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const source = Array.isArray(record.fieldErrors)
    ? record.fieldErrors
    : Array.isArray(record.errors)
      ? record.errors
      : undefined;
  if (!source) return undefined;
  const items = source.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.message !== "string" || !entry.message) return [];
    return [
      {
        field: typeof entry.field === "string" ? entry.field : undefined,
        message: entry.message,
      },
    ];
  });
  return items.length ? items : undefined;
}

export class RuntimeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly traceId?: string,
    readonly fieldErrors?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = "RuntimeApiError";
  }
}
