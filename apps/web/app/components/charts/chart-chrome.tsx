"use client";

import * as React from "react";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CHART_AXIS_OPACITY,
  CHART_GRID_OPACITY,
  CHART_PATTERN_OVERLAY,
  seriesColor,
  seriesPatternGeometry,
} from "./chart-tokens";

/*
 * The parts every chart in this directory is assembled from.
 *
 * Nothing here computes anything — the maths is in `chart-geometry.ts`, which
 * is where it can be tested. These are the drawing conventions, kept in one
 * place so seven charts cannot each invent their own axis, their own legend and
 * their own idea of what an empty chart looks like.
 *
 * Two conventions run through all of it:
 *
 * **Colour comes from the palette, everything else comes from a design token.**
 * Series paints are `fill`/`stroke` attributes carrying a hex from
 * `chart-tokens.ts`; axes, gridlines, labels and surfaces are Tailwind classes
 * (`text-muted`, `bg-surface`, `border-border`) rendered through
 * `stroke="currentColor"` / `fill="currentColor"`. That is what makes dark mode
 * work without a second palette: `globals.css` swaps the tokens under
 * `html[data-theme="dark"] .dp-theme-scope`, and the swap reaches anything
 * drawn in `currentColor` for free. There is no `bg-white` and no `text-slate-*`
 * anywhere in this directory.
 *
 * **Nothing is sized in pixels.** Every chart draws into a nominal viewBox and
 * the SVG is `w-full h-auto`, so the browser scales it to whatever the
 * container is. `height` is an aspect-ratio hint, never a width.
 */

/** The nominal drawing width. Only the ratio to `height` escapes the SVG. */
export const CHART_VIEWBOX_WIDTH = 720;

export const DEFAULT_CHART_HEIGHT = 240;

/**
 * A stable, per-instance id prefix for SVG defs.
 *
 * Two charts on one page emitting `<pattern id="diagonal">` is a duplicate-id
 * defect, and the practical symptom is worse than the validation error: the
 * second chart's `url(#diagonal)` resolves to the *first* chart's pattern, so
 * it silently renders in another chart's colours.
 */
export function useChartIdPrefix(): string {
  const generated = React.useId();
  return `dp-chart-${generated.replace(/:/g, "")}`;
}

export function seriesPatternUrl(prefix: string, index: number): string {
  return `url(#${prefix}-series-${Math.abs(Math.trunc(index)) % 8})`;
}

/**
 * One `<pattern>` per series: the series colour, overlaid with a hatch whose
 * geometry differs per index.
 *
 * BUG-2148's lesson generalised. A reader who cannot separate two hues cannot
 * separate two series; so can a reader printing the report in greyscale, and so
 * can a reader on a projector. The hatch is a second, non-colour channel
 * carrying the same distinction.
 */
export function ChartPatternDefs({
  count,
  prefix,
}: {
  count: number;
  prefix: string;
}) {
  const safeCount = Math.max(0, Math.min(64, Math.trunc(count)));

  return (
    <defs>
      {Array.from({ length: safeCount }, (_, index) => {
        const color = seriesColor(index);
        const geometry = seriesPatternGeometry(index);

        return (
          <pattern
            height={8}
            id={`${prefix}-series-${index % 8}`}
            key={`${prefix}-series-${index}`}
            patternUnits="userSpaceOnUse"
            width={8}
          >
            <rect fill={color} height={8} width={8} />
            <PatternGeometry geometry={geometry} />
          </pattern>
        );
      })}
    </defs>
  );
}

