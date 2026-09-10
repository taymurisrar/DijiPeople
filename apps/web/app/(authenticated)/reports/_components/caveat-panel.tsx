import { Info, ShieldAlert } from "lucide-react";

/*
 * The notes that change what the numbers above mean.
 *
 * `/reporting` returns `caveats[]` on the source, on every metric and on the
 * query as a whole, and returns `suppressed` / `suppressedBuckets` when it has
 * withheld something. None of that is decoration. A caveat here says that a
 * rate's denominator is agent uptime rather than scheduled hours; that a
 * dimension reflects where someone sits *today* rather than on the date of the
 * row; that a day boundary is the shift's and not the calendar's; that a period
 * including today is short a day because reconciliation has not run.
 *
 * ITEM-0128 — this panel used to print every caveat as an always-open list
 * above the tiles: 13 paragraphs on Attendance, 12 on Workforce, 6 on
 * Recruitment, all before the first number. Genuinely good writing that a
 * reader skips at that size and placement, which means the caveats most in
 * need of being read were the ones guaranteed not to be.
 *
 * The fix reuses the disclosure pattern `metric-tile.tsx` already established
 * for a per-metric caveat ("N notes on how X is measured") rather than
 * inventing a second one: a native `<details>`, keyboard-operable and
 * announced as expandable with no JavaScript, whose `<summary>` names how many
 * notes it holds — nothing here is lost, it is one control away instead of
 * occupying the page by default. Suppression stays outside the disclosure and
 * always visible: it is not a note about how to *interpret* the numbers below,
 * it is a statement that some of the data is not there, which changes what the
 * breakdown chart's bars add up to right now.
 */

export function CaveatPanel({
  caveats,
  suppression,
}: {
  caveats: readonly string[];
  /** Present only when the API actually withheld something. */
  suppression?: {
    suppressedBuckets: number;
    suppressionLabel: string;
  } | null;
}) {
  if (caveats.length === 0 && !suppression) return null;

  return (
    <section
      aria-labelledby="reporting-caveats-heading"
      className="rounded-[22px] border border-border bg-surface-strong p-4"
    >
      <h2
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
        id="reporting-caveats-heading"
      >
        <Info aria-hidden="true" className="h-4 w-4" />
        How to read these numbers
      </h2>

      {suppression ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-5 text-foreground">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">
              {suppression.suppressedBuckets}{" "}
              {suppression.suppressedBuckets === 1 ? "group was" : "groups were"}{" "}
              withheld.
            </strong>{" "}
            {suppression.suppressionLabel}. The withheld groups are removed
            rather than shown as zero, so the visible bars do not add up to the
            total.
          </span>
        </p>
      ) : null}

      {caveats.length > 0 ? (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            <span>
              {caveats.length} {caveats.length === 1 ? "note" : "notes"} on how
              these numbers are measured
            </span>
          </summary>
          <ul className="mt-2 grid gap-2">
            {caveats.map((caveat) => (
              <li
                key={caveat}
                className="border-l-2 border-border pl-3 text-xs leading-5 text-muted"
              >
                {caveat}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
