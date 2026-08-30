/*
 * Chart primitives for the Reports & Analytics workspace.
 *
 * Hand-built inline SVG with no charting dependency, deliberately — the same
 * decision `dashboard-widget-renderer.tsx` records ("a dependency would cost
 * more than it explains"), and `apps/web/package.json` is unchanged by this
 * work package.
 *
 * The maths is in `chart-geometry.ts` and the formatting in `chart-format.ts`,
 * both plain `.ts` so this app's node-environment jest can reach them; the
 * `.tsx` files are thin renderers over them.
 */

export { ChartFrame, type ChartFrameProps } from "./chart-frame";

export { LineChart, LINE_CHART_MARGINS } from "./line-chart";
export { AreaChart, AREA_CHART_MARGINS } from "./area-chart";
export { BarChart, BAR_CHART_MARGINS, type BarChartProps } from "./bar-chart";
export {
  HorizontalBarList,
  type HorizontalBarListProps,
} from "./horizontal-bar-list";
export { DonutChart, donutLegendItems, type DonutChartProps } from "./donut-chart";
export { FunnelChart, type FunnelChartProps } from "./funnel-chart";
export { Sparkline, sparklineAriaLabel, type SparklineProps } from "./sparkline";

export {
  ChartEmpty,
  ChartLegend,
  ChartPatternDefs,
  ChartSurface,
  CHART_VIEWBOX_WIDTH,
  DEFAULT_CHART_HEIGHT,
  useChartIdPrefix,
  type ChartLegendItem,
} from "./chart-chrome";

export {
  hasChartData,
  type BaseChartProps,
  type ChartGranularity,
  type ChartPoint,
  type ChartSeries,
  type ChartValueFormat,
} from "./chart-types";

export {
  formatChartValue,
  formatShare,
  formatTimeBucketLabel,
  pointAccessibleLabel,
  pointActionAccessibleLabel,
  summarizeChartShape,
} from "./chart-format";

export {
  bucketByPeriod,
  buildAreaPath,
  buildLinePath,
  collapseToTopN,
  computeShares,
  donutArcs,
  funnelStages,
  linearScale,
  niceTicks,
  resolvePlotArea,
  seriesExtent,
  stackedExtent,
  stackSeries,
  DEFAULT_WEEK_STARTS_ON,
  type CollapsedPoint,
  type DonutArc,
  type FunnelStage,
  type ShareItem,
  type StackedColumn,
  type TimeBucket,
  type TimeSeriesPoint,
} from "./chart-geometry";

export {
  CHART_SERIES_COLORS,
  MAX_CHART_SLICES,
  MIN_VISIBLE_SHARE_PERCENT,
  OTHER_BUCKET_KEY,
  otherBucketLabel,
  seriesColor,
  seriesDashArray,
} from "./chart-tokens";
