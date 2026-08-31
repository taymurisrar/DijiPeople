import type { ReportFilterInput } from "./reporting-types";

/*
 * Building the body of a `/reporting` POST.
 *
 * The API's global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so
 * **one extra key is a 400**, not an ignored field. That makes body
 * construction a thing worth testing rather than a thing worth inlining: a
 * screen that sends `{ ...state }` works until someone adds a property to the
 * state object, and then every chart on the page fails at once with a message
 * about a property nobody remembers adding.
 *
 * So every builder here is explicit, drops empty values rather than sending
 * `undefined`, and is covered by `analytics-request.spec.ts`.
 *
 * The period is sent as a **preset**, and `from`/`to` only for `custom`. The
 * server resolves presets in the tenant's timezone, which the browser does not
 * reliably know; resolving "this month" here and sending the dates would put
 * the server's answer and the screen's label one day apart for any tenant whose
 * midnight is not the server's.
 */

export type AnalyticsQueryBody = {
  sourceKey: string;
  preset?: string;
  from?: string;
  to?: string;
  comparison?: string;
  filters?: ReportFilterInput[];
  metricKeys?: string[];
  breakdown?: string;
  trendMetricKey?: string;
  granularity?: string;
};

export type AnalyticsRecordsBody = AnalyticsQueryBody & {
  fields?: string[];
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
};

export type RunReportBody = {
  targetKey: string;
  preset?: string;
  from?: string;
  to?: string;
  filters?: ReportFilterInput[];
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  recordView?: boolean;
};

export type PeriodSelection = {
  preset: string;
  from?: string;
  to?: string;
  comparison?: string;
};

/** The rows a drill-down or a report page shows at once. */
export const DEFAULT_RECORD_PAGE_SIZE = 25;

/** The server bounds this at 200; asking for more is a 400, not a clamp. */
export const MAX_RECORD_PAGE_SIZE = 200;

export function buildAnalyticsQueryBody(input: {
  sourceKey: string;
  period: PeriodSelection;
  filters?: ReportFilterInput[];
  metricKeys?: string[];
  breakdown?: string | null;
  trendMetricKey?: string | null;
  granularity?: string | null;
}): AnalyticsQueryBody {
  const body: AnalyticsQueryBody = { sourceKey: input.sourceKey };

  applyPeriod(body, input.period);

  if (input.filters?.length) body.filters = input.filters;
  if (input.metricKeys?.length) body.metricKeys = input.metricKeys;
  if (input.breakdown) body.breakdown = input.breakdown;
  if (input.trendMetricKey) body.trendMetricKey = input.trendMetricKey;
  if (input.granularity) body.granularity = input.granularity;

  return body;
}

export function buildAnalyticsRecordsBody(input: {
  sourceKey: string;
  period: PeriodSelection;
  filters?: ReportFilterInput[];
  fields?: string[];
  page?: number;
  pageSize?: number;
  sortField?: string | null;
  sortDirection?: "asc" | "desc" | null;
}): AnalyticsRecordsBody {
  const body: AnalyticsRecordsBody = { sourceKey: input.sourceKey };

  /*
   * The records endpoint takes the query fields but ignores comparison,
   * metrics, breakdown and trend. Sending `comparison` would not fail — it is
   * on the DTO — but it would be a lie about what the request is doing, so the
   * period is applied without it.
   */
  applyPeriod(body, { ...input.period, comparison: undefined });

  if (input.filters?.length) body.filters = input.filters;
  if (input.fields?.length) body.fields = input.fields;

  body.page = clampPage(input.page);
  body.pageSize = clampPageSize(input.pageSize);

  if (input.sortField) {
    body.sortField = input.sortField;
    body.sortDirection = input.sortDirection === "asc" ? "asc" : "desc";
  }

  return body;
}

export function buildRunReportBody(input: {
  targetKey: string;
  period?: Partial<PeriodSelection>;
  filters?: ReportFilterInput[];
  page?: number;
  pageSize?: number;
  sortField?: string | null;
  sortDirection?: "asc" | "desc" | null;
  recordView?: boolean;
}): RunReportBody {
  const body: RunReportBody = { targetKey: input.targetKey };

  if (input.period?.preset) {
    applyPeriod(body, {
      preset: input.period.preset,
      from: input.period.from,
      to: input.period.to,
    });
  }

  if (input.filters?.length) body.filters = input.filters;

  body.page = clampPage(input.page);
  body.pageSize = clampPageSize(input.pageSize);

  if (input.sortField) {
    body.sortField = input.sortField;
    body.sortDirection = input.sortDirection === "asc" ? "asc" : "desc";
  }

  if (input.recordView === false) body.recordView = false;

  return body;
}

/**
 * `preset`, plus `from`/`to` only when the preset is `custom`.
 *
 * A `custom` preset with only one of the two dates is downgraded rather than
 * sent: the server throws "A custom period requires both from and to", and a
 * half-filled date picker is a normal thing for a user to have on screen for a
 * second. `last_30_days` is the same default the server falls back to.
 */
function applyPeriod(
  body: { preset?: string; from?: string; to?: string; comparison?: string },
  period: PeriodSelection,
) {
  if (period.preset === "custom") {
    if (period.from && period.to) {
      body.preset = "custom";
      body.from = period.from;
      body.to = period.to;
    } else {
      body.preset = "last_30_days";
    }
  } else if (period.preset) {
    body.preset = period.preset;
  }

  if (period.comparison && period.comparison !== "none") {
    body.comparison = period.comparison;
  }
}

export function clampPage(page: number | undefined): number {
  if (!Number.isFinite(page) || !page || page < 1) return 1;
  return Math.min(Math.trunc(page), 10_000);
}

export function clampPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize) || !pageSize || pageSize < 1) {
    return DEFAULT_RECORD_PAGE_SIZE;
  }
  return Math.min(Math.trunc(pageSize), MAX_RECORD_PAGE_SIZE);
}

/** Read a positive integer out of a search parameter, or a fallback. */
export function readPositiveInteger(
  raw: string | string[] | undefined,
  fallback: number,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}
