"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  DECISION_PAGE_SIZE,
  DECISION_STATUS_LABELS,
  buildOpenActionsQuery,
  decisionTone,
  type OpenActionRow,
  type Page,
} from "../_lib/decisions";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { RecordPager } from "./record-pager";

/** Decisions that still have work outstanding, with each open action and its owner. */
export function OpenActionsPanel({
  onOpen,
  people,
  reloadKey,
}: {
  onOpen: (id: string) => void;
  people: readonly PersonOption[];
  reloadKey: number;
}) {
  const [skip, setSkip] = useState(0);
  const [page, setPage] = useState<Page<OpenActionRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextSkip: number) => {
    setLoading(true);
    setError(null);
    try {
      setPage(
        await workRequest<Page<OpenActionRow>>(
          "work-decisions",
          `/open-actions?${buildOpenActionsQuery(nextSkip)}`,
        ),
      );
      setSkip(nextSkip);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load, reloadKey]);

  return (
    <section aria-label="Open actions" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-busy={loading}>
      {error ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <div>
            <Button onClick={() => void load(skip)} variant="secondary">
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      {!page && loading ? (
        <div
          aria-busy="true"
          aria-label="Loading open actions"
          className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
          role="status"
        />
      ) : null}
      {page && page.items.length === 0 ? (
        <EmptyState description="Every action is done." title="No open actions" />
      ) : null}
      {page && page.items.length > 0 ? (
        <ul aria-label="Decisions with open actions" className="grid gap-3">
          {page.items.map((row) => (
            <li className="grid gap-3 rounded-2xl border border-border p-4" key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  className="text-left text-sm font-semibold text-accent underline"
                  onClick={() => onOpen(row.id)}
                  type="button"
                >
                  {row.title}
                </button>
                <StatusPill tone={decisionTone(row.status)}>
                  {DECISION_STATUS_LABELS[row.status]}
                </StatusPill>
              </div>
              <ul aria-label={`Open actions of ${row.title}`} className="grid gap-2">
                {row.openActions.map((action) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    key={action.workItemId}
                  >
                    <span className="break-words text-foreground">{action.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-muted">
                      <span>{personLabel(people, action.ownerEmployeeId)}</span>
                      {action.dueAt ? (
                        <span>{`Due ${formatDateTime(action.dueAt)}`}</span>
                      ) : null}
                      {action.overdue ? (
                        <StatusPill tone="danger">Overdue</StatusPill>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {page ? (
        <RecordPager
          disabled={loading}
          label="Open actions"
          onSkip={(next) => void load(next)}
          pageSize={DECISION_PAGE_SIZE}
          shown={page.items.length}
          skip={skip}
          total={page.total}
        />
      ) : null}
    </section>
  );
}
