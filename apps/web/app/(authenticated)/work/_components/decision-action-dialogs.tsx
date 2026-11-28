"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { TextAreaField, TextField } from "@/app/components/ui/form-control";
import {
  MAX_TITLE,
  buildActionPayload,
  buildSupersedePayload,
  validateAction,
  validateSupersede,
  type Decision,
} from "../_lib/decisions";
import type { PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { EmployeeLookupField } from "./duty-people-field";
import { MomentField } from "./moment-field";

/**
 * Replace a decision with a new one. The old row is kept and marked superseded; the
 * new one names it, so the chain shows both.
 */
export function SupersedeDialog({
  decision,
  onClose,
  onDone,
}: {
  decision: Decision;
  onClose: () => void;
  onDone: (successor: Decision) => void;
}) {
  const [title, setTitle] = useState(decision.title);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const problem = validateSupersede({ decision: text });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(
        await workRequest<Decision>(
          "work-decisions",
          `/${decision.id}/supersede`,
          {
            method: "POST",
            body: buildSupersedePayload({ decision: text, title, original: decision }),
          },
        ),
      );
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
            Back
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            Supersede decision
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={`Supersede ${decision.title}`}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextField label="Title" maxLength={MAX_TITLE} onChange={setTitle} value={title} />
        <TextAreaField
          label="New decision"
          onChange={setText}
          required
          rows={4}
          value={text}
        />
      </div>
    </Dialog>
  );
}

/** Hand out the work a decision calls for: an ordinary work item the owner will see. */
export function AddActionDialog({
  decision,
  onClose,
  onDone,
  people,
}: {
  decision: Decision;
  onClose: () => void;
  onDone: () => void;
  people: readonly PersonOption[];
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const problem = validateAction({ title, ownerEmployeeId: owner, dueAt });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await workRequest("work-decisions", `/${decision.id}/actions`, {
        method: "POST",
        body: buildActionPayload({ title, ownerEmployeeId: owner, dueAt }),
      });
      onDone();
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
            Back
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            Add action
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={`Add action to ${decision.title}`}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextField
          label="Action"
          maxLength={MAX_TITLE}
          onChange={setTitle}
          required
          value={title}
        />
        <EmployeeLookupField
          label="Owner"
          onChange={setOwner}
          people={people}
          required
          value={owner}
        />
        <MomentField label="Due" onChange={setDueAt} required value={dueAt} />
      </div>
    </Dialog>
  );
}