function PatternGeometry({ geometry }: { geometry: string }) {
  const stroke = CHART_PATTERN_OVERLAY;

  if (geometry === "solid") {
    return null;
  }

  if (geometry === "dots") {
    return <circle cx={4} cy={4} fill={stroke} r={1.4} />;
  }

  if (geometry === "diagonal") {
    return <path d="M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6" stroke={stroke} strokeWidth={1.6} />;
  }

  if (geometry === "diagonal-back") {
    return <path d="M -2 6 L 2 10 M 0 0 L 8 8 M 6 -2 L 10 2" stroke={stroke} strokeWidth={1.6} />;
  }

  if (geometry === "horizontal") {
    return <path d="M 0 2 L 8 2 M 0 6 L 8 6" stroke={stroke} strokeWidth={1.4} />;
  }

  if (geometry === "vertical") {
    return <path d="M 2 0 L 2 8 M 6 0 L 6 8" stroke={stroke} strokeWidth={1.4} />;
  }

  if (geometry === "cross") {
    return <path d="M 0 4 L 8 4 M 4 0 L 4 8" stroke={stroke} strokeWidth={1.4} />;
  }

  /* grid */
  return <path d="M 0 0 L 8 0 M 0 0 L 0 8" stroke={stroke} strokeWidth={1.4} />;
}

/**
 * The SVG canvas.
 *
 * `role` is deliberately conditional. A non-interactive chart is one image and
 * `role="img"` with a name is the whole of its accessible representation — the
 * shapes inside carry nothing. A chart with focusable points is not an image at
 * all: `role="img"` would prune its own children from the accessibility tree,
 * hiding the very targets that were made focusable. Getting this backwards
 * produces a chart that is keyboard-operable and completely unreadable.
 */
export function ChartSurface({
  ariaLabel,
  children,
  describedBy,
  height,
  interactive = false,
  width = CHART_VIEWBOX_WIDTH,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  describedBy?: string;
  height: number;
  interactive?: boolean;
  width?: number;
}) {
  return (
    <svg
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      className="h-auto w-full overflow-visible text-muted"
      preserveAspectRatio="xMidYMid meet"
      role={interactive ? "group" : "img"}
      viewBox={`0 0 ${width} ${height}`}
    >
      {children}
    </svg>
  );
}

/**
 * Horizontal gridlines and their value labels.
 *
 * Drawn in `currentColor` at a low opacity so they recede behind the data and
 * follow the theme. The zero line is drawn darker, because on a chart with
 * negative values it is the only line that means anything.
 */
