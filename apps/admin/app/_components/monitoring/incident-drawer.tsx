"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  ChevronRight,
  LifeBuoy,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDateTime } from "@/lib/platform-formatters";
import {
  SUPPORT_STATUS_OPTIONS,
  SUPPORT_TEAMS,
  formatPayload,
  formatSourceApp,
  titleCase,
} from "@/lib/error-log-console";
import type {
  PlatformErrorEvent,
  SupportOwnerOption,
} from "./error-logs-table";
import {
  CopyReference,
  Field,
  SeverityBadge,
  SupportStatusBadge,
} from "./monitoring-ui";

/**
 * One incident, for a person investigating it.
 *
 * Everything here comes from `GET /platform/logs/events/:traceId`, which
 * re-runs the error-log sanitizer on read — tokens, passwords, cookies,
 * authorization values and card/bank identifiers are redacted server-side
 * before any of it reaches this component. Nothing is redacted here, because a
 * browser-side redaction would mean the secret had already been sent.
 *
 * Fetched when opened rather than shipped with the list: the stack and the
 * related rows are heavy and only one incident is ever being read.
 */

type IncidentDetail = PlatformErrorEvent & {
  requestedReference?: string;
  fullMessage: string;
  description: string | null;
  stack: string | null;
  cause: unknown;
  details: unknown;
  request: {
    method: string | null;
    path: string | null;
    params: unknown;
    query: unknown;
    body: unknown;
    ipAddress: string | null;
  };
  client: { userAgent: string | null };
  context: {
    userId: string | null;
    tenantId: string | null;
    organizationId: string | null;
    organizationName?: string | null;
    businessUnitId: string | null;
    businessUnitName?: string | null;
    platformActor: {
      id: string;
      email: string | null;
      role: string | null;
    } | null;
  };
  relatedOccurrences: Array<{ traceId: string; occurredAt: string }>;
  relatedAuditEvents: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    sourceModule: string | null;
    createdAt: string;
    scope: "tenant" | "platform";
  }>;
  relatedOutboxEvents: Array<{
    id: string;
    eventType: string;
    status: string;
    attemptCount: number;
    lastError: string | null;
    createdAt: string;
  }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: IncidentDetail };

