"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { DateField, SelectField, TextField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import { SummaryTile } from "../../../work/_components/summary-tile";
import { WorkItemsTable } from "../../../work/_components/work-items-table";
import type { PersonOption } from "../../../work/_lib/people";
import {
  buildCreateMilestonePayload,
  buildProjectItemsQuery,
  buildProjectTaskPayload,
  formatMinutes,
  percentDoneLabel,
  type ProjectProgress,
} from "../../../work/_lib/project-work";
import { workRequest } from "../../../work/_lib/work-client";
import {
  allowedTransitions,
  buildTransitionPayload,
  type WorkItem,
  type WorkItemPage,
  type WorkItemStatus,
} from "../../../work/_lib/work-items";
import { MilestonesPanel } from "./milestones-panel";
import { WorkBoard } from "./work-board";
import { WorkItemDetailDialog } from "./work-item-detail-dialog";
import { WorkloadPanel } from "./workload-panel";

type View = "board" | "list" | "milestones" | "workload";

const VIEW_OPTIONS: { label: string; value: View }[] = [
  { label: "Board", value: "board" },
  { label: "List", value: "list" },
  { label: "Milestones", value: "milestones" },
  { label: "Workload", value: "workload" },
];

const EMPTY_QUEUES: ReadonlyMap<string, string> = new Map();

/**
 * The Work area of a project: progress at a glance, then the project's tasks as
 * a board or a list, its milestones, and who is committed to what. It extends the
 * project record rather than standing beside it. The work items API decides what
 * the viewer may see and change, and its refusal is shown as it arrives.
 */
