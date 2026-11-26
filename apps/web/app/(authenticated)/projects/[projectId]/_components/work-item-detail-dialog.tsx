"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { SelectField, TextField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import { BlockerBadges } from "../../../work/_components/blocker-badges";
import {
  BlockerDialogs,
  type BlockerPending,
} from "../../../work/_components/blocker-dialogs";
import { BlockerRowActions } from "../../../work/_components/blocker-row-actions";
import {
  BLOCKED_TIME_NOTE,
  hoursGapLabel,
  hoursGapTone,
  isOpenBlocker,
  reportedLabel,
  type HoursPerson,
  type WorkBlocker,
  type WorkItemHours,
} from "../../../work/_lib/blockers";
import {
  buildContributorPayload,
  buildDependencyPayload,
  buildProjectTaskPayload,
  buildSetMilestonePayload,
  formatMinutes,
  type ProgressMilestone,
  type WorkItemDetail,
} from "../../../work/_lib/project-work";
import {
  personLabel,
  personSelectOptions,
  type PersonOption,
} from "../../../work/_lib/people";
import { workRequest } from "../../../work/_lib/work-client";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  buildReassignPayload,
  isTerminal,
  priorityTone,
  statusTone,
  type WorkItem,
} from "../../../work/_lib/work-items";

type MinuteDraft = { estimate: string; actual: string };

const NO_MILESTONE = "";

/** Reported actual time and approved timesheet time, side by side with the gap in words. */
const HOURS_COLUMNS: DataTableColumn<HoursPerson>[] = [
  {
    key: "name",
    header: "Person",
    render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
  },
  {
    key: "estimate",
    header: "Estimate",
    render: (row) => reportedLabel(row.estimateMinutes),
  },
  {
    key: "reported",
    header: "Reported actual",
    render: (row) => reportedLabel(row.reportedActualMinutes),
  },
  {
    key: "approved",
    header: "Approved timesheet",
    render: (row) => formatMinutes(row.approvedTimesheetMinutes),
  },
  {
    key: "pending",
    header: "Pending timesheet",
    render: (row) => formatMinutes(row.pendingTimesheetMinutes),
  },
  {
    key: "gap",
    header: "Gap",
    render: (row) => (
      <StatusPill tone={hoursGapTone(row.reconciliation)}>
        {hoursGapLabel(row)}
      </StatusPill>
    ),
  },
];

function draftFor(
  contributor: WorkItemDetail["contributors"][number],
): MinuteDraft {
  return {
    estimate:
      contributor.estimateMinutes === null ? "" : String(contributor.estimateMinutes),
    actual: contributor.actualMinutes === null ? "" : String(contributor.actualMinutes),
  };
}

/**
 * One work item in full: subtasks, dependencies, contributors with their own
 * estimate and actual minutes (one row per person), milestone and owner. Every
 * change is the API's to accept; its message is shown when it refuses, including
 * the cycle error when a dependency would loop.
 */
