"use client";

import { useEffect, useState } from "react";
import type { RuntimeLookupOption } from "./runtime-lookups";

/**
 * Read an allowlisted runtime lookup.
 *
 * The fetch lives here rather than in the components because the form's lookup
 * control and the record header's owner picker read the same endpoint, with
 * the same failure modes: the route answers `{ items }`, a rejected path
 * answers a message, and an aborted request must not surface as an error the
 * operator sees. Two copies of that meant the header could report "Unable to
 * load lookup" for a navigation the form treated as ordinary.
 *
 * `path` is matched against `ALLOWED_LOOKUPS` in
 * `app/api/platform-runtime/lookups/route.ts`; passing one the registry does
 * not declare returns 400 by design.
 *
 * BUG-3376 — `search` is optional and additive. The route already reads and
 * forwards a `search` query parameter
 * (`app/api/platform-runtime/lookups/route.ts`, `buildRuntimeLookupPath` in
 * `./runtime-lookups.ts`); this hook was the one thing in the chain that never
 * sent one, so every lookup was silently limited to whatever the underlying
 * collection's own default page contained. Callers that do not pass `search`
 * are unaffected. The caller is expected to have already debounced the value
 * it passes in — see `RuntimeLookup` in `runtime-form.tsx` and
 * `createDebouncedCallback` in `./lookup-search.ts` — so this hook only ever
 * issues one request per settled query, not one per keystroke.
 */
export function useRuntimeLookupOptions(
  path: string | undefined,
  search?: string,
) {
  /*
   * One state object keyed by the request it answers, rather than separate
   * `options` / `error` / `loading` slices. Loading is then derived — the
   * result on hand is for a different request than the one being asked about —
   * instead of set synchronously inside the effect, which cascades a render
   * on every mount and is what `react-hooks/set-state-in-effect` objects to.
   */
  const requestKey = path ? `${path}::${search?.trim() ?? ""}` : undefined;
  const [result, setResult] = useState<{
    requestKey: string | undefined;
    options: RuntimeLookupOption[];
    error: string | null;
  }>({ requestKey: undefined, options: [], error: null });

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ path });
    const trimmedSearch = search?.trim();
    if (trimmedSearch) params.set("search", trimmedSearch);
    fetch(`/api/platform-runtime/lookups?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { items?: RuntimeLookupOption[]; message?: string }
          | RuntimeLookupOption[]
          | null;
        if (!response.ok)
          throw new Error(
            (!Array.isArray(payload) ? payload?.message : null) ??
              "Unable to load lookup.",
          );
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setResult({
          requestKey,
          options: Array.isArray(payload) ? payload : (payload?.items ?? []),
          error: null,
        });
      })
      .catch((reason: unknown) => {
        if (isAbortError(reason) || !active) return;
        console.error("Runtime lookup failed", reason);
        setResult({
          requestKey,
          options: [],
          error:
            reason instanceof Error ? reason.message : "Unable to load lookup.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, requestKey, search]);

  const settled = result.requestKey === requestKey;
  return {
    options: settled ? result.options : [],
    error: settled ? result.error : null,
    loading: Boolean(path) && !settled,
  };
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.code === DOMException.ABORT_ERR)
  );
}