export function IncidentDrawer({
  reference,
  assignees,
  canManage,
  onClose,
  onUpdated,
}: {
  reference: string;
  assignees: SupportOwnerOption[];
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /* Bumped to fetch again: after a save, or from the error state's Retry. */
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    // The component is keyed by reference at the call site, so a new incident
    // remounts it and starts from "loading" without a synchronous reset here.
    let cancelled = false;
    void fetchIncident(reference).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [reference, reloadKey]);

  /*
   * A modal: focus moves in, Tab stays in, Escape closes, and focus returns to
   * the row that opened it. The same contract as `PanelDialog`, which is too
   * narrow (max-w-md) for a stack trace.
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  const detail = state.status === "ready" ? state.detail : null;

  return (
    <div
      aria-label={detail ? `Incident ${detail.referenceNumber}` : "Incident"}
      aria-modal="true"
      className="fixed inset-0 z-[110] flex justify-end bg-slate-950/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl outline-none"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Error incident
            </p>
            {detail ? (
              <>
                <h2 className="mt-1 line-clamp-2 break-words text-base font-semibold text-slate-950">
                  {firstLine(detail.fullMessage)}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SeverityBadge
                    group={detail.severityGroup}
                    severity={detail.severity}
                  />
                  <SupportStatusBadge value={detail.status} />
                  <CopyReference value={detail.referenceNumber} />
                </div>
              </>
            ) : (
              <p className="mt-1 font-mono text-xs text-slate-600">
                {reference}
              </p>
            )}
          </div>
          <button
            aria-label="Close incident"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.status === "loading" ? <DrawerSkeleton /> : null}
          {state.status === "error" ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              role="alert"
            >
              <p>{state.message}</p>
              <button
                className="mt-3 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                onClick={() => {
                  setState({ status: "loading" });
                  reload();
                }}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {detail ? (
            <IncidentBody
              assignees={assignees}
              canManage={canManage}
              detail={detail}
              onSaved={() => {
                reload();
                onUpdated();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IncidentBody({
  detail,
  assignees,
  canManage,
  onSaved,
}: {
  detail: IncidentDetail;
  assignees: SupportOwnerOption[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const { defaults } = usePlatformDefaults();
  const when = (value: string | null | undefined) =>
    value ? formatPlatformDateTime(value, defaults) : "—";
  const request = [detail.request.method, detail.request.path]
    .filter(Boolean)
    .join(" ");
  const tenant = detail.tenant;
  const user = detail.user;
  const params = formatPayload(detail.request.params);
  const query = formatPayload(detail.request.query);
  const body = formatPayload(detail.request.body);
  const details = formatPayload(detail.details);
  const cause = formatPayload(detail.cause);
  const openedByOccurrence =
    detail.requestedReference &&
    detail.requestedReference !== detail.referenceNumber;

  return (
    <div className="space-y-5">
      {openedByOccurrence ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Opened from occurrence{" "}
          <span className="font-mono">{detail.requestedReference}</span>. This
          incident groups every occurrence of the same failure.
        </p>
      ) : null}

      <Section title="Summary">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Last seen">{when(detail.lastSeenAt)}</Field>
          <Field label="First seen">{when(detail.firstSeenAt)}</Field>
          <Field label="Occurrences">
            {detail.occurrenceCount.toLocaleString()}
          </Field>
          <Field label="Error code" mono>
            {detail.category}
          </Field>
          <Field label="HTTP status">{detail.statusCode}</Field>
          <Field label="Module">{detail.module ?? "—"}</Field>
          <Field label="Application">{formatSourceApp(detail.sourceApp)}</Field>
          <Field label="Environment">{titleCase(detail.environment)}</Field>
          <Field label="Reference" mono>
            {detail.referenceNumber}
          </Field>
        </dl>
      </Section>

      <Section title="What happened">
        <p className="whitespace-pre-wrap break-words text-sm text-slate-900">
          {detail.fullMessage}
        </p>
        {detail.description && detail.description !== detail.fullMessage ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
            {detail.description}
          </p>
        ) : null}
      </Section>

      <Section title="Request">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Method and route" mono wide>
            {request || "Not an API request (reported by the browser)"}
          </Field>
          <Field label="IP address" mono>
            {detail.request.ipAddress ?? "—"}
          </Field>
          <Field label="Browser">{detail.client.userAgent ?? "—"}</Field>
        </dl>
        <Payload label="Route parameters" value={params} />
        <Payload label="Query" value={query} />
        <Payload label="Body" value={body} />
      </Section>

      <Section title="Who was affected">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Tenant">
            {tenant ? (
              <Link
                className="font-medium text-[var(--admin-primary)] hover:underline"
                href={`/tenants/${encodeURIComponent(tenant.id)}`}
              >
                {tenant.name}
              </Link>
            ) : (
              "Platform (no tenant)"
            )}
          </Field>
          <Field label="User">
            {user ? (
              <>
                {user.fullName || user.email}
                <span className="block text-xs text-slate-500">
                  {user.email}
                  {user.source === "platform-admin"
                    ? ` · platform ${titleCase(user.role ?? "user")}`
                    : ""}
                </span>
              </>
            ) : (
              "No signed-in user"
            )}
          </Field>
          <Field label="Organization">
            {detail.context.organizationName ??
              (detail.context.organizationId ? "Unknown organization" : "—")}
          </Field>
          <Field label="Business unit">
            {detail.context.businessUnitName ??
              (detail.context.businessUnitId ? "Unknown business unit" : "—")}
          </Field>
        </dl>
      </Section>

      <Section title="Diagnostics">
        <Collapsible
          defaultOpen={Boolean(detail.stack)}
          label="Stack trace"
          value={detail.stack}
          empty="No stack trace was captured for this incident."
        />
        {details ? <Collapsible label="Details" value={details} /> : null}
        {cause ? <Collapsible label="Cause" value={cause} /> : null}
      </Section>

      <Related detail={detail} when={when} />

      <TriagePanel
        assignees={assignees}
        canManage={canManage}
        detail={detail}
        onSaved={onSaved}
      />
    </div>
  );
}

function Related({
  detail,
  when,
}: {
  detail: IncidentDetail;
  when: (value: string) => string;
}) {
  const { relatedOccurrences, relatedAuditEvents, relatedOutboxEvents } =
    detail;
  if (
    !relatedOccurrences.length &&
    !relatedAuditEvents.length &&
    !relatedOutboxEvents.length
  ) {
    return null;
  }
  return (
    <Section title="Related">
      {relatedOccurrences.length ? (
        <RelatedList label="Recent occurrences">
          {relatedOccurrences.map((occurrence) => (
            <li className="flex items-center gap-3" key={occurrence.traceId}>
              <span className="w-40 shrink-0 text-slate-500">
                {when(occurrence.occurredAt)}
              </span>
              <CopyReference value={occurrence.traceId} />
            </li>
          ))}
        </RelatedList>
      ) : null}
      {relatedAuditEvents.length ? (
        <RelatedList label="Audit rows written by this request">
          {relatedAuditEvents.map((event) => (
            <li className="flex flex-wrap items-center gap-x-3" key={event.id}>
              <span className="w-40 shrink-0 text-slate-500">
                {when(event.createdAt)}
              </span>
              <span className="text-slate-800">
                {event.action} · {event.entityType}
              </span>
              {/*
                BUG-3564. A platform-scope row links to the audit trail
                filtered by this incident's own trace id — the id these rows
                were queried by — not to a per-record route, which does not
                exist under settings/monitoring (the BUG-1419 shape). A
                tenant-scope row lives in that tenant's own trail, which this
                app has no screen for.
              */}
              {event.scope === "platform" ? (
                <Link
                  className="font-medium text-[var(--admin-primary)] hover:underline"
                  href={`/settings/monitoring/audit-logs?traceId=${encodeURIComponent(detail.referenceNumber)}`}
                >
                  View in audit trail
                </Link>
              ) : (
                <span className="text-slate-500">Tenant audit</span>
              )}
            </li>
          ))}
        </RelatedList>
      ) : null}
      {relatedOutboxEvents.length ? (
        <RelatedList label="Background jobs with this correlation id">
          {relatedOutboxEvents.map((event) => (
            <li key={event.id}>
              <span className="text-slate-800">{event.eventType}</span>
              <span className="text-slate-500">
                {" "}
                · {titleCase(event.status)} · attempt {event.attemptCount}
              </span>
              {event.lastError ? (
                <span className="block break-words font-mono text-[11px] text-rose-700">
                  {event.lastError}
                </span>
              ) : null}
            </li>
          ))}
        </RelatedList>
      ) : null}
    </Section>
  );
}

