"use client";

import { Button } from "@/app/components/ui/button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import { openBlockerCountLabel } from "../../../work/_lib/blockers";
import {
  BOARD_COLUMNS,
  groupByColumn,
} from "../../../work/_lib/project-work";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  allowedTransitions,
  priorityTone,
  statusTone,
  type WorkItem,
} from "../../../work/_lib/work-items";

/**
 * Work items in their status columns. A card moves by its buttons, which offer
 * only the moves the lifecycle allows; the API re-checks every move and its
 * refusal is shown by the caller. Cards carry text for status and priority.
 */
export function WorkBoard({
  blockerCounts = {},
  busyId,
  canWrite,
  items,
  onMove,
  onOpen,
}: {
  /** Open blockers per work item id; a card with some says so in text. */
  blockerCounts?: Record<string, number>;
  busyId: string | null;
  canWrite: boolean;
  items: WorkItem[];
  onMove: (item: WorkItem, to: WorkItem["status"]) => void;
  onOpen: (item: WorkItem) => void;
}) {
  const grouped = groupByColumn(items);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {BOARD_COLUMNS.map((column) => (
        <section
          aria-label={`${STATUS_LABELS[column]} column`}
          className="rounded-[20px] border border-border bg-surface-strong/40 p-3"
          key={column}
        >
          <h3 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold text-foreground">
            <span>{STATUS_LABELS[column]}</span>
            <span className="text-xs text-muted">{grouped[column].length}</span>
          </h3>
          <ul className="grid gap-3">
            {grouped[column].length === 0 ? (
              <li className="px-1 py-4 text-center text-xs text-muted">
                Nothing here
              </li>
            ) : null}
            {grouped[column].map((item) => (
              <li
                className="grid gap-2 rounded-2xl border border-border bg-white p-3 shadow-sm"
                key={item.id}
              >
                <button
                  aria-label={`Open ${item.title}`}
                  className="text-left text-sm font-medium text-foreground hover:underline"
                  onClick={() => onOpen(item)}
                  type="button"
                >
                  {item.title}
                </button>
                <p className="text-xs text-muted">
                  {item.ownerName ? item.ownerName : "Unassigned"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={priorityTone(item.priority)}>
                    {PRIORITY_LABELS[item.priority] ?? item.priority}
                  </StatusPill>
                  <StatusPill tone={statusTone(item.status)}>
                    {STATUS_LABELS[item.status]}
                  </StatusPill>
                  {item.dueAt ? (
                    <span className="text-xs text-muted">{`Due ${formatDate(item.dueAt)}`}</span>
                  ) : null}
                </div>
                {blockerCounts[item.id] ? (
                  <p className="text-xs font-medium text-danger">
                    {openBlockerCountLabel(blockerCounts[item.id])}
                  </p>
                ) : null}
                {canWrite ? (
                  <div className="flex flex-wrap gap-1.5">
                    {allowedTransitions(item.status).map((action) => (
                      <Button
                        aria-label={`${action.label}: ${item.title}`}
                        disabled={busyId !== null}
                        key={action.to}
                        loading={busyId === item.id}
                        onClick={() => onMove(item, action.to)}
                        size="xs"
                        variant={action.variant}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
