"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import {
  MAX_TITLE,
  buildCreateDecisionPayload,
  validateDecisionInput,
  type Decision,
} from "../_lib/decisions";
import type { PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { EmployeeLookupField } from "./duty-people-field";
import type { ProjectOption } from "./meeting-form-dialog";

const STATUS_OPTIONS = [
  { value: "DECIDED", label: "Decided" },
  { value: "PROPOSED", label: "Proposed" },
];

/**
 * Record a decision. It is never edited afterwards: changing it later means
 * superseding it with a new one, and taking it back means reversing it with a
 * reason, so the register keeps what was decided and when.
 */
export function DecisionFormDialog({
  link,
  meeting,
  onClose,
  onSaved,
  people,
  projects,
}: {
  /** Work item or blocker the decision is being recorded for. */
  link?: { workItemId?: string; blockerId?: string };
  /** The meeting it is taken in, when recorded from one. */
  meeting?: { id: string; title: string };
  onClose: () => void;
  onSaved: (decision: Decision) => void;
  people: readonly PersonOption[];
  projects: readonly ProjectOption[];
}) {
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<"PROPOSED" | "DECIDED">("DECIDED");
  const [owner, setOwner] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const problem = validateDecisionInput({ title, decision, context });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await workRequest<Decision>("work-decisions", "", {
          method: "POST",
          body: buildCreateDecisionPayload({
            title,
            decision,
            context,
            status,
            ownerEmployeeId: owner,
            meetingId: meeting?.id,
            projectId,
            ...link,
          }),
        }),
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
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Record decision
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={meeting ? `Record decision for ${meeting.title}` : "New decision"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextField
          label="Title"
          maxLength={MAX_TITLE}
          onChange={setTitle}
          required
          value={title}
        />
        <TextAreaField
          label="Context"
          onChange={setContext}
          rows={3}
          value={context}
        />
        <TextAreaField
          label="Decision"
          onChange={setDecision}
          required
          rows={4}
          value={decision}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Status"
            onChange={(value) => setStatus(value as "PROPOSED" | "DECIDED")}
            options={STATUS_OPTIONS}
            value={status}
          />
          <EmployeeLookupField
            label="Owner"
            onChange={setOwner}
            people={people}
            value={owner}
          />
        </div>
        <SelectField
          label="Project"
          onChange={setProjectId}
          options={[
            { value: "", label: "No project" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={projectId}
        />
      </div>
    </Dialog>
  );
}
