"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { workRequest } from "../../../work/_lib/work-client";
import {
  CADENCE_LABELS,
  SOURCE_LABELS,
  deadlineLabel,
  escalationLabel,
  workingDaysLabel,
  type EffectivePolicy,
} from "../../../work/_lib/daily-updates";
import type { PersonOption } from "../../../work/_lib/people";
import { EmployeeLookupField } from "../../../work/_components/duty-people-field";

/** The policy that governs one chosen person, and which scope it came from. */
export function DailyUpdateEffectivePolicy({
  people,
}: {
  people: PersonOption[];
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    if (!employeeId) {
      setError("Choose an employee.");
      return;
    }
    setLoading(true);
    setError(null);
    setPolicy(null);
    try {
      setPolicy(
        await workRequest<EffectivePolicy>(
          "daily-updates",
          `/policy/effective?employeeId=${encodeURIComponent(employeeId)}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Effective policy">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[16rem] flex-1">
            <EmployeeLookupField
              label="Employee"
              onChange={(value) => {
                setEmployeeId(value);
                setPolicy(null);
              }}
              people={people}
              value={employeeId}
            />
          </div>
          <Button loading={loading} onClick={() => void show()} variant="secondary">
            Show effective policy
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {policy ? (
          <div aria-label="Effective policy result" className="grid gap-3" role="group">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="info">{SOURCE_LABELS[policy.source]}</StatusPill>
              <StatusPill tone={policy.enabled ? "good" : "muted"}>
                {policy.enabled ? "Enabled" : "Disabled"}
              </StatusPill>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-muted">Cadence</dt>
                <dd className="text-foreground">{CADENCE_LABELS[policy.cadence]}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Working days</dt>
                <dd className="text-foreground">{workingDaysLabel(policy.workingDays)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Deadline</dt>
                <dd className="text-foreground">{deadlineLabel(policy)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Time zone</dt>
                <dd className="text-foreground">{policy.timezone}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Acknowledgement</dt>
                <dd className="text-foreground">
                  {policy.requireAcknowledgement ? "Required" : "Not required"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Escalation</dt>
                <dd className="text-foreground">{escalationLabel(policy.escalateAfterMinutes)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