export function ProjectWorkArea({
  canWrite,
  people,
  projectId,
}: {
  canWrite: boolean;
  people: PersonOption[];
  projectId: string;
}) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [view, setView] = useState<View>("board");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<"task" | "milestone" | null>(null);

  const load = useCallback(async () => {
    try {
      const [page, summary] = await Promise.all([
        workRequest<WorkItemPage>(
          "work-items",
          `?${buildProjectItemsQuery({ projectId })}`,
        ),
        workRequest<ProjectProgress>(
          "work-items",
          `/progress?projectId=${encodeURIComponent(projectId)}`,
        ),
      ]);
      setItems(page.items);
      setProgress(summary);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (item: WorkItem, to: WorkItemStatus) => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await workRequest("work-items", `/${item.id}/transition`, {
        method: "POST",
        body: buildTransitionPayload(to),
      });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  const milestones = progress?.milestones ?? [];

  return (
    <SectionCard title="Project work">
      <div className="grid gap-6">
        {loadError ? (
          <div className="grid gap-3" role="alert">
            <p className="text-sm text-danger">{loadError}</p>
            <div>
              <Button
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                variant="secondary"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div
            aria-busy="true"
            aria-label="Loading project work"
            className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
            role="status"
          />
        ) : progress ? (
          <>
            <section
              aria-label="Project progress"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <SummaryTile
                detail={`${progress.tasks.done} of ${progress.tasks.counted} tasks done`}
                label="Progress"
                value={percentDoneLabel(progress.percentDone)}
              />
              <SummaryTile label="Overdue tasks" value={progress.overdue} />
              <SummaryTile
                detail={`Estimated ${formatMinutes(progress.effort.estimateMinutes)}, ${progress.effort.contributors} contributors`}
                label="Actual effort"
                value={formatMinutes(progress.effort.actualMinutes)}
              />
              <SummaryTile
                label="Approved timesheet hours"
                value={progress.approvedTimesheetHours}
              />
            </section>
            {progress.truncated ? (
              <p className="text-sm text-muted" role="status">
                This project has more work than can be summarised exactly; figures cover the first part.
              </p>
            ) : null}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <SegmentedControl
                label="Work view"
                onChange={setView}
                options={VIEW_OPTIONS}
                value={view}
              />
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setCreating("task")}
                  >
                    New task
                  </Button>
                  <Button
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setCreating("milestone")}
                    variant="secondary"
                  >
                    New milestone
                  </Button>
                </div>
              ) : null}
            </div>

            {actionError ? (
              <p className="text-sm text-danger" role="alert">
                {actionError}
              </p>
            ) : null}

            {view === "board" ? (
              items.length === 0 ? (
                <EmptyState
                  action={
                    canWrite ? (
                      <Button onClick={() => setCreating("task")}>New task</Button>
                    ) : undefined
                  }
                  description="Tasks added to this project appear on the board."
                  title="No tasks in this project"
                />
              ) : (
                <WorkBoard
                  busyId={busyId}
                  canWrite={canWrite}
                  items={items}
                  onMove={(item, to) => void move(item, to)}
                  onOpen={(item) => setOpenId(item.id)}
                />
              )
            ) : null}

            {view === "list" ? (
              <WorkItemsTable
                emptyState={
                  <EmptyState
                    description="Tasks added to this project appear here."
                    title="No tasks in this project"
                  />
                }
                entityLogicalName="project-work-items"
                extraColumns={[
                  {
                    key: "owner",
                    header: "Owner",
                    sortable: true,
                    sortAccessor: (row) => row.ownerName ?? "",
                    searchAccessor: (row) => row.ownerName ?? "",
                    render: (row) =>
                      row.ownerName ?? <span className="text-muted">Unassigned</span>,
                  },
                  {
                    key: "open",
                    header: "Details",
                    render: (row) => (
                      <Button
                        aria-label={`Open ${row.title}`}
                        onClick={() => setOpenId(row.id)}
                        size="xs"
                        variant="outline"
                      >
                        Open
                      </Button>
                    ),
                  },
                ]}
                queueNames={EMPTY_QUEUES}
                renderActions={(row) =>
                  canWrite
                    ? allowedTransitions(row.status).map((action) => (
                        <Button
                          aria-label={`${action.label}: ${row.title}`}
                          disabled={busyId !== null}
                          key={action.to}
                          loading={busyId === row.id}
                          onClick={() => void move(row, action.to)}
                          size="xs"
                          variant={action.variant}
                        >
                          {action.label}
                        </Button>
                      ))
                    : null
                }
                rows={items}
              />
            ) : null}

            {view === "milestones" ? (
              <MilestonesPanel
                canWrite={canWrite}
                milestones={milestones}
                onCreate={() => setCreating("milestone")}
              />
            ) : null}

            {view === "workload" ? <WorkloadPanel projectId={projectId} /> : null}
          </>
        ) : null}
      </div>

      {creating ? (
        <CreateWorkDialog
          kind={creating}
          milestones={milestones}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            void load();
          }}
          projectId={projectId}
        />
      ) : null}

      {openId ? (
        <WorkItemDetailDialog
          canWrite={canWrite}
          itemId={openId}
          items={items}
          milestones={milestones}
          onChanged={() => void load()}
          onClose={() => setOpenId(null)}
          people={people}
          projectId={projectId}
        />
      ) : null}
    </SectionCard>
  );
}

/** A task or a milestone for this project, created through the work items API. */
function CreateWorkDialog({
  kind,
  milestones,
  onClose,
  onCreated,
  projectId,
}: {
  kind: "task" | "milestone";
  milestones: { id: string; title: string }[];
  onClose: () => void;
  onCreated: () => void;
  projectId: string;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = kind === "task" ? "task" : "milestone";

  const create = async () => {
    if (!title.trim()) {
      setError(`Enter a title for the ${label}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await workRequest("work-items", "", {
        method: "POST",
        body:
          kind === "milestone"
            ? buildCreateMilestonePayload({ title, projectId, dueDate })
            : buildProjectTaskPayload({ title, projectId, milestoneId }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void create()}>
            {kind === "task" ? "Create task" : "Create milestone"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={kind === "task" ? "New project task" : "New milestone"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextField
          label="Title"
          maxLength={200}
          onChange={setTitle}
          required
          value={title}
        />
        {kind === "milestone" ? (
          <DateField label="Due date" onChange={setDueDate} value={dueDate} />
        ) : (
          <SelectField
            label="Milestone"
            onChange={setMilestoneId}
            options={[
              { value: "", label: "No milestone" },
              ...milestones.map((m) => ({ value: m.id, label: m.title })),
            ]}
            value={milestoneId}
          />
        )}
      </div>
    </Dialog>
  );
}
