"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot loading cascade is intended */

import { useCallback, useEffect, useState } from "react";

/**
 * Investigator review of desktop-agent DLP captures (TASK-0020). Gated by the
 * `dlp.review` permission on the API — this page only renders what the API
 * returns, and every clipboard-content or screenshot read is audited server-side.
 * A viewer without the permission gets a 403 and the access-denied state below.
 */

type DlpAlert = {
  id: string;
  employeeId: string;
  ruleId: string;
  occurredAt: string;
  clipboardEventId: string | null;
  screenshotEventId: string | null;
  status: string;
};

type ClipboardContent = {
  id: string;
  employeeId: string;
  occurredAt: string;
  sourceApp: string | null;
  destinationApp: string | null;
  contentBytes: number;
  contentSha256: string;
  overCap: boolean;
  content: string | null;
};

type ClipboardCapture = {
  id: string;
  employeeId: string;
  occurredAt: string;
  sourceApp: string | null;
  destinationApp: string | null;
  contentBytes: number;
  contentSha256: string;
  overCap: boolean;
  firedRuleId: string | null;
};

async function fetchList<T>(path: string): Promise<T[] | "denied"> {
  const res = await fetch(path, { cache: "no-store" });
  if (res.status === 403) return "denied";
  const data = (await res.json().catch(() => null)) as
    | T[]
    | { items?: T[] }
    | null;
  return Array.isArray(data) ? data : (data?.items ?? []);
}

export default function DlpReviewPage() {
  const [alerts, setAlerts] = useState<DlpAlert[] | null>(null);
  const [captures, setCaptures] = useState<ClipboardCapture[] | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const [alertList, captureList] = await Promise.all([
      fetchList<DlpAlert>("/api/agent/dlp/alerts"),
      fetchList<ClipboardCapture>("/api/agent/dlp/clipboard-events"),
    ]);
    if (alertList === "denied" || captureList === "denied") {
      setDenied(true);
      return;
    }
    setAlerts(alertList);
    setCaptures(captureList);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Loading is derived, not a separate state — avoids a true->false set in the
  // effect that reads as a cascading render.
  const loading = !denied && alerts === null && captures === null;

  if (loading) {
    return <p className="p-8 text-sm text-muted">Loading DLP alerts…</p>;
  }

  if (denied) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold text-foreground">DLP review</h1>
        <p className="mt-2 text-sm text-muted">
          You do not have permission to review captured content. This requires
          the <code>dlp.review</code> permission.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-6 md:p-8">
      <header>
        <h1 className="text-lg font-semibold text-foreground">DLP review</h1>
        <p className="mt-1 text-sm text-muted">
          Data-loss alerts from the desktop agent. Viewing captured content is
          audited.
        </p>
      </header>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Alerts (rule triggered)
        </h2>
        {!alerts || alerts.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            No DLP alerts have been recorded.
          </p>
        ) : (
          <ul className="grid gap-3">
            {alerts.map((alert) => (
              <DlpAlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Recent clipboard captures
        </h2>
        {!captures || captures.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            No clipboard captures have been recorded.
          </p>
        ) : (
          <ul className="grid gap-3">
            {captures.map((capture) => (
              <ClipboardCaptureRow key={capture.id} capture={capture} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DlpAlertRow({ alert }: { alert: DlpAlert }) {
  const [content, setContent] = useState<ClipboardContent | null>(null);
  const [showShot, setShowShot] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);

  const revealContent = useCallback(async () => {
    if (!alert.clipboardEventId) return;
    setLoadingContent(true);
    const res = await fetch(
      `/api/agent/dlp/clipboard-events/${alert.clipboardEventId}/content`,
      { cache: "no-store" },
    );
    const data = (await res
      .json()
      .catch(() => null)) as ClipboardContent | null;
    setContent(data);
    setLoadingContent(false);
  }, [alert.clipboardEventId]);

  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Employee {alert.employeeId}
          </p>
          <p className="text-xs text-muted">
            {new Date(alert.occurredAt).toLocaleString()} · rule {alert.ruleId}{" "}
            · {alert.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {alert.clipboardEventId ? (
            <button
              type="button"
              onClick={revealContent}
              className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-strong"
            >
              {loadingContent ? "Loading…" : "View clipboard content"}
            </button>
          ) : null}
          {alert.screenshotEventId ? (
            <button
              type="button"
              onClick={() => setShowShot((v) => !v)}
              className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-strong"
            >
              {showShot ? "Hide screenshot" : "View screenshot"}
            </button>
          ) : null}
        </div>
      </div>

      {content ? (
        <div className="mt-4 rounded-xl bg-surface-strong p-4">
          <p className="text-xs text-muted">
            {content.sourceApp ?? "unknown"} →{" "}
            {content.destinationApp ?? "unknown"} · {content.contentBytes} bytes
            · sha256 {content.contentSha256.slice(0, 12)}…
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
            {content.overCap
              ? "(content too large — stored as metadata only)"
              : (content.content ?? "(metadata only — content not captured)")}
          </pre>
        </div>
      ) : null}

      {showShot && alert.screenshotEventId ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
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

function ClipboardCaptureRow({ capture }: { capture: ClipboardCapture }) {
  const [content, setContent] = useState<ClipboardContent | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/agent/dlp/clipboard-events/${capture.id}/content`,
      { cache: "no-store" },
    );
    const data = (await res
      .json()
      .catch(() => null)) as ClipboardContent | null;
    setContent(data);
    setLoading(false);
  }, [capture.id]);

  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Employee {capture.employeeId}
            {capture.firedRuleId ? (
              <span className="ml-2 text-xs text-muted">
                (rule {capture.firedRuleId})
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted">
            {new Date(capture.occurredAt).toLocaleString()} ·{" "}
            {capture.sourceApp ?? "unknown"} →{" "}
            {capture.destinationApp ?? "unknown"} · {capture.contentBytes} bytes
          </p>
        </div>
        <button
          type="button"
          onClick={reveal}
          className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-strong"
        >
          {loading ? "Loading…" : "View content"}
        </button>
      </div>

      {content ? (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-strong p-4 text-sm text-foreground">
          {content.overCap
            ? "(content too large — stored as metadata only)"
            : (content.content ?? "(metadata only — content not captured)")}
        </pre>
      ) : null}
    </li>
  );
}
