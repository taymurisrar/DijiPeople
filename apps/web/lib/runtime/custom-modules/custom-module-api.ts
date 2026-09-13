import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import type { CustomModuleDefinition } from "./custom-module-runtime";

/*
 * Server-side loaders for the custom-module routes (BUG-3494).
 *
 * Refusals are answers, not crashes: 403 becomes "forbidden" and 404 becomes
 * "not-found" so the page can render the shared access-denied or not-found
 * state. A 400 is also not-found here — the only 400 these calls produce is
 * `ParseUUIDPipe` rejecting a malformed record id in the URL, which is a link
 * to nothing. Anything else is rethrown to the route error boundary. No
 * authorization decision is made here; the API made it.
 */

export type CustomModuleLoad<T> =
  | { readonly status: "ok"; readonly data: T }
  | { readonly status: "forbidden" }
  | { readonly status: "not-found" };

export type CustomModuleRecord = Readonly<Record<string, unknown>> & {
  readonly id: string;
};

export type CustomModuleRecordList = {
  readonly items: readonly CustomModuleRecord[];
  readonly meta?: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly total?: number;
  };
};

export function loadCustomModuleDefinition(moduleKey: string) {
  return classify(() =>
    apiRequestJson<CustomModuleDefinition>(
      `/metadata/custom-modules/${encodeURIComponent(moduleKey)}`,
    ),
  );
}

export function loadCustomModuleRecords(
  moduleKey: string,
  input: { readonly page: number; readonly pageSize: number },
) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  return classify(() =>
    apiRequestJson<CustomModuleRecordList>(
      `/data/${encodeURIComponent(moduleKey)}?${params.toString()}`,
    ),
  );
}

export function loadCustomModuleRecord(moduleKey: string, recordId: string) {
  return classify(() =>
    apiRequestJson<CustomModuleRecord>(
      `/data/${encodeURIComponent(moduleKey)}/${encodeURIComponent(recordId)}`,
    ),
  );
}

async function classify<T>(
  request: () => Promise<T>,
): Promise<CustomModuleLoad<T>> {
  try {
    return { status: "ok", data: await request() };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403) return { status: "forbidden" };
      if (error.status === 404 || error.status === 400) {
        return { status: "not-found" };
      }
    }
    throw error;
  }
}