export function WorkItemDetailDialog({
  canWrite,
  itemId,
  items,
  milestones,
  onChanged,
  onClose,
  people,
  projectId,
}: {
  canWrite: boolean;
  itemId: string;
  /** The project's other tasks, for naming and choosing dependencies. */
  items: WorkItem[];
  milestones: ProgressMilestone[];
  onChanged: () => void;
  onClose: () => void;
  people: PersonOption[];
  projectId: string;
}) {
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [owner, setOwner] = useState("");
  const [milestone, setMilestone] = useState(NO_MILESTONE);
  const [subtask, setSubtask] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [rows, setRows] = useState<Record<string, MinuteDraft>>({});
  const [newPerson, setNewPerson] = useState("");
  const [newMinutes, setNewMinutes] = useState<MinuteDraft>({
    estimate: "",
    actual: "",
  });

  const apply = useCallback((next: WorkItemDetail) => {
    setDetail(next);
    setOwner(next.ownerEmployeeId ?? "");
    setMilestone(next.milestoneId ?? NO_MILESTONE);
    setRows(
      Object.fromEntries(next.contributors.map((c) => [c.employeeId, draftFor(c)])),
    );
  }, []);

  const [blockers, setBlockers] = useState<WorkBlocker[] | null>(null);
  const [hours, setHours] = useState<WorkItemHours | null>(null);
  const [blockersError, setBlockersError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [pendingBlocker, setPendingBlocker] = useState<BlockerPending | null>(
    null,
  );
  const [causeRefused, setCauseRefused] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** Blockers and the hours reconciliation load apart: either may be refused alone. */
  const loadRelated = useCallback(async () => {
    const [blockerResult, hoursResult] = await Promise.allSettled([
      workRequest<WorkBlocker[]>("work-items", `/${itemId}/blockers`),
      workRequest<WorkItemHours>("work-items", `/${itemId}/hours`),
    ]);
    if (blockerResult.status === "fulfilled") {
      setBlockers(blockerResult.value);
      setBlockersError(null);
    } else {
      setBlockersError(
        blockerResult.reason instanceof Error
          ? blockerResult.reason.message
          : "The request failed.",
      );
    }
    if (hoursResult.status === "fulfilled") {
      setHours(hoursResult.value);
      setHoursError(null);
    } else {
      setHoursError(
        hoursResult.reason instanceof Error
          ? hoursResult.reason.message
          : "The request failed.",
      );
    }
  }, [itemId]);

  const reload = useCallback(async () => {
    apply(await workRequest<WorkItemDetail>("work-items", `/${itemId}`));
    await loadRelated();
  }, [apply, itemId, loadRelated]);

  useEffect(() => {
    let cancelled = false;
    workRequest<WorkItemDetail>("work-items", `/${itemId}`)
      .then((next) => {
        if (!cancelled) apply(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "The request failed.");
        }
      });
    void loadRelated();
    return () => {
      cancelled = true;
    };
  }, [apply, itemId, loadRelated]);

  /** Run one change, refresh the detail and the screen behind it, or show why not. */
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const titleOf = (id: string) =>
    items.find((item) => item.id === id)?.title ?? `Work item ${id.slice(0, 8)}`;

  const dependencyOptions = items
    .filter(
      (item) =>
        item.id !== itemId &&
        !detail?.dependsOn.some((d) => d.dependsOnId === item.id),
    )
    .map((item) => ({ value: item.id, label: item.title }));
  const milestoneOptions = [
    { value: NO_MILESTONE, label: "No milestone" },
    ...milestones.map((m) => ({ value: m.id, label: m.title })),
  ];
  const personOptions = personSelectOptions(people);

  return (
    <>
    {/* A blocker action's own dialog replaces this one while it is open, so two focus traps never compete. */}
    <Dialog
      busy={busy}
      footer={<Button onClick={onClose}>Close</Button>}
      onClose={onClose}
      open={!pendingBlocker}
      size="xl"
      title={detail?.title ?? "Work item"}
      variant="panel"
    >
      <div className="grid gap-6">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {!detail ? (
          error ? null : (
            <p className="text-sm text-muted" role="status">
              Loading work item
            </p>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={statusTone(detail.status)}>
                {STATUS_LABELS[detail.status]}
              </StatusPill>
              <StatusPill tone={priorityTone(detail.priority)}>
                {PRIORITY_LABELS[detail.priority] ?? detail.priority}
              </StatusPill>
              {detail.dueAt ? (
                <span className="text-sm text-muted">{`Due ${formatDate(detail.dueAt)}`}</span>
              ) : null}
              {detail.effort ? (
                <span className="text-sm text-muted">
                  {`Estimated ${formatMinutes(detail.effort.estimateMinutes)}, actual ${formatMinutes(detail.effort.actualMinutes)}`}
                </span>
              ) : null}
            </div>
            {detail.description ? (
              <p className="text-sm text-foreground">{detail.description}</p>
            ) : null}

            <section aria-label="Owner" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Owner</h3>
              <p className="text-sm text-foreground">
                {detail.ownerName ?? "Unassigned"}
              </p>
              {canWrite ? (
                <div className="flex flex-wrap items-end gap-3">
                  <SelectField
                    label="New owner"
                    onChange={setOwner}
                    options={personOptions}
                    value={owner}
                  />
                  <Button
                    disabled={busy || !owner || owner === detail.ownerEmployeeId}
                    onClick={() =>
                      void run(() =>
                        workRequest("work-items", `/${itemId}/reassign`, {
                          method: "POST",
                          body: buildReassignPayload({ ownerEmployeeId: owner }),
                        }),
                      )
                    }
                    variant="secondary"
                  >
                    Reassign owner
                  </Button>
                </div>
              ) : null}
            </section>

            <section aria-label="Milestone" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Milestone</h3>
              {canWrite ? (
                <div className="flex flex-wrap items-end gap-3">
                  <SelectField
                    label="Milestone"
                    onChange={setMilestone}
                    options={milestoneOptions}
                    value={milestone}
                  />
                  <Button
                    disabled={busy || milestone === (detail.milestoneId ?? NO_MILESTONE)}
                    onClick={() =>
                      void run(() =>
                        workRequest("work-items", `/${itemId}/milestone`, {
                          method: "POST",
                          body: buildSetMilestonePayload(milestone),
                        }),
                      )
                    }
                    variant="secondary"
                  >
                    Apply milestone
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-foreground">
                  {milestones.find((m) => m.id === detail.milestoneId)?.title ??
                    "No milestone"}
                </p>
              )}
            </section>

            <section aria-label="Subtasks" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Subtasks</h3>
              {detail.children.length === 0 ? (
                <p className="text-sm text-muted">No subtasks.</p>
              ) : (
                <ul className="grid gap-2">
                  {detail.children.map((child) => (
                    <li
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                      key={child.id}
                    >
                      <span className="text-foreground">{child.title}</span>
                      <StatusPill tone={statusTone(child.status)}>
                        {STATUS_LABELS[child.status] ?? child.status}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <div className="flex flex-wrap items-end gap-3">
                  <TextField
                    label="Subtask title"
                    maxLength={200}
                    onChange={setSubtask}
                    value={subtask}
                  />
                  <Button
                    disabled={busy || !subtask.trim()}
                    onClick={() =>
                      void run(async () => {
                        await workRequest("work-items", "", {
                          method: "POST",
                          body: buildProjectTaskPayload({
                            title: subtask,
                            projectId,
                            parentId: itemId,
                          }),
                        });
                        setSubtask("");
                      })
                    }
                    variant="secondary"
                  >
                    Add subtask
                  </Button>
                </div>
              ) : null}
            </section>

            <section aria-label="Dependencies" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Dependencies</h3>
              {detail.dependsOn.length === 0 ? (
                <p className="text-sm text-muted">Depends on nothing.</p>
              ) : (
                <ul className="grid gap-2">
                  {detail.dependsOn.map((dependency) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
                      key={dependency.dependsOnId}
                    >
                      <span className="text-foreground">
                        {titleOf(dependency.dependsOnId)}
                      </span>
                      {canWrite ? (
                        <Button
                          aria-label={`Remove dependency: ${titleOf(dependency.dependsOnId)}`}
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              workRequest(
                                "work-items",
                                `/${itemId}/dependencies/${dependency.dependsOnId}`,
                                { method: "DELETE" },
                              ),
                            )
                          }
                          size="xs"
                          variant="danger-soft"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <div className="flex flex-wrap items-end gap-3">
                  <SelectField
                    label="Depends on"
                    onChange={setDependsOn}
                    options={dependencyOptions}
                    placeholder="Select a task"
                    value={dependsOn}
                  />
                  <Button
                    disabled={busy || !dependsOn}
                    onClick={() =>
                      void run(async () => {
                        await workRequest("work-items", `/${itemId}/dependencies`, {
                          method: "POST",
                          body: buildDependencyPayload(dependsOn),
                        });
                        setDependsOn("");
                      })
                    }
                    variant="secondary"
                  >
                    Add dependency
                  </Button>
                </div>
              ) : null}
            </section>

            <section aria-label="Blockers" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Blockers</h3>
                {canWrite && !isTerminal(detail.status) ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      setPendingBlocker({
                        kind: "raise",
                        workItemId: itemId,
                        workItemTitle: detail.title,
                      })
                    }
                    size="xs"
                    variant="secondary"
                  >
                    Raise blocker
                  </Button>
                ) : null}
              </div>
              {blockersError ? (
                <p className="text-sm text-danger" role="alert">
                  {blockersError}
                </p>
              ) : null}
              {blockers === null ? (
                blockersError ? null : (
                  <p className="text-sm text-muted" role="status">
                    Loading blockers
                  </p>
                )
              ) : blockers.length === 0 ? (
                <p className="text-sm text-muted">No blockers on this item.</p>
              ) : (
                <ul className="grid gap-3">
                  {blockers.map((blocker) => (
                    <li
                      className="grid gap-2 rounded-xl border border-border p-3"
                      key={blocker.id}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {blocker.reason}
                      </p>
                      <BlockerBadges blocker={blocker} />
                      <p className="text-xs text-muted">
                        {`Owner: ${blocker.ownerName ?? "No owner yet"}`}
                        {blocker.dueAt ? `. Due ${formatDate(blocker.dueAt)}` : ""}
                        {blocker.raisedAt
                          ? `. Raised ${formatDate(blocker.raisedAt)}`
                          : ""}
                      </p>
                      {blocker.resolution ? (
                        <p className="text-xs text-muted">{`Resolution: ${blocker.resolution}`}</p>
                      ) : null}
                      {canWrite && isOpenBlocker(blocker) ? (
                        <div className="flex flex-wrap gap-1.5">
                          <BlockerRowActions
                            blocker={blocker}
                            canWrite={canWrite}
                            causeRefused={causeRefused.has(blocker.id)}
                            disabled={busy}
                            onAction={setPendingBlocker}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">{BLOCKED_TIME_NOTE}</p>
            </section>

            <section aria-label="Hours" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Hours</h3>
              {hoursError ? (
                <p className="text-sm text-danger" role="alert">
                  {hoursError}
                </p>
              ) : null}
              {hours === null ? (
                hoursError ? null : (
                  <p className="text-sm text-muted" role="status">
                    Loading hours
                  </p>
                )
              ) : (
                <DataTable
                  columns={HOURS_COLUMNS}
                  emptyState={
                    <p className="p-4 text-sm text-muted">
                      No one has reported or booked time on this item.
                    </p>
                  }
                  enableSearch={false}
                  entityLogicalName="work-item-hours"
                  getRowKey={(row) => row.employeeId}
                  rows={hours.people}
                />
              )}
            </section>

            <section aria-label="Contributors" className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Contributors</h3>
              {detail.contributors.length === 0 ? (
                <p className="text-sm text-muted">No contributors yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {detail.contributors.map((contributor) => {
                    const name = personLabel(people, contributor.employeeId);
                    const draft = rows[contributor.employeeId] ?? draftFor(contributor);
                    const setDraft = (patch: Partial<MinuteDraft>) =>
                      setRows((current) => ({
                        ...current,
                        [contributor.employeeId]: { ...draft, ...patch },
                      }));
                    return (
                      <li
                        className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                        key={contributor.employeeId}
                      >
                        <p className="text-sm font-medium text-foreground">{name}</p>
                        <TextField
                          disabled={!canWrite}
                          label={`Estimate minutes for ${name}`}
                          onChange={(estimate) => setDraft({ estimate })}
                          value={draft.estimate}
                        />
                        <TextField
                          disabled={!canWrite}
                          label={`Actual minutes for ${name}`}
                          onChange={(actual) => setDraft({ actual })}
                          value={draft.actual}
                        />
                        {canWrite ? (
                          <div className="flex gap-2">
                            <Button
                              aria-label={`Save contributor: ${name}`}
                              disabled={busy}
                              onClick={() => {
                                const built = buildContributorPayload(draft);
                                if (!built.ok) {
                                  setError(built.message);
                                  return;
                                }
                                void run(() =>
                                  workRequest(
                                    "work-items",
                                    `/${itemId}/contributors/${contributor.employeeId}`,
                                    { method: "PUT", body: built.body },
                                  ),
                                );
                              }}
                              size="xs"
                              variant="secondary"
                            >
                              Save
                            </Button>
                            <Button
                              aria-label={`Remove contributor: ${name}`}
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  workRequest(
                                    "work-items",
                                    `/${itemId}/contributors/${contributor.employeeId}`,
                                    { method: "DELETE" },
                                  ),
                                )
                              }
                              size="xs"
                              variant="danger-soft"
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canWrite ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <SelectField
                    label="Contributor"
                    onChange={setNewPerson}
                    options={personOptions.filter(
                      (option) =>
                        !detail.contributors.some((c) => c.employeeId === option.value),
                    )}
                    placeholder="Select a person"
                    value={newPerson}
                  />
                  <TextField
                    label="New contributor estimate minutes"
                    onChange={(estimate) =>
                      setNewMinutes((current) => ({ ...current, estimate }))
                    }
                    value={newMinutes.estimate}
                  />
                  <TextField
                    label="New contributor actual minutes"
                    onChange={(actual) =>
                      setNewMinutes((current) => ({ ...current, actual }))
                    }
                    value={newMinutes.actual}
                  />
                  <Button
                    disabled={busy || !newPerson}
                    onClick={() => {
                      const built = buildContributorPayload(newMinutes);
                      if (!built.ok) {
                        setError(built.message);
                        return;
                      }
                      void run(async () => {
                        await workRequest(
                          "work-items",
                          `/${itemId}/contributors/${newPerson}`,
                          { method: "PUT", body: built.body },
                        );
                        setNewPerson("");
                        setNewMinutes({ estimate: "", actual: "" });
                      });
                    }}
                    variant="secondary"
                  >
                    Add contributor
                  </Button>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </Dialog>
    <BlockerDialogs
      onCauseRefused={(id) =>
        setCauseRefused((current) => new Set(current).add(id))
      }
      onClose={() => setPendingBlocker(null)}
      onDone={() => {
        void reload()
          .then(onChanged)
          .catch((e: unknown) =>
            setError(e instanceof Error ? e.message : "The request failed."),
          );
      }}
      pending={pendingBlocker}
      people={people}
    />
    </>
  );
}