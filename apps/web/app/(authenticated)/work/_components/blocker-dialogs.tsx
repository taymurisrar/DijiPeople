"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  DateField,
  SelectField,
  TextAreaField,
} from "@/app/components/ui/form-control";
import {
  BLOCKER_CATEGORIES,
  BLOCKER_CATEGORY_LABELS,
  BLOCKER_CAUSES,
  BLOCKER_CAUSE_LABELS,
  buildCausePayload,
  buildCloseBlockerPayload,
  buildEscalatePayload,
  buildRaiseBlockerPayload,
  buildUpdateBlockerPayload,
  causeLabel,
  escalationLabel,
  type Built,
  type WorkBlocker,
} from "../_lib/blockers";
import { personSelectOptions, type PersonOption } from "../_lib/people";
import { WorkRequestError, workRequest } from "../_lib/work-client";

/** The dialog a blocker action opens, with the blocker it acts on. */
export type BlockerPending =
  | { kind: "raise"; workItemId: string; workItemTitle?: string }
  | {
      kind: "resolve" | "cancel" | "cause" | "escalate" | "assign";
      blocker: WorkBlocker;
    };

const NO_OWNER = "";

const CATEGORY_OPTIONS = BLOCKER_CATEGORIES.map((value) => ({
  value,
  label: BLOCKER_CATEGORY_LABELS[value],
}));

const CAUSE_OPTIONS = BLOCKER_CAUSES.map((value) => ({
  value,
  label: BLOCKER_CAUSE_LABELS[value],
}));

/** On raising, "not sure" is simply no cause: the API then records UNDETERMINED. */
const RAISE_CAUSE_OPTIONS = [
  { value: "", label: "Not sure" },
  ...CAUSE_OPTIONS.filter((option) => option.value !== "UNDETERMINED"),
];

/**
 * The form shell every blocker action shares: a title, an error line that shows
 * the API's own message, and a confirm button that is busy while it runs. The
 * API decides whether the action is allowed; a refusal is shown, never hidden.
 */
