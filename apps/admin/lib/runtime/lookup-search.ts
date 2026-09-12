/**
 * The debounce primitive behind BUG-3376's admin-console fix.
 *
 * Mirrors `apps/web/lib/runtime/lookup-search.ts` (`createDebouncedCallback`).
 * `apps/admin` has no shared package with `apps/web` for this (root
 * `AGENTS.md`: `packages/` holds exactly four workspaces, none of them a
 * lookup kit), so the ~25-line primitive is duplicated rather than imported
 * across apps. Kept here rather than inlined in `use-runtime-lookup-options.ts`
 * so the timing logic — the part that goes wrong silently — is unit-testable
 * without jsdom.
 */

/** How long to wait after the last keystroke before issuing a search request. */
export const LOOKUP_SEARCH_DEBOUNCE_MS = 300;

export function createDebouncedCallback<Args extends readonly unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
  schedule: (handler: () => void, delayMs: number) => unknown = setTimeout,
  clear: (handle: unknown) => void = (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
) {
  let pending: unknown = null;

  function run(...args: Args) {
    if (pending !== null) clear(pending);
    pending = schedule(() => {
      pending = null;
      callback(...args);
    }, delayMs);
  }

  function cancel() {
    if (pending !== null) clear(pending);
    pending = null;
  }

  return { run, cancel };
}
