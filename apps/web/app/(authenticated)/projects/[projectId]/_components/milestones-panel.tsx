"use client";

import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import { ProgressBar } from "../../../work/_components/summary-tile";
import {
  percentDoneLabel,
  type ProgressMilestone,
} from "../../../work/_lib/project-work";
import { STATUS_LABELS, statusTone } from "../../../work/_lib/work-items";

/** Milestones with how far their tasks are, and an overdue pill when one has slipped. */
export function MilestonesPanel({
  canWrite,
  milestones,
  onCreate,
}: {
  canWrite: boolean;
  milestones: ProgressMilestone[];
  onCreate: () => void;
}) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        action={
          canWrite ? <Button onClick={onCreate}>New milestone</Button> : undefined
        }
        description="Milestones group a project's tasks and show how far each group has come."
        title="No milestones yet"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={onCreate}>
            New milestone
          </Button>
        </div>
      ) : null}
      <ul aria-label="Milestones" className="grid gap-3">
        {milestones.map((milestone) => (
          <li
            className="grid gap-2 rounded-2xl border border-border bg-white p-4"
            key={milestone.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {milestone.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={statusTone(milestone.status)}>
                  {STATUS_LABELS[milestone.status] ?? milestone.status}
                </StatusPill>
                {milestone.overdue ? (
                  <StatusPill tone="danger">Overdue</StatusPill>
                ) : null}
              </div>
            </div>
            <ProgressBar
              label={`Progress of ${milestone.title}`}
              percent={milestone.percent}
            />
            <p className="text-xs text-muted">
              {`${percentDoneLabel(milestone.percent)}, ${milestone.done} of ${milestone.tasks} tasks done`}
              {milestone.dueAt ? `, due ${formatDate(milestone.dueAt)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
