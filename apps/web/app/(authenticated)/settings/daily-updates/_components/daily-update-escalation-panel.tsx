"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { DateField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { workRequest } from "../../../work/_lib/work-client";
import {
  escalationRows,
  type EscalationSummary,
} from "../../../work/_lib/daily-updates";

/**
 * Run the missed-update escalation for the whole tenant now. Idempotent: a day
 * already escalated is counted, not notified again. The counts the API returns are
 * shown as they arrive.
 */
export function DailyUpdateEscalationPanel() {
  const [date, setDate] = useState("");
  const [summary, setSummary] = useState<EscalationSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setSummary(
        await workRequest<EscalationSummary>(
          "daily-updates",
          "/escalations/run",
          { method: "POST", body: date ? { date } : {} },
        ),
      );
    } catch (e) {
      setSummary(null);
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <SectionCard title="Escalation">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="Day" onChange={setDate} value={date} />
          <Button loading={running} onClick={() => void run()}>
            Run escalation now
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {summary ? (
          <ul aria-label="Escalation result" className="grid gap-2 sm:grid-cols-5">
            {escalationRows(summary).map((row) => (
              <li
                className="rounded-xl border border-border p-3 text-sm"
                key={row.label}
              >
                <span className="block text-muted">{row.label}</span>
                <span className="text-lg font-semibold text-foreground">{row.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionCard>
  );
}
