"use client";

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

export default function DlpReviewPage() {
  const [alerts, setAlerts] = useState<DlpAlert[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/agent/dlp/alerts", { cache: "no-store" });
      if (!active) return;
      if (res.status === 403) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | DlpAlert[]
        | { items?: DlpAlert[] }
        | null;
      setAlerts(Array.isArray(data) ? data : (data?.items ?? []));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

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
