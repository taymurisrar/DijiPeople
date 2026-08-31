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
 * A metric rendered without its caveat is a misleading number, so this panel
 * sits above the tiles rather than below the fold. Per-metric notes stay on
 * their own tile — the note about attendance-day denominators belongs to the
 * attendance rate, not to the page.
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
        <ul className="mt-3 grid gap-2">
          {caveats.map((caveat) => (
            <li
              key={caveat}
              className="border-l-2 border-border pl-3 text-xs leading-5 text-muted"
            >
              {caveat}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
