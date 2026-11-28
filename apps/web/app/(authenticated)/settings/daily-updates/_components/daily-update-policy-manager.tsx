"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  TextField,
  TimeField,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { workRequest } from "../../../work/_lib/work-client";
import {
  WEEKDAY_LABELS,
  buildPolicyPayload,
  minutesToTime,
  validatePolicy,
  type DailyUpdatePolicy,
} from "../../../work/_lib/daily-updates";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The tenant's daily update policy: one record, saved as a whole. */
export function DailyUpdatePolicyManager({
  initialPolicy,
}: {
  initialPolicy: DailyUpdatePolicy;
}) {
  const [enabled, setEnabled] = useState(initialPolicy.enabled);
  const [workingDays, setWorkingDays] = useState<number[]>(
    initialPolicy.workingDays,
  );
  const [deadlineTime, setDeadlineTime] = useState(
    minutesToTime(initialPolicy.deadlineMinutes),
  );
  const [timezone, setTimezone] = useState(initialPolicy.timezone);
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(
    initialPolicy.requireAcknowledgement,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleDay = (day: number, on: boolean) =>
    setWorkingDays((current) =>
      on ? [...new Set([...current, day])] : current.filter((d) => d !== day),
    );

  const save = async () => {
    const problem = validatePolicy({ workingDays, deadlineTime, timezone });
    if (problem) {
      setError(problem);
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await workRequest<DailyUpdatePolicy>(
        "daily-updates",
        "/policy",
        {
          method: "PUT",
          body: buildPolicyPayload({
            enabled,
            workingDays,
            deadlineTime,
            timezone,
            requireAcknowledgement,
          }),
        },
      );
      setEnabled(next.enabled);
      setWorkingDays(next.workingDays);
      setDeadlineTime(minutesToTime(next.deadlineMinutes));
      setTimezone(next.timezone);
      setRequireAcknowledgement(next.requireAcknowledgement);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <SectionCard title="Policy">
        <div className="grid gap-5">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-foreground" role="status">
              Policy saved.
            </p>
          ) : null}
          <CheckboxField
            checked={enabled}
            label="Daily updates enabled"
            onChange={setEnabled}
          />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <TimeField
              label="Deadline"
              onChange={setDeadlineTime}
              required
              value={deadlineTime}
            />
            <TextField
              label="Time zone"
              maxLength={64}
              onChange={setTimezone}
              placeholder="Asia/Karachi"
              required
              value={timezone}
            />
          </div>
          <CheckboxField
            checked={requireAcknowledgement}
            label="Require acknowledgement"
            onChange={setRequireAcknowledgement}
          />
          <div className="flex justify-end">
            <Button loading={saving} onClick={() => void save()}>
              Save policy
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
