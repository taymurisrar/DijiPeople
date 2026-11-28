"use client";

import { Button } from "@/app/components/ui/button";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  DECISION_STATUS_LABELS,
  chainEntries,
  decisionTone,
  type DecisionDetail,
} from "../_lib/decisions";

/**
 * The line of decisions this one belongs to, oldest first. A step the caller may
 * not see is shown as "Not visible" in its place, so the chain never reads as
 * shorter than it is. Every visible step is a button that opens that decision.
 */
export function DecisionChain({
  detail,
  onOpen,
}: {
  detail: DecisionDetail;
  onOpen: (id: string) => void;
}) {
  const entries = chainEntries(detail);
  return (
    <ol aria-label="Decision chain" className="grid gap-2">
      {entries.map((entry, index) =>
        entry.kind === "hidden" ? (
          <li
            className="rounded-xl border border-dashed border-border p-3 text-sm text-muted"
            key={`hidden-${index}`}
          >
            Not visible
          </li>
        ) : (
          <li
            aria-current={entry.current ? "step" : undefined}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
              entry.current ? "border-accent bg-accent-soft/40" : "border-border"
            }`}
            key={entry.decision.id}
          >
            <div className="grid min-w-0 gap-1">
              <span className="break-words text-sm font-medium text-foreground">
                {entry.decision.title}
              </span>
              <span className="break-words text-xs text-muted">
                {entry.decision.decision}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={decisionTone(entry.decision.status)}>
                {DECISION_STATUS_LABELS[entry.decision.status]}
              </StatusPill>
              {entry.current ? null : (
                <Button
                  aria-label={`Open ${entry.decision.title}`}
                  onClick={() => onOpen(entry.decision.id)}
                  size="xs"
                  variant="outline"
                >
                  Open
                </Button>
              )}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}
