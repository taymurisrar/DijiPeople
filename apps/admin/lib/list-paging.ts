/**
 * Where a client-side paged list currently is.
 *
 * Extracted from the tenant timeline because the arithmetic is the part that
 * goes wrong quietly. A list that renders every row it was given is obviously
 * unbounded; a paged list whose page number outlives the list it was paging is
 * an empty panel over a list that plainly has rows in it, and nothing about the
 * screen says which of the two you are looking at.
 */
export type PageWindow = {
  /** The page actually being shown — clamped into range, never out of it. */
  page: number;
  pageCount: number;
  /** Zero-based index of the first row on this page. */
  start: number;
  /** Exclusive end index, so `items.slice(start, end)` is the page. */
  end: number;
  /** One-based first row, for "Showing 26–50 of 154". */
  firstShown: number;
  /** One-based last row. Equal to `firstShown - 1` when there is nothing. */
  lastShown: number;
};

/**
 * Clamp, rather than correct in state.
 *
 * Filtering to a category with two entries while on page four, or reloading
 * after entries were removed, has to land somewhere sensible. Fixing it by
 * setting state from an effect means one render where the broken page is on
 * screen — so the page number is treated as a request and the answer is
 * computed, which cannot be stale by construction.
 */
export function describePage(
  total: number,
  requestedPage: number,
  pageSize: number,
): PageWindow {
  const size = Math.max(1, Math.floor(pageSize));
  const count = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), count);
  const start = (page - 1) * size;
  const end = Math.min(start + size, Math.max(0, total));
  return {
    page,
    pageCount: count,
    start,
    end,
    firstShown: total === 0 ? 0 : start + 1,
    lastShown: end,
  };
}
