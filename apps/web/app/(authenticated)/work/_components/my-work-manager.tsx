"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  DateField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { workRequest } from "../_lib/work-client";
import {
  PRIORITY_LABELS,
  WORK_ITEM_PRIORITIES,
  allowedTransitions,
  buildCreateTaskPayload,
  buildItemsQuery,
  buildTransitionPayload,
  type WorkItem,
  type WorkItemPage,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkQueue,
} from "../_lib/work-items";
import { WorkItemsTable } from "./work-items-table";

const PRIORITY_OPTIONS = WORK_ITEM_PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

/**
 * The employee's own work: what they own or contribute to, the moves the
 * lifecycle allows from each status, and a personal task they can add. The API
 * decides what is visible and what may change.
 */
export function MyWorkManager({
  canWrite,
  initialItems,
  queues,
}: {
  canWrite: boolean;
  initialItems: WorkItem[];
  queues: WorkQueue[];
}) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<WorkItemPriority | "">("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const queueNames = useMemo(
    () => new Map(queues.map((queue) => [queue.id, queue.name])),
    [queues],
  );

  const reload = useCallback(async () => {
    const page = await workRequest<WorkItemPage>(
      "work-items",
      `?${buildItemsQuery({ mine: true })}`,
    );
    setItems(page.items);
  }, []);

  const move = async (item: WorkItem, to: WorkItemStatus) => {
    setBusyId(item.id);
    setError(null);
    try {
      await workRequest("work-items", `/${item.id}/transition`, {
        method: "POST",
        body: buildTransitionPayload(to),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setFormError(null);
    setTitle("");
    setPriority("");
    setDueDate("");
    setCreating(true);
  };

  const create = async () => {
    if (!title.trim()) {
      setFormError("Enter a title for the task.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await workRequest("work-items", "", {
        method: "POST",
        body: buildCreateTaskPayload({ title, priority, dueDate }),
      });
      await reload();
      setCreating(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New task
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <WorkItemsTable
        emptyState={
          <EmptyState
            action={
              canWrite ? <Button onClick={openCreate}>New task</Button> : undefined
            }
            description="Work you own or contribute to appears here."
            title="No work assigned to you"
          />
        }
        entityLogicalName="my-work-items"
        queueNames={queueNames}
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

      <Dialog
        busy={saving}
        footer={
          <>
            <Button onClick={() => setCreating(false)} variant="secondary">
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void create()}>
              Create task
            </Button>
          </>
        }
        onClose={() => setCreating(false)}
        open={creating}
        title="New task"
      >
        <div className="grid gap-4">
          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <TextField
            label="Title"
            maxLength={200}
            onChange={setTitle}
            required
            value={title}
          />
          <SelectField
            label="Priority"
            onChange={(value) => setPriority(value as WorkItemPriority | "")}
            options={PRIORITY_OPTIONS}
            value={priority}
          />
          <DateField label="Due date" onChange={setDueDate} value={dueDate} />
        </div>
      </Dialog>
    </div>
  );
}
