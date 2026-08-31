"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus, ShieldAlert } from "lucide-react";
import { StatusPill } from "@/app/components/ui/status-pill";
import type { AnalyticsMetricResult } from "../_lib/reporting-types";
import {
  describeDelta,
  formatReportValue,
  metricTileAccessibleLabel,
} from "../_lib/report-format";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * A KPI tile: a number, how it moved, and why it might not mean what it looks
 * like.
 *
 * The three things that make this a reporting tile rather than a dashboard card
 * are all load-bearing.
 *
 * **The delta is a sentence, not a colour.** BUG-2148 shipped severity conveyed
 * by hue alone. A red "-8.2%" is exactly that defect: it asserts "worse" in a
 * channel a colour-blind reader, a screen-reader user and a printed page all
 * miss. So the movement carries an arrow *and* the words "better" / "worse",
 * and the colour is the third signal rather than the only one. A `neutral`
 * metric — every desktop-activity metric is neutral on purpose — gets no
 * judgement word and no judgement colour, because the product does not claim
 * that less "active time" is worse.
 *
 * **Caveats are attached to the number they qualify.** A caveat in a footnote
 * at the bottom of the page is a caveat nobody reads. "The denominator is
 * attendance days, which includes weekends, holidays and leave" changes what
 * the attendance rate above it *means*; it belongs on that tile.
 *
 * **Suppression is a state, not a zero.** When the population behind a metric
 * is too small, the API returns `value: null` and `suppressed: true`. Rendering
 * that as 0 would be a lie that looks like data. The tile says it was withheld
 * and why.
 */

export type MetricTileProps = {
  metric: AnalyticsMetricResult;
  /** e.g. "1 Aug 2026 - 31 Aug 2026", for the delta sentence. */
  comparisonLabel?: string;
  currencyCode?: string | null;
};

export function MetricTile({
  metric,
  comparisonLabel,
  currencyCode,
}: MetricTileProps) {
  /* Read from the provider, not the effect-installed module default — see the
   * comment in report-records-table.tsx and BUG-2647. A plain integer formats
   * the same either way, which is what kept this latent; a currency, a percent
   * or a decimal does not. */
  const formattingContext = useFormattingContext();

  const valueText = metric.suppressed
    ? "Withheld"
    : formatReportValue(metric.value, metric.format, metric.key, {
        currencyCode,
        context: formattingContext,
      });

  const delta = describeDelta(metric, {
    currencyCode,
    comparisonLabel,
    context: formattingContext,
  });
  const accessibleLabel = metricTileAccessibleLabel(metric, valueText, delta);

  return (
    <article
      aria-label={accessibleLabel}
      className="flex flex-col gap-3 rounded-[22px] border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-5 text-muted">
          {metric.label}
        </h3>
        {metric.suppressed ? (
          <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        ) : null}
      </div>

      {/*
       * `aria-hidden` on the visual number and the delta, because the whole
       * tile already carries `aria-label` with the same information in one
       * utterance. Without it a screen reader reads the label, then the number,
       * then the arrow's fallback, then the sentence — four fragments whose
       * relationship the reader has to reconstruct.
       */}
      <p
        aria-hidden="true"
        className={`text-3xl font-semibold tracking-tight ${
          metric.suppressed ? "text-muted" : "text-foreground"
        }`}
      >
        {valueText}
      </p>

      {metric.suppressed ? (
        <p className="text-xs leading-5 text-muted">
          Withheld: the population behind this number is small enough that the
          aggregate would identify individuals.
        </p>
      ) : (
        <DeltaLine delta={delta} />
      )}

      {metric.caveats.length > 0 ? (
        <MetricCaveats caveats={metric.caveats} label={metric.label} />
      ) : null}
    </article>
  );
}

function DeltaLine({
  delta,
}: {
  delta: ReturnType<typeof describeDelta>;
}) {
  if (!delta.present) {
    return (
      <p aria-hidden="true" className="text-xs leading-5 text-muted">
        No comparison selected
      </p>
    );
  }

  const Icon =
    delta.movement === "up"
      ? ArrowUpRight
      : delta.movement === "down"
        ? ArrowDownRight
        : Minus;

  /*
   * Colour is the *third* signal after the glyph and the word, and it is only
   * applied when the metric declares a direction. `text-muted` for neutral is
   * not a fallback, it is the correct rendering of "no judgement".
   */
  const tone =
    delta.judgement === "better"
      ? "text-success"
      : delta.judgement === "worse"
        ? "text-danger"
        : "text-muted";

  return (
    <p
      aria-hidden="true"
      className={`flex items-start gap-1.5 text-xs leading-5 ${tone}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{delta.text}</span>
    </p>
  );
}

/**
 * The caveats behind one metric, collapsed.
 *
 * A native `<details>` rather than a custom disclosure: it is keyboard
 * operable, it is announced as expandable, it works with no JavaScript, and it
 * cannot be got wrong. The summary says how many notes there are, so the reader
 * can tell a metric with one presentational note from one with four that change
 * its meaning without expanding either.
 */
function MetricCaveats({
  caveats,
  label,
}: {
  caveats: readonly string[];
  label: string;
}) {
  return (
    <details className="group mt-auto">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
        <span>
          {caveats.length} {caveats.length === 1 ? "note" : "notes"} on how{" "}
          {label.toLowerCase()} is measured
        </span>
      </summary>
      <ul className="mt-2 grid gap-1.5 border-l-2 border-border pl-3">
        {caveats.map((caveat) => (
          <li key={caveat} className="text-xs leading-5 text-muted">
            {caveat}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * How wide the caller's row scope is, said plainly.
 *
 * The same numbers mean different things to a manager and to an HR lead, and
 * the screen is otherwise identical for both. `accessLevel` comes back on every
 * analytics response for exactly this reason.
 */
export function AccessScopePill({ accessLevel }: { accessLevel: string }) {
  const text = ACCESS_LEVEL_TEXT[accessLevel] ?? `Scope: ${accessLevel}`;

  return (
    <StatusPill tone="info">
      <span>{text}</span>
    </StatusPill>
  );
}

const ACCESS_LEVEL_TEXT: Record<string, string> = {
  OWN: "Your own records only",
  TEAM: "Your team",
  BUSINESS_UNIT: "Your business unit",
  ORGANIZATION: "Your organisation",
  TENANT: "The whole workspace",
};
