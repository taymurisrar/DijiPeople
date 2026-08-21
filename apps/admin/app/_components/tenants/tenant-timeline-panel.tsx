"use client";

import { useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { describePage } from "@/lib/list-paging";
import {
  PanelButton,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  relativeTime,
} from "./tenant-panel-ui";
import {
  useTenantResource,
  type TenantTimelineItem,
} from "./tenant-control-plane.client";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "NOTES", label: "Notes" },
  { key: "ACCESS", label: "Access" },
  { key: "COMMERCIAL", label: "Commercial" },
  { key: "MODULES", label: "Modules" },
  { key: "APPS", label: "Apps" },
  { key: "PROVISIONING", label: "Provisioning" },
  { key: "OPERATIONS", label: "Operations" },
  { key: "SYSTEM", label: "System" },
];

/**
 * Entries per page.
 *
 * The panel used to render every row the endpoint returned — 154 on a tenant a
 * few weeks old, and it only grows. An unbounded list has no bottom, so
 * "Modules" and "Provisioning" sat below a scroll nobody reached, and there was
 * no number anywhere saying how much history there even was.
 *
 * Twenty-five is a screenful and a half at this row height: enough that most
 * questions are answered without paging, few enough that the panel below the
 * timeline stays reachable.
 */
const PAGE_SIZE = 25;

/**
 * Timeline — readable operational history, not the compliance audit log.
 *
 * Each entry is a sentence about something that happened to this tenant. The
 * underlying audit rows keep the full before/after snapshots for compliance;
 * this view deliberately never renders them, because a JSON blob in a history
 * feed is not history anyone can read.
 */
export function TenantTimelinePanel({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload } = useTenantResource<{
    items: TenantTimelineItem[];
  }>(tenantId, "/timeline");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return filter === "ALL"
      ? all
      : all.filter((item) => item.category === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.items ?? []) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const total = items.length;
  /*
   * `describePage` clamps rather than correcting state. Filtering to a category
   * with two entries while on page 4, or reloading after entries were removed,
   * would otherwise leave the panel showing an empty slice of a list that
   * plainly has rows in it — and fixing it from an effect means one render where
   * exactly that is on screen.
   */
  const pageWindow = describePage(total, page, PAGE_SIZE);
  const pageItems = items.slice(pageWindow.start, pageWindow.end);

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    setNoteError(null);
    try {
      await fetch(
        `/api/platform-runtime/tenants/${encodeURIComponent(tenantId)}/timeline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityType: "NOTE",
            message: note.trim(),
          }),
        },
      ).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              "Unable to add the note.",
          );
        }
      });
      setNote("");
      reload();
    } catch (reason) {
      setNoteError(
        reason instanceof Error ? reason.message : "Unable to add the note.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard
      title="Timeline"
      description="What has happened to this tenant, newest first."
      actions={<PanelButton onClick={reload}>Refresh</PanelButton>}
    >
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row">
        <input
          aria-label="Add a business note to the tenant timeline"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a business note"
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        />
        <PanelButton
          variant="primary"
          busy={busy}
          disabled={!note.trim()}
          onClick={() => void addNote()}
        >
          Add note
        </PanelButton>
      </div>
      {noteError ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {noteError}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Timeline categories"
        className="mt-4 flex flex-wrap gap-1.5"
      >
        {FILTERS.map((entry) => {
          const count =
            entry.key === "ALL"
              ? (data?.items.length ?? 0)
              : (counts.get(entry.key) ?? 0);
          return (
            <button
              key={entry.key}
              role="tab"
              type="button"
              aria-selected={filter === entry.key}
              onClick={() => {
                setFilter(entry.key);
                // A new filter is a new list; keeping the page number would
                // land on a page that means nothing in it.
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === entry.key
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {entry.label}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <PanelLoading label="the tenant timeline" />
        ) : error && !data ? (
          <PanelError message={error} onRetry={reload} />
        ) : total ? (
          <>
            {/*
              How much history there is, and which part of it is on screen. The
              category chips already carry per-category counts; what was missing
              was the one number that says whether you are looking at all of it.
            */}
            <p
              aria-live="polite"
              className="mb-2 text-xs font-medium text-slate-500"
            >
              Showing {pageWindow.firstShown}–{pageWindow.lastShown} of {total}{" "}
              {total === 1 ? "entry" : "entries"}
              {filter === "ALL" ? "" : " in this category"}
            </p>
            <ol className="divide-y divide-slate-100">
              {pageItems.map((item) => (
                <li key={`${item.source}-${item.id}`} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {item.actionLabel}
                    </p>
                    <p
                      className="text-xs text-slate-500"
                      title={formatDateTime(item.occurredAt)}
                    >
                      {relativeTime(item.occurredAt)}
                    </p>
                  </div>
                  {item.message ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {item.message}
                    </p>
                  ) : null}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock3 className="h-3 w-3" aria-hidden />
                    {item.actorName}
                    {item.entityType ? ` · ${item.entityType}` : ""}
                  </p>
                </li>
              ))}
            </ol>
            {pageWindow.pageCount > 1 ? (
              <nav
                aria-label="Timeline pages"
                className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3"
              >
                <p className="text-xs font-medium text-slate-600">
                  Page {pageWindow.page} of {pageWindow.pageCount}
                </p>
                <div className="flex gap-2">
                  <PanelButton
                    disabled={pageWindow.page <= 1}
                    onClick={() => setPage(pageWindow.page - 1)}
                  >
                    Previous
                  </PanelButton>
                  <PanelButton
                    disabled={pageWindow.page >= pageWindow.pageCount}
                    onClick={() => setPage(pageWindow.page + 1)}
                  >
                    Next
                  </PanelButton>
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <PanelEmptyState
            title={
              filter === "ALL"
                ? "Nothing has been recorded for this tenant yet."
                : "No activity in this category."
            }
            description={
              filter === "ALL"
                ? "Lifecycle changes, access management, module overrides and provisioning all appear here as they happen."
                : "Switch to All to see everything recorded for this tenant."
            }
          />
        )}
      </div>
    </PanelCard>
  );
}
