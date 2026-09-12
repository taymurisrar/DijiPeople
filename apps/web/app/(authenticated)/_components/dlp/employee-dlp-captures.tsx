"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useState } from "react";

/**
 * DLP captures for one employee, shown on their record (TASK-0024). This is the
 * investigator's contextual view — the same data as the standalone /dlp-review
 * page, scoped to this employee via the API's `employeeId` filter and gated by
 * `dlp.review` on the server (every content read is audited there).
 *
 * The panel gates itself: it renders nothing until it knows the viewer is
 * allowed. A 403 from the API (no `dlp.review`) hides it entirely, so an ordinary
 * viewer of the employee record never sees the section — only an authorised
 * investigator (or an elevated admin, via the guard bypass) does. That keeps the
 * gating on the server, where it belongs, rather than trusting a frontend role
 * check that would hide the panel from admins whose permission list omits the key.
 */

type DlpAlert = {
  id: string;
  ruleId: string;
  occurredAt: string;
  clipboardEventId: string | null;
  screenshotEventId: string | null;
  status: string;
};

type ClipboardCapture = {
  id: string;
  occurredAt: string;
  sourceApp: string | null;
  destinationApp: string | null;
  contentBytes: number;
  contentSha256: string;
  overCap: boolean;
  firedRuleId: string | null;
};

type ClipboardContent = {
  overCap: boolean;
  content: string | null;
};

async function fetchScoped<T>(
  path: string,
  employeeId: string,
): Promise<T[] | "denied"> {
  const res = await fetch(
    `${path}?employeeId=${encodeURIComponent(employeeId)}`,
    {
      cache: "no-store",
    },
  );
  if (res.status === 403) return "denied";
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as
    | T[]
    | { items?: T[] }
    | null;
  return Array.isArray(data) ? data : (data?.items ?? []);
}

export function EmployeeDlpCaptures({ employeeId }: { employeeId: string }) {
  const [alerts, setAlerts] = useState<DlpAlert[] | null>(null);
  const [captures, setCaptures] = useState<ClipboardCapture[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [alertList, captureList] = await Promise.all([
      fetchScoped<DlpAlert>("/api/agent/dlp/alerts", employeeId),
      fetchScoped<ClipboardCapture>(
        "/api/agent/dlp/clipboard-events",
        employeeId,
      ),
    ]);
    if (alertList === "denied" || captureList === "denied") {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    setAlerts(alertList);
    setCaptures(captureList);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Not allowed, or not yet known — render nothing so an ordinary viewer never
  // sees the section.
  if (allowed !== true) return null;

  return (
    <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Data-loss prevention captures
        </h3>
        <p className="mt-1 text-sm text-muted">
          Clipboard captures and rule-triggered screenshots recorded by the
          desktop agent for this employee. Viewing captured content is audited.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Alerts (rule triggered)
        </h4>
        {!alerts || alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No alerts for this employee.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Recent clipboard captures
        </h4>
        {!captures || captures.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No clipboard captures for this employee.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {captures.map((capture) => (
              <CaptureRow key={capture.id} capture={capture} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AlertRow({ alert }: { alert: DlpAlert }) {
  const [showShot, setShowShot] = useState(false);
  const [content, setContent] = useState<ClipboardContent | null>(null);

  const reveal = useCallback(async () => {
    if (!alert.clipboardEventId) return;
    const res = await fetch(
      `/api/agent/dlp/clipboard-events/${alert.clipboardEventId}/content`,
      { cache: "no-store" },
    );
    setContent((await res.json().catch(() => null)) as ClipboardContent | null);
  }, [alert.clipboardEventId]);

  return (
    <li className="rounded-2xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {new Date(alert.occurredAt).toLocaleString()} · rule {alert.ruleId} ·{" "}
          {alert.status}
        </p>
        <div className="flex gap-2">
          {alert.clipboardEventId ? (
            <button
              type="button"
              onClick={reveal}
              className="rounded-xl border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-strong"
            >
              View clipboard
            </button>
          ) : null}
          {alert.screenshotEventId ? (
            <button
              type="button"
              onClick={() => setShowShot((v) => !v)}
              className="rounded-xl border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-strong"
            >
              {showShot ? "Hide screenshot" : "View screenshot"}
            </button>
          ) : null}
        </div>
      </div>
      {content ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-strong p-3 text-sm text-foreground">
          {content.overCap
            ? "(content too large — stored as metadata only)"
            : (content.content ?? "(metadata only — content not captured)")}
        </pre>
      ) : null}
      {showShot && alert.screenshotEventId ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/agent/dlp/screenshots/${alert.screenshotEventId}`}
            alt="Captured screenshot"
            className="w-full"
          />
        </div>
      ) : null}
    </li>
  );
}

function CaptureRow({ capture }: { capture: ClipboardCapture }) {
  const [content, setContent] = useState<ClipboardContent | null>(null);

  const reveal = useCallback(async () => {
    const res = await fetch(
      `/api/agent/dlp/clipboard-events/${capture.id}/content`,
      { cache: "no-store" },
    );
    setContent((await res.json().catch(() => null)) as ClipboardContent | null);
  }, [capture.id]);

  return (
    <li className="rounded-2xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-xs text-muted">
          {new Date(capture.occurredAt).toLocaleString()} ·{" "}
          {capture.sourceApp ?? "unknown"} →{" "}
          {capture.destinationApp ?? "unknown"} · {capture.contentBytes} bytes
          {capture.firedRuleId ? " · triggered a rule" : ""}
        </p>
        <button
          type="button"
          onClick={reveal}
          className="rounded-xl border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-strong"
        >
          View content
        </button>
      </div>
      {content ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-strong p-3 text-sm text-foreground">
          {content.overCap
            ? "(content too large — stored as metadata only)"
            : (content.content ?? "(metadata only — content not captured)")}
        </pre>
      ) : null}
    </li>
  );
}
