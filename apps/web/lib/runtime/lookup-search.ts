/**
 * Pure logic behind the entity-lookup search fix (BUG-3376).
 *
 * Pulled out of `LookupField` (`app/components/ui/form-control.tsx`) because
 * `apps/web`'s jest config only runs `*.spec.ts` under a `node` environment —
 * no jsdom, no component rendering (see `apps/web/AGENTS.md`). The debounce
 * timing, the "keep the selected record visible" merge, and the truncation
 * message are exactly the parts of the fix that go wrong silently, so they are
 * the parts worth asserting in isolation.
 */

/** How long to wait after the last keystroke before issuing a search request. */
export const LOOKUP_SEARCH_DEBOUNCE_MS = 300;

/**
 * The page size sent for an entity-backed lookup once a search or an explicit
 * fetch is issued. Chosen — not accidental — per BUG-3376's proposed
 * resolution: big enough that most tenants never truncate, small enough that a
 * lookup request stays cheap.
 */
export const ENTITY_LOOKUP_PAGE_SIZE = 50;

/**
 * Small, effectively-fixed reference sets that already fit inside one
 * unfiltered page today (BUG-3376's "Small reference sets should keep the
 * cheap prefetch path, chosen by the spec rather than by accident"). Matched
 * case-insensitively against a field's `lookupTargets[0].entityLogicalName`,
 * which this codebase spells inconsistently (singular in field metadata,
 * plural in the reference-route map) — both forms are listed rather than
 * guessing which one a given call site produces.
 */
export const SMALL_REFERENCE_LOOKUP_ENTITIES: ReadonlySet<string> = new Set([
  "country",
  "countries",
  "currency",
  "currencies",
  "timezone",
  "timezones",
  "state",
  "states",
  "stateprovince",
  "stateprovinces",
  "state-provinces",
  "city",
  "cities",
]);

export function isSmallReferenceLookupEntity(
  entityLogicalName: string | null | undefined,
): boolean {
  if (!entityLogicalName) return false;
  return SMALL_REFERENCE_LOOKUP_ENTITIES.has(entityLogicalName.toLowerCase());
}

/**
 * A debounced wrapper around a callback that takes a single string.
 *
 * Not a hook — `LookupField` owns the `setTimeout`/`clearTimeout` lifecycle
 * itself via `useRef`, because a hook here would still need a rendering
 * environment to test. `createDebouncedCallback` isolates the one part that is
 * actually worth getting wrong twice: cancelling the previous timer before
 * scheduling the next one, and never firing after `cancel()`.
 */
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

type SelectableLookupOption = {
  readonly id: string;
  readonly name: string;
  readonly key?: string | null;
  readonly code?: string | null;
};

/**
 * Which option should render as "selected" this render.
 *
 * A caller that replaces its `options` array with a narrower server page (a
 * search result) can silently drop the option matching the current `value`.
 * Without this, the control falls back to showing the placeholder for a field
 * that plainly has a value — indistinguishable, to the user, from the value
 * having been cleared. The previously-resolved option is kept as long as
 * `value` has not itself changed, and dropped the instant it has (including to
 * empty), so a stale label can never survive a real selection change.
 */
export function resolveVisibleSelectedOption<
  TOption extends SelectableLookupOption,
>(
  value: string,
  optionsMatch: TOption | null,
  previous: { readonly value: string; readonly option: TOption } | null,
): TOption | null {
  if (!value) return null;
  if (optionsMatch) return optionsMatch;
  if (previous && previous.value === value) return previous.option;
  return null;
}

/**
 * Whether a lookup's result list should say it is incomplete.
 *
 * Deliberately conservative: a page exactly as long as the requested size is
 * treated as possibly truncated (the common case — the server does not tell
 * this caller a total count), and anything shorter is treated as complete.
 * False positives are one redundant hint; false negatives are the defect this
 * exists to prevent.
 */
export function isLookupResultTruncated(
  resultCount: number,
  pageSize: number | undefined,
): boolean {
  if (!pageSize || pageSize <= 0) return false;
  return resultCount >= pageSize;
}

export function buildLookupTruncationMessage(resultCount: number): string {
  return `Showing first ${resultCount} — keep typing to narrow.`;
}
