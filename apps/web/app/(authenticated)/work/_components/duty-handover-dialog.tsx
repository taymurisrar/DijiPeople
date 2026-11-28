"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { SelectField, TextAreaField } from "@/app/components/ui/form-control";
import { buildHandoverPayload, type TeamOption } from "../_lib/duties";
import { workRequest } from "../_lib/work-client";
import { EmployeeLookupField } from "./duty-people-field";

const TARGET_OPTIONS = [
  { value: "person", label: "A person" },
  { value: "team", label: "A team" },
];

/**
 * Hand a duty over to one person or one team, with a note. The API refuses a
 * handover to yourself or to someone who does not exist, and its message is
 * shown as it arrives.
 */
export function DutyHandoverDialog({
  occurrenceId,
  occurrenceTitle,
  onClose,
  onDone,
  teams,
}: {
  occurrenceId?: string;
  occurrenceTitle?: string;
  onClose: () => void;
  onDone: () => void;
  teams: TeamOption[];
}) {
  const [target, setTarget] = useState<"person" | "team">("person");
  const [toEmployeeId, setToEmployeeId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const built = buildHandoverPayload({
      target,
      toEmployeeId,
      teamId,
      note,
      occurrenceId,
    });
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await workRequest("work-duties", "/handovers", {
        method: "POST",
        body: built.body,
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
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Hand over
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={occurrenceTitle ? `Hand over: ${occurrenceTitle}` : "New handover"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <SelectField
          label="Hand over to"
          onChange={(value) => setTarget(value === "team" ? "team" : "person")}
          options={TARGET_OPTIONS}
          value={target}
        />
        {target === "person" ? (
          <EmployeeLookupField
            label="Person"
            onChange={setToEmployeeId}
            people={[]}
            required
            source="handover-recipients"
            value={toEmployeeId}
          />
        ) : (
          <SelectField
            label="Team"
            onChange={setTeamId}
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            required
            value={teamId}
          />
        )}
        <TextAreaField
          label="Note"
          onChange={setNote}
          required
          rows={4}
          value={note}
        />
      </div>
    </Dialog>
  );
}
