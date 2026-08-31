/*
 * Browser-side writes for the reporting workspace.
 *
 * Reads happen on the server, where `lib/server-api.ts` already handles auth,
 * refresh and error normalisation. Writes — saving a view, favouriting a
 * report, creating a definition — happen from a control the user clicked, so
 * they go through the Next proxy at `/api/reporting/*`.
 *
 * The one job of this module is to not lose the API's error. The proxy forwards
 * `message`, `errorCode`, `traceId`, `description` and `fieldErrors` through
 * `proxyErrorResponse`; a naive `if (!res.ok) throw new Error("failed")` here
 * would throw all of that away one hop after it was carefully preserved, and a
 * report builder that cannot say *which field* was rejected is a builder nobody
 * can use.
 */

export type ReportingRequestError = Error & {
  status: number;
  errorCode?: string;
  traceId?: string;
  description?: string;
  fieldErrors?: Record<string, string[] | string>;
};

type ProxyErrorBody = {
  message?: string;
  errorCode?: string;
  traceId?: string;
  description?: string;
  fieldErrors?: Record<string, string[] | string>;
};

async function reportingRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/reporting${path}`, {
    credentials: "include",
    headers:
      init.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    ...init,
  });

  const text = await response.text();
  const body = text.trim() ? safeParse(text) : null;

  if (!response.ok) {
    const details = (body ?? {}) as ProxyErrorBody;
    const error = new Error(
      details.message || `The reporting service refused the request.`,
    ) as ReportingRequestError;

    error.status = response.status;
    error.errorCode = details.errorCode;
    error.traceId = details.traceId;
    error.description = details.description;
    error.fieldErrors = details.fieldErrors;

    throw error;
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createSavedView(input: {
  surfaceKey: string;
  name: string;
  config: Record<string, unknown>;
  visibilityScope?: string;
}) {
  return reportingRequest("/saved-views", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSavedView(savedViewId: string) {
  return reportingRequest(`/saved-views/${encodeURIComponent(savedViewId)}`, {
    method: "DELETE",
  });
}

export function addFavorite(targetKey: string) {
  return reportingRequest("/favorites", {
    method: "POST",
    body: JSON.stringify({ targetKey }),
  });
}

export function removeFavorite(targetKey: string) {
  return reportingRequest(
    `/favorites?targetKey=${encodeURIComponent(targetKey)}`,
    { method: "DELETE" },
  );
}

export function fetchBuilderFields<T>(sourceKey: string): Promise<T> {
  return reportingRequest<T>(
    `/builder-fields?sourceKey=${encodeURIComponent(sourceKey)}`,
  );
}

export function createReportDefinition<T>(
  input: Record<string, unknown>,
): Promise<T> {
  return reportingRequest<T>("/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteReportDefinition(reportId: string) {
  return reportingRequest(`/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
}

export function duplicateReportDefinition<T>(reportId: string): Promise<T> {
  return reportingRequest<T>(
    `/reports/${encodeURIComponent(reportId)}/duplicate`,
    { method: "POST" },
  );
}

/** The message to show a user, with the trace id when the API sent one. */
export function reportingErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const traced = error as ReportingRequestError;
    return traced.traceId
      ? `${error.message} (reference ${traced.traceId})`
      : error.message;
  }
  return "The reporting service could not complete that request.";
}

/*
 * ── Exports and schedules ─────────────────────────────────────────────────
 *
 * Both landed after this work package's contract was written, so the bodies
 * below are matched against `CreateReportExportDto` and
 * `CreateReportScheduleDto` field for field. `forbidNonWhitelisted` is on: one
 * surplus key is a 400, not an ignored field.
 */

/** What `POST /reporting/exports` returns. The export runs inside the request. */
export type ReportExportRun = {
  runId: string;
  status: string;
  fileName: string | null;
  contentType: string | null;
  rowCount: number | null;
  expiresAt: string | null;
};

export function createReportExport(input: {
  targetKey: string;
  format: string;
  preset?: string;
  from?: string;
  to?: string;
  filters?: unknown[];
}): Promise<ReportExportRun> {
  return reportingRequest<ReportExportRun>("/exports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Where a finished export is downloaded from.
 *
 * A plain URL rather than a fetch: the API streams the file and sets its own
 * `Content-Disposition`, and the proxy forwards those bytes untouched. Fetching
 * it into memory to build a blob URL would buy nothing and lose the filename.
 */
export function reportExportDownloadHref(runId: string): string {
  return `/api/reporting/exports/${encodeURIComponent(runId)}/download`;
}

export type ReportSchedule = {
  id: string;
  name: string;
  targetKey: string;
  reportDefinitionId: string | null;
  ownerUserId: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  hour: number;
  minute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timezone: string;
  format: string;
  periodPreset: string;
  filters: unknown;
  recipientUserIds: string[];
  isEnabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastFailureReason: string | null;
  consecutiveFailureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ReportScheduleWriteInput = {
  name: string;
  targetKey: string;
  frequency: string;
  hour: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone: string;
  format?: string;
  periodPreset: string;
  filters?: unknown[];
  recipients: string[];
  isEnabled?: boolean;
};

export type ReportDeliveryCapability = {
  canDeliver: boolean;
  providerType: string | null;
};

/**
 * Whether this workspace can actually email a scheduled report.
 *
 * A failure resolves to `canDeliver: true`, matching the server-side helper: a
 * warning that fires on any transient error would tell people their email is
 * broken whenever the network hiccups, and they would learn to ignore the one
 * time it is right.
 */
export function fetchReportDeliveryCapability(): Promise<ReportDeliveryCapability> {
  return reportingRequest<ReportDeliveryCapability>(
    "/schedules/delivery-capability",
  ).catch(() => ({ canDeliver: true, providerType: null }));
}

export function createReportSchedule(
  input: ReportScheduleWriteInput,
): Promise<ReportSchedule> {
  return reportingRequest<ReportSchedule>("/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Updating a schedule is a **full replace**, not a merge.
 *
 * `UpdateReportScheduleDto extends CreateReportScheduleDto` with nothing made
 * optional, and `ReportScheduleService.update` writes every column from the
 * input — so a partial body would silently null out whatever it omitted, and a
 * schedule quietly losing its recipients is exactly the failure this feature
 * must not have. Every caller here therefore sends the whole shape.
 */
export function updateReportSchedule(
  scheduleId: string,
  input: ReportScheduleWriteInput,
): Promise<ReportSchedule> {
  return reportingRequest<ReportSchedule>(
    `/schedules/${encodeURIComponent(scheduleId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteReportSchedule(scheduleId: string) {
  return reportingRequest(`/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
  });
}
