"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  LookupField,
  NumberField,
  SelectField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import { workRequest } from "../_lib/work-client";
import {
  STATUS_LABELS,
  WORK_ITEM_STATUSES,
  buildCreateQueuePayload,
  buildItemsQuery,
  buildReassignPayload,
  isValidQueueKey,
  queueKeyFromName,
  type OwnerChange,
  type QueueSummary,
  type WorkItem,
  type WorkItemPage,
  type WorkQueue,
} from "../_lib/work-items";
import { WorkItemsTable } from "./work-items-table";

type EmployeeSearchResponse = {
  items?: Array<{ id: string; fullName: string; employeeCode: string }>;
};

/**
 * A queue's standing and its items for a manager, HR or team lead: how much is
 * open, how much is unowned or late, and the claim / reassign / history moves.
 * Which queues and items appear is the API's decision, not this screen's.
 */
export function WorkQueuesManager({
  canClaimOrAssign,
  canManage,
  initialQueues,
}: {
  canClaimOrAssign: boolean;
  canManage: boolean;
  initialQueues: WorkQueue[];
}) {
  const [queues, setQueues] = useState(initialQueues);
  const [queueId, setQueueId] = useState(initialQueues[0]?.id ?? "");
  const [unassigned, setUnassigned] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [known, setKnown] = useState<Map<string, string>>(new Map());
  const [options, setOptions] = useState<LookupOption[]>([]);

  const [reassigning, setReassigning] = useState<WorkItem | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [reason, setReason] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignBusy, setReassignBusy] = useState(false);

  const [historyOf, setHistoryOf] = useState<WorkItem | null>(null);
  const [history, setHistory] = useState<OwnerChange[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [queueName, setQueueName] = useState("");
  const [queueKey, setQueueKey] = useState("");
  const [responseMinutes, setResponseMinutes] = useState<number | null>(null);
  const [resolutionMinutes, setResolutionMinutes] = useState<number | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);

  const queueNames = useMemo(
    () => new Map(queues.map((queue) => [queue.id, queue.name])),
    [queues],
  );
  const queueOptions = useMemo(
    () => queues.map((queue) => ({ value: queue.id, label: queue.name })),
    [queues],
  );

  useEffect(() => {
    if (!queueId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      workRequest<QueueSummary>("work-queues", `/${queueId}/summary`),
      workRequest<WorkItemPage>(
        "work-items",
        `?${buildItemsQuery({ queueId, unassigned, overdue })}`,
      ),
    ])
      .then(([nextSummary, page]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setItems(page.items);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "The request failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queueId, unassigned, overdue, version]);

  const refresh = () => setVersion((value) => value + 1);

  const searchEmployees = useCallback(async (query: string) => {
    try {
      const params = new URLSearchParams({ pageSize: "20" });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`/api/employees?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as EmployeeSearchResponse;
      const found = (body.items ?? []).map((item) => ({
        id: item.id,
        name: item.fullName,
        code: item.employeeCode,
      }));
      setKnown((previous) => {
        const next = new Map(previous);
        found.forEach((e) => next.set(e.id, e.name));
        return next;
      });
      setOptions(found);
    } catch {
      // A failed search leaves the previous options in place.
    }
  }, []);

  const personName = (id: string | null) =>
    id ? (known.get(id) ?? id.slice(0, 8)) : "Nobody";

  const claim = async (item: WorkItem) => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await workRequest("work-items", `/${item.id}/claim`, { method: "POST" });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  const openReassign = (item: WorkItem) => {
    setReassignError(null);
    setOwnerId("");
    setReason("");
    setReassigning(item);
    void searchEmployees("");
  };

  const reassign = async () => {
    if (!reassigning || !ownerId) {
      setReassignError("Choose the employee who takes this work.");
      return;
    }
    setReassignBusy(true);
    setReassignError(null);
    try {
      await workRequest("work-items", `/${reassigning.id}/reassign`, {
        method: "POST",
        body: buildReassignPayload({ ownerEmployeeId: ownerId, reason }),
      });
      setReassigning(null);
      refresh();
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setReassignBusy(false);
    }
  };

  const openHistory = async (item: WorkItem) => {
    setHistoryOf(item);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistory(
        await workRequest<OwnerChange[]>("work-items", `/${item.id}/owner-history`),
      );
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openCreateQueue = () => {
    setQueueError(null);
    setQueueName("");
    setQueueKey("");
    setResponseMinutes(null);
    setResolutionMinutes(null);
    setCreating(true);
  };

  const createQueue = async () => {
    const key = queueKey || queueKeyFromName(queueName);
    if (!queueName.trim()) {
      setQueueError("Enter a name for the queue.");
      return;
    }
    if (!isValidQueueKey(key)) {
      setQueueError(
        "The key must be lowercase letters, digits, dots, dashes or underscores.",
      );
      return;
    }
    setQueueBusy(true);
    setQueueError(null);
    try {
      const created = await workRequest<WorkQueue>("work-queues", "", {
        method: "POST",
        body: buildCreateQueuePayload({
          key,
          name: queueName,
          responseSlaMinutes: responseMinutes,
          resolutionSlaMinutes: resolutionMinutes,
        }),
      });
      setQueues((previous) => [...previous, created]);
      setQueueId(created.id);
      setCreating(false);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setQueueBusy(false);
    }
  };

  const ownerColumn: DataTableColumn<WorkItem> = {
    key: "owner",
    header: "Owner",
    render: (row) =>
      row.ownerEmployeeId ? (
        (row.ownerName ?? personName(row.ownerEmployeeId))
      ) : (
        <StatusPill tone="warning">Unassigned</StatusPill>
      ),
  };

  const stats: Array<{ label: string; value: number }> = summary
    ? [
        { label: "Open", value: summary.open },
        { label: "Unassigned", value: summary.unassigned },
        { label: "SLA at risk", value: summary.sla.atRisk },
        { label: "SLA breached", value: summary.sla.breached },
        { label: "Response breached", value: summary.sla.responseBreached },
      ]
    : [];

  const newQueueButton = canManage ? (
    <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateQueue}>
      New queue
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      {queues.length === 0 ? (
        <EmptyState
          action={newQueueButton ?? undefined}
          description="Queues you can see appear here."
          title="No work queues"
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-72 max-w-full">
                <SelectField
                  label="Queue"
                  onChange={setQueueId}
                  options={queueOptions}
                  value={queueId}
                />
              </div>
              <CheckboxField
                checked={unassigned}
                label="Unassigned"
                onChange={setUnassigned}
              />
              <CheckboxField
                checked={overdue}
                label="Overdue"
                onChange={setOverdue}
              />
            </div>
            {newQueueButton}
          </div>

          {loadError ? (
            <div
              className="rounded-[24px] border border-danger/20 bg-danger/5 p-4"
              role="alert"
            >
              <p className="text-sm text-danger">{loadError}</p>
              <div className="mt-3">
                <Button onClick={refresh} size="sm">
                  Retry
                </Button>
              </div>
            </div>
          ) : null}
          {actionError ? (
            <p className="text-sm text-danger" role="alert">
              {actionError}
            </p>
          ) : null}

          <div aria-busy={loading} className="grid gap-4">
            {summary ? (
              <SectionCard title={summary.queue.name}>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  {stats.map((stat) => (
                    <div
                      className="rounded-2xl border border-border bg-white/70 p-4"
                      key={stat.label}
                    >
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {stat.label}
                      </dt>
                      <dd className="mt-1 text-2xl font-semibold text-foreground">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {WORK_ITEM_STATUSES.filter(
                    (status) => (summary.byStatus[status] ?? 0) > 0,
                  ).map((status) => (
                    <StatusPill key={status} tone="muted">
                      {`${STATUS_LABELS[status]}: ${summary.byStatus[status]}`}
                    </StatusPill>
                  ))}
                  {summary.truncated ? (
                    <StatusPill tone="warning">
                      Counted from the first 5,000 items
                    </StatusPill>
                  ) : null}
                </div>
              </SectionCard>
            ) : null}

            <WorkItemsTable
              emptyState={
                <EmptyState
                  description="No work in this queue matches the filters."
                  title="Nothing to show"
                />
              }
              entityLogicalName="work-queue-items"
              extraColumns={[ownerColumn]}
              queueNames={queueNames}
              renderActions={(row) => (
                <>
                  {canClaimOrAssign && !row.ownerEmployeeId ? (
                    <Button
                      aria-label={`Claim: ${row.title}`}
                      disabled={busyId !== null}
                      loading={busyId === row.id}
                      onClick={() => void claim(row)}
                      size="xs"
                      variant="primary"
                    >
                      Claim
                    </Button>
                  ) : null}
                  {canClaimOrAssign ? (
                    <Button
                      aria-label={`Reassign: ${row.title}`}
                      onClick={() => openReassign(row)}
                      size="xs"
                      variant="outline"
                    >
                      Reassign
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`Owner history: ${row.title}`}
                    onClick={() => void openHistory(row)}
                    size="xs"
                    variant="outline"
                  >
                    History
                  </Button>
                </>
              )}
              rows={items}
            />
          </div>
        </>
      )}

      <Dialog
        busy={reassignBusy}
        footer={
          <>
            <Button onClick={() => setReassigning(null)} variant="secondary">
              Cancel
            </Button>
            <Button loading={reassignBusy} onClick={() => void reassign()}>
              Reassign
            </Button>
          </>
        }
        onClose={() => setReassigning(null)}
        open={reassigning !== null}
        title="Reassign work"
      >
        <div className="grid gap-4">
          {reassignError ? (
            <p className="text-sm text-danger" role="alert">
              {reassignError}
            </p>
          ) : null}
          <LookupField
            label="New owner"
            onChange={setOwnerId}
            onSearch={(query) => void searchEmployees(query)}
            options={options}
            required
            value={ownerId}
          />
          <TextField
            label="Reason"
            maxLength={500}
            onChange={setReason}
            value={reason}
          />
        </div>
      </Dialog>

      <Dialog
        footer={<Button onClick={() => setHistoryOf(null)}>Close</Button>}
        onClose={() => setHistoryOf(null)}
        open={historyOf !== null}
        title={historyOf ? `Owner history: ${historyOf.title}` : "Owner history"}
      >
        {historyError ? (
          <p className="text-sm text-danger" role="alert">
            {historyError}
          </p>
        ) : historyLoading ? (
          <p aria-busy="true" className="text-sm text-muted">
            Loading
          </p>
        ) : history.length === 0 ? (
          <EmptyState
            description="This work has not changed hands."
            title="No owner changes"
          />
        ) : (
          <ol className="grid gap-3">
            {history.map((change, index) => (
              <li
                className="rounded-2xl border border-border bg-white/70 p-3 text-sm"
                key={`${change.createdAt}-${index}`}
              >
                <p className="font-medium text-foreground">
                  {`${change.fromName ?? personName(change.fromEmployeeId)} to ${change.toName ?? personName(change.toEmployeeId)}`}
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(change.createdAt)}
                </p>
                {change.reason ? <p className="mt-1">{change.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Dialog>

      <Dialog
        busy={queueBusy}
        footer={
          <>
            <Button onClick={() => setCreating(false)} variant="secondary">
              Cancel
            </Button>
            <Button loading={queueBusy} onClick={() => void createQueue()}>
              Create queue
            </Button>
          </>
        }
        onClose={() => setCreating(false)}
        open={creating}
        title="New queue"
      >
        <div className="grid gap-4">
          {queueError ? (
            <p className="text-sm text-danger" role="alert">
              {queueError}
            </p>
          ) : null}
          <TextField
            label="Name"
            maxLength={120}
            onChange={setQueueName}
            required
            value={queueName}
          />
          <TextField
            label="Key"
            maxLength={64}
            onChange={setQueueKey}
            placeholder={queueKeyFromName(queueName)}
            value={queueKey}
          />
          <NumberField
            label="Response SLA (minutes)"
            max={525600}
            min={1}
            onChange={setResponseMinutes}
            value={responseMinutes}
          />
          <NumberField
            label="Resolution SLA (minutes)"
            max={525600}
            min={1}
            onChange={setResolutionMinutes}
            value={resolutionMinutes}
          />
        </div>
      </Dialog>
    </div>
  );
}
