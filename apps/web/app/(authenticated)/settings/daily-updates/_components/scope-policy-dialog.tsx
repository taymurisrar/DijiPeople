"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  CheckboxField,
  SelectField,
  TextField,
  TimeField,
} from "@/app/components/ui/form-control";
import { workRequest } from "../../../work/_lib/work-client";
import {
  CADENCES,
  CADENCE_LABELS,
  WEEKDAY_LABELS,
  buildScopePolicyPayload,
  minutesToTime,
  scopeTargetOf,
  validateScopePolicy,
  type Cadence,
  type ScopePolicy,
} from "../../../work/_lib/daily-updates";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ScopeOption = { id: string; name: string };

/**
 * Create or change the policy of one team or one business unit. The target of an
 * existing policy is fixed: changing who it governs would be a different policy.
 */
export function ScopePolicyDialog({
  businessUnits,
  existing,
  onClose,
  onSaved,
  teams,
}: {
  businessUnits: readonly ScopeOption[];
  existing: ScopePolicy | null;
  onClose: () => void;
  onSaved: (policy: ScopePolicy) => void;
  teams: readonly ScopeOption[];
}) {
  const target = existing ? scopeTargetOf(existing) : null;
  const [targetKind, setTargetKind] = useState<"TEAM" | "BUSINESS_UNIT">(
    target?.kind ?? "TEAM",
  );
  const [targetId, setTargetId] = useState(target?.id ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [cadence, setCadence] = useState<Cadence>(
    existing?.cadence ?? "WORKING_DAYS",
  );
  const [workingDays, setWorkingDays] = useState<number[]>(
    existing?.workingDays ?? [1, 2, 3, 4, 5],
  );
  const [deadlineTime, setDeadlineTime] = useState(
    minutesToTime(existing?.deadlineMinutes ?? 1080),
  );
  const [deadlineMinutes, setDeadlineMinutes] = useState(
    String(existing?.deadlineMinutes ?? 60),
  );
  const [timezone, setTimezone] = useState(existing?.timezone ?? "UTC");
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(
    existing?.requireAcknowledgement ?? false,
  );
  const [escalateAfter, setEscalateAfter] = useState(
    existing?.escalateAfterMinutes === null || existing === null
      ? ""
      : String(existing.escalateAfterMinutes),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = targetKind === "TEAM" ? teams : businessUnits;

  const toggleDay = (day: number, on: boolean) =>
    setWorkingDays((current) =>
      on ? [...new Set([...current, day])] : current.filter((d) => d !== day),
    );

  const save = async () => {
    const input = {
      targetKind,
      targetId,
      enabled,
      cadence,
      workingDays,
      deadlineTime,
      deadlineMinutes,
      timezone,
      requireAcknowledgement,
      escalateAfter,
    };
    const problem = validateScopePolicy(input);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await workRequest<ScopePolicy>("daily-updates", "/scope-policies", {
          method: "PUT",
          body: buildScopePolicyPayload(input),
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
            Save scoped policy
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={existing ? "Edit scoped policy" : "New scoped policy"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            disabled={existing !== null}
            label="Applies to"
            onChange={(value) => {
              setTargetKind(value as "TEAM" | "BUSINESS_UNIT");
              setTargetId("");
            }}
            options={[
              { value: "TEAM", label: "Team" },
              { value: "BUSINESS_UNIT", label: "Business unit" },
            ]}
            value={targetKind}
          />
          <SelectField
            disabled={existing !== null}
            label={targetKind === "TEAM" ? "Team" : "Business unit"}
            onChange={setTargetId}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
            required
            value={targetId}
          />
        </div>
        <CheckboxField checked={enabled} label="Enabled" onChange={setEnabled} />
        <SelectField
          label="Cadence"
          onChange={(value) => setCadence(value as Cadence)}
          options={CADENCES.map((c) => ({ value: c, label: CADENCE_LABELS[c] }))}
          value={cadence}
        />
        {cadence === "WORKING_DAYS" ? (
          <fieldset aria-label="Working days" className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">
              Working days
            </legend>
            <div className="grid gap-2 sm:grid-cols-4">
              {DAYS.map((day) => (
                <CheckboxField
                  checked={workingDays.includes(day)}
                  key={day}
                  label={WEEKDAY_LABELS[day]}
                  onChange={(on) => toggleDay(day, on)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {cadence === "WORKING_DAYS" ? (
            <TimeField
              label="Deadline"
              onChange={setDeadlineTime}
              required
              value={deadlineTime}
            />
          ) : (
            <TextField
              label="Deadline (minutes after shift)"
              onChange={setDeadlineMinutes}
              required
              value={deadlineMinutes}
            />
          )}
          <TextField
            label="Time zone"
            maxLength={64}
            onChange={setTimezone}
            placeholder="Asia/Karachi"
            required
            value={timezone}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Escalate after (minutes)"
            onChange={setEscalateAfter}
            placeholder="Never"
            value={escalateAfter}
          />
          <div className="self-end">
            <CheckboxField
              checked={requireAcknowledgement}
              label="Require acknowledgement"
              onChange={setRequireAcknowledgement}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