/**
 * Resolution and ownership. `PATCH /platform/logs/events/:traceId` replaces
 * the whole support record — an omitted note or owner is written as empty —
 * so every save, including the one-click Resolve and Reopen, sends the
 * complete current state rather than only the field that changed.
 */
function TriagePanel({
  detail,
  assignees,
  canManage,
  onSaved,
}: {
  detail: IncidentDetail;
  assignees: SupportOwnerOption[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const { defaults } = usePlatformDefaults();
  const initialAssignment =
    detail.assignedToUser?.id ??
    (SUPPORT_TEAMS.includes(detail.assignedTo as (typeof SUPPORT_TEAMS)[number])
      ? `team:${detail.assignedTo}`
      : "");
  const [status, setStatus] = useState(detail.status);
  const [assignment, setAssignment] = useState(initialAssignment);
  const [internalNote, setInternalNote] = useState(detail.internalNote ?? "");
  const [customerUpdate, setCustomerUpdate] = useState(
    detail.customerUpdate ?? "",
  );
  const [busy, setBusy] = useState<"save" | "case" | null>(null);
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: ReactNode;
  } | null>(null);
  const isResolved = detail.status === "RESOLVED";

  async function save(nextStatus: string) {
    setBusy("save");
    setNotice(null);
    try {
      const response = await fetch(
        `/api/platform/logs/events/${encodeURIComponent(detail.referenceNumber)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supportStatus: nextStatus,
            assignedToUserId: assignment.startsWith("team:") ? "" : assignment,
            assignedTeam: assignment.startsWith("team:")
              ? assignment.slice(5)
              : "",
            internalNote,
            customerUpdate,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setNotice({
          tone: "error",
          text: payload?.message ?? "The incident could not be updated.",
        });
        return;
      }
      setStatus(nextStatus);
      setNotice({ tone: "ok", text: "Incident updated." });
      onSaved();
    } catch {
      setNotice({ tone: "error", text: "The incident could not be updated." });
    } finally {
      setBusy(null);
    }
  }

  async function createSupportCase() {
    if (!detail.incidentId) return;
    setBusy("case");
    setNotice(null);
    try {
      const response = await fetch(
        `/api/support-cases/from-incident/${encodeURIComponent(detail.incidentId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        caseNumber?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.id) {
        setNotice({
          tone: "error",
          text:
            payload?.message ??
            "A support case could not be created from this incident.",
        });
        return;
      }
      setNotice({
        tone: "ok",
        text: (
          <>
            Support case{" "}
            <Link
              className="font-semibold underline"
              href={`/support/cases/${encodeURIComponent(payload.id)}`}
            >
              {payload.caseNumber ?? "opened"}
            </Link>{" "}
            is linked to this incident.
          </>
        ),
      });
    } catch {
      setNotice({
        tone: "error",
        text: "A support case could not be created from this incident.",
      });
    } finally {
      setBusy(null);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <Section title="Resolution">
      <dl className="mb-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <Field label="Owner">
          {detail.assignedToUser?.fullName || detail.assignedTo || "Unassigned"}
        </Field>
        <Field label="Resolved">
          {detail.resolvedAt
            ? formatPlatformDateTime(detail.resolvedAt, defaults)
            : "—"}
        </Field>
        <Field label="Last updated">
          {formatPlatformDateTime(detail.updatedAt, defaults)}
        </Field>
      </dl>

      {canManage ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Status
              </span>
              <select
                className={`h-9 ${inputClass}`}
                onChange={(event) => setStatus(event.target.value)}
                value={status}
              >
                {SUPPORT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Owner
              </span>
              <select
                className={`h-9 ${inputClass}`}
                onChange={(event) => setAssignment(event.target.value)}
                value={assignment}
              >
                <option value="">Unassigned</option>
                <optgroup label="Teams">
                  {SUPPORT_TEAMS.map((team) => (
                    <option key={team} value={`team:${team}`}>
                      {team}
                    </option>
                  ))}
                </optgroup>
                {assignees.length ? (
                  <optgroup label="Platform users">
                    {assignees.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.fullName || owner.email} ·{" "}
                        {titleCase(owner.role)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Internal note
            </span>
            <textarea
              className={`py-2 ${inputClass}`}
              maxLength={4000}
              onChange={(event) => setInternalNote(event.target.value)}
              rows={3}
              value={internalNote}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Customer update
            </span>
            <textarea
              className={`py-2 ${inputClass}`}
              maxLength={4000}
              onChange={(event) => setCustomerUpdate(event.target.value)}
              rows={3}
              value={customerUpdate}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={busy !== null || !detail.incidentId}
              onClick={() => void createSupportCase()}
              type="button"
            >
              {busy === "case" ? (
                <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <LifeBuoy aria-hidden className="h-4 w-4" />
              )}
              Create support case
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {isResolved ? (
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={() => void save("INVESTIGATING")}
                  type="button"
                >
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  Reopen
                </button>
              ) : (
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={() => void save("RESOLVED")}
                  type="button"
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  Mark resolved
                </button>
              )}
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--admin-primary)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                disabled={busy !== null}
                onClick={() => void save(status)}
                type="button"
              >
                {busy === "save" ? (
                  <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
                ) : null}
                Save
              </button>
            </div>
          </div>
          {notice ? (
            <p
              className={`text-xs ${notice.tone === "error" ? "text-rose-700" : "text-emerald-700"}`}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {detail.internalNote ? (
            <Payload label="Internal note" value={detail.internalNote} />
          ) : null}
          {detail.customerUpdate ? (
            <Payload label="Customer update" value={detail.customerUpdate} />
          ) : null}
          <p className="text-xs text-slate-500">
            Your role can read incidents but not change their status.
          </p>
        </>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Payload({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-800">
        {value}
      </pre>
    </div>
  );
}

function Collapsible({
  label,
  value,
  empty,
  defaultOpen = false,
}: {
  label: string;
  value: string | null;
  empty?: string;
  defaultOpen?: boolean;
}) {
  if (!value) {
    return empty ? <p className="text-sm text-slate-500">{empty}</p> : null;
  }
  return (
    <details className="group mt-2 first:mt-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-slate-800">
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-slate-400 transition group-open:rotate-90"
        />
        {label}
      </summary>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {value}
      </pre>
    </details>
  );
}

function RelatedList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <ul className="mt-1 space-y-1.5 text-xs">{children}</ul>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading incident" className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="space-y-2" key={index}>
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

async function fetchIncident(reference: string): Promise<LoadState> {
  try {
    const response = await fetch(
      `/api/platform/logs/events/${encodeURIComponent(reference)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | (IncidentDetail & { message?: string })
      | null;
    if (!response.ok || !payload) {
      return {
        status: "error",
        message:
          response.status === 404
            ? "No incident has this reference. It may have been removed by the retention policy."
            : (payload?.message ??
              `The incident could not be loaded (${response.status}).`),
      };
    }
    return { status: "ready", detail: payload };
  } catch {
    return {
      status: "error",
      message: "The incident could not be loaded. Check your connection.",
    };
  }
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0] ?? value;
}
