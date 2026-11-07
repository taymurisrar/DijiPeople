/**
 * Sharing of identical lookup GETs inside a short window (DP-QA-025). Used in
 * the browser for form lookups and on the server for the public branding read.
 *
 * A record form hydrates one option list per lookup field, and several fields
 * read the same list (Location and Official Joining Location; every re-render of
 * the hydration effect asks again). Opening New Employee issued ~127 API calls,
 * 22 of them for the same locations list, against a 600-a-minute read budget
 * that a few form opens exhausted (then DP-QA-024).
 *
 * Identical requests inside a short window share one call. A failure is never
 * kept, so a retry goes to the network; `clearSharedLookupRequests` is for after
 * a write that changes reference data.
 */
const TTL_MS = 15_000;
/*
 * The server keys some reads by a value that comes from the Host header, so the
 * map must not be growable without limit: past this size expired entries are
 * dropped, and if it is still full the oldest are evicted.
 */
const MAX_ENTRIES = 200;

type Entry = { readonly promise: Promise<unknown>; readonly at: number };
const entries = new Map<string, Entry>();

export function sharedLookupRequest<T>(
  key: string,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const existing = entries.get(key);
  if (existing && now() - existing.at < TTL_MS) {
    return existing.promise as Promise<T>;
  }

  const promise = load();
  if (entries.size >= MAX_ENTRIES) prune(now());
  entries.set(key, { promise, at: now() });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

export function clearSharedLookupRequests() {
  entries.clear();
}

function prune(at: number) {
  for (const [key, entry] of entries) {
    if (at - entry.at >= TTL_MS) entries.delete(key);
  }
  // Still full of live entries: evict the oldest (Map keeps insertion order).
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}