export function ChartValueGrid({
  formatTick,
  labelWidth = 8,
  plot,
  ticks,
  yScale,
}: {
  formatTick: (value: number) => string;
  labelWidth?: number;
  plot: { x: number; y: number; width: number; height: number };
  ticks: readonly number[];
  yScale: (value: number) => number;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => {
        const y = yScale(tick);
        const isZero = tick === 0;

        return (
          <g key={`grid-${tick}`}>
            <line
              opacity={isZero ? CHART_AXIS_OPACITY : CHART_GRID_OPACITY}
              stroke="currentColor"
              x1={plot.x}
              x2={plot.x + plot.width}
              y1={y}
              y2={y}
            />
            <text
              className="fill-current text-2xs"
              dominantBaseline="middle"
              textAnchor="end"
              x={plot.x - labelWidth}
              y={y}
            >
              {formatTick(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Category labels along the bottom.
 *
 * `aria-hidden` because they duplicate names already carried by each point's
 * own accessible label — announcing an axis full of bare category names before
 * the data reads as noise. They are decoration for sighted readers; the
 * information is in the points and in the table representation.
 *
 * Labels thin out rather than overlap. Overlapping axis text is illegible for
 * everyone, and the omitted names are still in the table.
 */
export function ChartCategoryAxis({
  categories,
  plot,
  xFor,
  maxLabels = 12,
}: {
  categories: readonly { key: string; label: string }[];
  plot: { x: number; y: number; width: number; height: number };
  xFor: (index: number) => number;
  maxLabels?: number;
}) {
  const stride = Math.max(1, Math.ceil(categories.length / maxLabels));

  return (
    <g aria-hidden="true">
      {categories.map((category, index) =>
        index % stride === 0 ? (
          <text
            className="fill-current text-2xs"
            dominantBaseline="hanging"
            key={`axis-${category.key}`}
            textAnchor="middle"
            x={xFor(index)}
            y={plot.y + plot.height + 10}
          >
            {truncateLabel(category.label)}
          </text>
        ) : null,
      )}
    </g>
  );
}

/**
 * SVG has no text overflow, so a long department name runs off the canvas and
 * over the next chart. Truncation happens here rather than in the data, so the
 * full name still reaches the accessible label and the table.
 */
export function truncateLabel(label: string, max = 18): string {
  if (typeof label !== "string") return "";
  return label.length > max ? `${label.slice(0, max - 1)}...` : label;
}

export type ChartLegendItem = {
  key: string;
  label: string;
  colorIndex: number;
  /** Optional trailing figure — a total, a share. */
  valueText?: string | null;
  /** Marks a comparison overlay so it is not read as another category. */
  muted?: boolean;
};

/**
 * The legend.
 *
 * A list, not a row of divs, because it is a list — and because that is what
 * lets a screen reader announce how many series there are before reading them.
 * The swatch is `aria-hidden`: it carries no information the adjacent label
 * does not already carry, and announcing "image" before every series name is
 * pure noise. This is the shape BUG-2148 asks for — the colour is redundant
 * with the text, rather than being the only carrier of it.
 */
export function ChartLegend({
  items,
  patternPrefix,
}: {
  items: readonly ChartLegendItem[];
  patternPrefix?: string;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <li
          className="flex min-w-0 items-center gap-2 text-xs text-muted"
          key={item.key}
        >
          <svg
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0"
            viewBox="0 0 8 8"
          >
            {patternPrefix ? (
              <ChartPatternDefs
                count={item.colorIndex + 1}
                prefix={`${patternPrefix}-legend-${item.key}`}
              />
            ) : null}
            <rect
              fill={
                patternPrefix
                  ? seriesPatternUrl(
                      `${patternPrefix}-legend-${item.key}`,
                      item.colorIndex,
                    )
                  : seriesColor(item.colorIndex)
              }
              height={8}
              opacity={item.muted ? 0.55 : 1}
              rx={1.5}
              width={8}
            />
          </svg>

          <span className="truncate text-foreground">{item.label}</span>

          {item.valueText ? (
            <span className="shrink-0 tabular-nums">{item.valueText}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * What a chart shows when it has nothing to show.
 *
 * The shared `EmptyState`, never an axis box with no data in it: a drawn but
 * empty chart reads as a rendering failure, and BUG-1654 is the record of how
 * expensive it is to tell a healthy workspace that it is broken.
 */
export function ChartEmpty({
  message,
  title = "No data for this period",
}: {
  message?: string;
  title?: string;
}) {
  return (
    <EmptyState
      description={
        message ??
        "Nothing was recorded in the selected period. Try widening the date range or clearing a filter."
      }
      title={title}
    />
  );
}

/**
 * Keyboard activation for a plotted point.
 *
 * Charts make points focusable when `onPointSelect` is supplied, and a
 * focusable thing that only responds to a click is not operable — the repo's
 * eslint config turns `jsx-a11y/click-events-have-key-events` and
 * `interactive-supports-focus` to `error` for exactly this shape. Space is
 * intercepted as well as Enter: without `preventDefault` it scrolls the page
 * instead of activating the control under the cursor.
 */
export function activateOnKey(activate: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      activate();
    }
  };
}

/**
 * The focus ring for an in-SVG target.
 *
 * `focus-visible:outline` on an SVG child is unreliable across browsers, so the
 * charts draw their own indicator. Keyboard focus that cannot be seen is the
 * same as no keyboard support at all.
 */
export const CHART_FOCUSABLE_CLASS =
  "cursor-pointer outline-none [&:focus-visible]:stroke-accent [&:focus-visible]:[stroke-width:3px]";