function ActionDialog({
  children,
  confirmLabel,
  onClose,
  onSubmit,
  title,
}: {
  children: ReactNode;
  confirmLabel: string;
  onClose: () => void;
  /** Resolves when done; throws to show a message; returns a message to refuse locally. */
  onSubmit: () => Promise<string | null>;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const problem = await onSubmit();
      if (problem) setError(problem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={title}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </Dialog>
  );
}

async function send(
  built: Built<unknown>,
  call: (body: unknown) => Promise<unknown>,
): Promise<string | null> {
  if (!built.ok) return built.message;
  await call(built.body);
  return null;
}

/**
 * Raise, resolve, cancel, escalate, name the cause of, or reassign a blocker.
 * `onDone` runs after the API accepted the change so the caller can refresh;
 * `onCauseRefused` runs when the API refuses a reviewer's cause judgement, so the
 * caller stops offering it for that blocker.
 */
export function BlockerDialogs({
  onCauseRefused,
  onClose,
  onDone,
  pending,
  people,
}: {
  onCauseRefused?: (blockerId: string) => void;
  onClose: () => void;
  onDone: () => void;
  pending: BlockerPending | null;
  people: PersonOption[];
}) {
  if (!pending) return null;
  const done = () => {
    onDone();
    onClose();
  };

  switch (pending.kind) {
    case "raise":
      return (
        <RaiseDialog
          onClose={onClose}
          onDone={done}
          people={people}
          workItemId={pending.workItemId}
          workItemTitle={pending.workItemTitle}
        />
      );
    case "resolve":
    case "cancel":
      return (
        <CloseDialog
          blocker={pending.blocker}
          kind={pending.kind}
          onClose={onClose}
          onDone={done}
        />
      );
    case "escalate":
      return (
        <EscalateDialog
          blocker={pending.blocker}
          onClose={onClose}
          onDone={done}
        />
      );
    case "cause":
      return (
        <CauseDialog
          blocker={pending.blocker}
          onCauseRefused={onCauseRefused}
          onClose={onClose}
          onDone={done}
        />
      );
    case "assign":
      return (
        <AssignDialog
          blocker={pending.blocker}
          onClose={onClose}
          onDone={done}
          people={people}
        />
      );
  }
}

function RaiseDialog({
  onClose,
  onDone,
  people,
  workItemId,
  workItemTitle,
}: {
  onClose: () => void;
  onDone: () => void;
  people: PersonOption[];
  workItemId: string;
  workItemTitle?: string;
}) {
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [owner, setOwner] = useState(NO_OWNER);
  const [dueDate, setDueDate] = useState("");
  const [cause, setCause] = useState("");

  return (
    <ActionDialog
      confirmLabel="Raise blocker"
      onClose={onClose}
      onSubmit={async () => {
        const problem = await send(
          buildRaiseBlockerPayload({
            category,
            reason,
            ownerEmployeeId: owner,
            dueDate,
            cause,
          }),
          (body) =>
            workRequest("work-items", `/${workItemId}/blockers`, {
              method: "POST",
              body,
            }),
        );
        if (!problem) onDone();
        return problem;
      }}
      title={workItemTitle ? `Raise blocker: ${workItemTitle}` : "Raise blocker"}
    >
      <SelectField
        label="Category"
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
        placeholder="Select a category"
        required
        value={category}
      />
      <TextAreaField
        label="Reason"
        onChange={setReason}
        required
        rows={3}
        value={reason}
      />
      <SelectField
        label="Owner"
        onChange={setOwner}
        options={[{ value: NO_OWNER, label: "No owner yet" }, ...personSelectOptions(people)]}
        value={owner}
      />
      <DateField label="Due date" onChange={setDueDate} value={dueDate} />
      <SelectField
        label="Cause (optional)"
        onChange={setCause}
        options={RAISE_CAUSE_OPTIONS}
        value={cause}
      />
    </ActionDialog>
  );
}

function CloseDialog({
  blocker,
  kind,
  onClose,
  onDone,
}: {
  blocker: WorkBlocker;
  kind: "resolve" | "cancel";
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState("");
  const resolving = kind === "resolve";

  return (
    <ActionDialog
      confirmLabel={resolving ? "Resolve blocker" : "Cancel blocker"}
      onClose={onClose}
      onSubmit={async () => {
        const problem = await send(buildCloseBlockerPayload(resolution), (body) =>
          workRequest("work-blockers", `/${blocker.id}/${kind}`, {
            method: "POST",
            body,
          }),
        );
        if (!problem) onDone();
        return problem;
      }}
      title={resolving ? "Resolve blocker" : "Cancel blocker"}
    >
      <p className="text-sm text-foreground">{blocker.reason}</p>
      <TextAreaField
        label={resolving ? "Resolution" : "Reason for cancelling"}
        onChange={setResolution}
        required
        rows={3}
        value={resolution}
      />
    </ActionDialog>
  );
}

function EscalateDialog({
  blocker,
  onClose,
  onDone,
}: {
  blocker: WorkBlocker;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");

  return (
    <ActionDialog
      confirmLabel="Escalate blocker"
      onClose={onClose}
      onSubmit={async () => {
        await workRequest("work-blockers", `/${blocker.id}/escalate`, {
          method: "POST",
          body: buildEscalatePayload(note),
        });
        onDone();
        return null;
      }}
      title="Escalate blocker"
    >
      <p className="text-sm text-foreground">{blocker.reason}</p>
      <p className="text-sm text-muted">{escalationLabel(blocker.escalationLevel)}</p>
      <TextAreaField label="Note" onChange={setNote} rows={3} value={note} />
    </ActionDialog>
  );
}

function CauseDialog({
  blocker,
  onCauseRefused,
  onClose,
  onDone,
}: {
  blocker: WorkBlocker;
  onCauseRefused?: (blockerId: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cause, setCause] = useState<string>(blocker.cause);
  const [note, setNote] = useState("");

  return (
    <ActionDialog
      confirmLabel="Save cause"
      onClose={onClose}
      onSubmit={async () => {
        try {
          const problem = await send(buildCausePayload({ cause, note }), (body) =>
            workRequest("work-blockers", `/${blocker.id}/cause`, {
              method: "POST",
              body,
            }),
          );
          if (!problem) onDone();
          return problem;
        } catch (e) {
          // A reviewer's judgement: the API says no to the person the blocker
          // waits on and to people doing the delayed work. Say why, and stop
          // offering the control for this blocker.
          if (e instanceof WorkRequestError && e.status === 403) {
            onCauseRefused?.(blocker.id);
          }
          throw e;
        }
      }}
      title="Set blocker cause"
    >
      <p className="text-sm text-foreground">{blocker.reason}</p>
      <p className="text-sm text-muted">{`Current cause: ${causeLabel(blocker.cause)}`}</p>
      <SelectField
        label="Cause"
        onChange={setCause}
        options={CAUSE_OPTIONS}
        required
        value={cause}
      />
      <TextAreaField label="Note" onChange={setNote} rows={3} value={note} />
    </ActionDialog>
  );
}

function AssignDialog({
  blocker,
  onClose,
  onDone,
  people,
}: {
  blocker: WorkBlocker;
  onClose: () => void;
  onDone: () => void;
  people: PersonOption[];
}) {
  const [owner, setOwner] = useState(blocker.ownerEmployeeId ?? NO_OWNER);
  const [dueDate, setDueDate] = useState("");

  return (
    <ActionDialog
      confirmLabel="Save owner and due date"
      onClose={onClose}
      onSubmit={async () => {
        const problem = await send(
          buildUpdateBlockerPayload({
            // Only a changed owner is sent.
            ownerEmployeeId: owner !== (blocker.ownerEmployeeId ?? NO_OWNER) ? owner : "",
            dueDate,
          }),
          (body) =>
            workRequest("work-blockers", `/${blocker.id}`, {
              method: "PATCH",
              body,
            }),
        );
        if (!problem) onDone();
        return problem;
      }}
      title="Assign blocker owner"
    >
      <p className="text-sm text-foreground">{blocker.reason}</p>
      <SelectField
        label="Owner"
        onChange={setOwner}
        options={[{ value: NO_OWNER, label: "No owner yet" }, ...personSelectOptions(people)]}
        value={owner}
      />
      <DateField label="Due date" onChange={setDueDate} value={dueDate} />
    </ActionDialog>
  );
}
