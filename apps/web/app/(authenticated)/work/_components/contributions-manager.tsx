"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { DateField } from "@/app/components/ui/form-control";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { formatNumber } from "@/lib/formatting-context";
import {
  buildContributionsQuery,
  buildReasonPayload,
  buildSummaryQuery,
  formatDuration,
  isLiveEntry,
  validateReason,
  weekRange,
  type ContributionEntry,
  type ContributionPage,
  type ContributionSummary,
} from "../_lib/contributions";
import { workRequest } from "../_lib/work-client";
import { ContributionFormDialog } from "./contribution-form-dialog";
import { ContributionHistoryDialog } from "./contribution-history-dialog";
import { ContributionsTable } from "./contributions-table";
import { NoteDialog } from "./note-dialog";
import { SummaryTile } from "./summary-tile";

type Pending =
  | { kind: "record" }
  | { kind: "correct"; entry: ContributionEntry }
  | { kind: "history"; entry: ContributionEntry }
  | { kind: "withdraw"; entry: ContributionEntry }
  | { kind: "dispute"; entry: ContributionEntry };

function dateInputOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The employee's own evidence for a week: the totals the API computes (verified,
 * unverified, disputed, overlap removed, downtime, quantities in their own
 * units), the entries behind them, and the ways to record, correct, withdraw or
 * dispute one. Nothing here decides what counts; the API does.
 */
export function ContributionsManager({
  canWrite,
  initialEntries,
  initialSummary,
  initialWeek,
}: {
  canWrite: boolean;
  initialEntries: ContributionEntry[];
  initialSummary: ContributionSummary;
  initialWeek: { from: string; to: string };
}) {
  const [week, setWeek] = useState(initialWeek);
  const [summary, setSummary] = useState(initialSummary);
  const [entries, setEntries] = useState(initialEntries);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: { from: string; to: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, page] = await Promise.all([
        workRequest<ContributionSummary>(
          "contributions",
          `/summary?${buildSummaryQuery(range)}`,
        ),
        workRequest<ContributionPage>(
          "contributions",
          `?${buildContributionsQuery(range)}`,
        ),
      ]);
      setSummary(nextSummary);
      setEntries(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const changeWeek = (date: string) => {
    if (!date) return;
    const range = weekRange(new Date(`${date}T12:00:00.000Z`));
    setWeek(range);
    void load(range);
  };

  const done = () => {
    setPending(null);
    void load(week);
  };

  const time = summary.time;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateField
          label="Week containing"
          onChange={changeWeek}
          value={dateInputOf(week.from)}
        />
        {canWrite ? (
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setPending({ kind: "record" })}
          >
            Record entry
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-busy={loading} aria-label="Week summary" className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryTile label="Verified time" value={formatDuration(time.verifiedMinutes)} />
          <SummaryTile
            label="Unverified time"
            value={formatDuration(time.unverifiedMinutes)}
          />
          <SummaryTile label="Disputed time" value={formatDuration(time.disputedMinutes)} />
          <SummaryTile
            label="Overlap removed"
            value={formatDuration(time.overlapRemovedMinutes)}
          />
          <SummaryTile label="Downtime" value={formatDuration(time.downtimeMinutes)} />
          <SummaryTile label="Blocked" value={formatDuration(time.blockedMinutes)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryTile label="Occurrences" value={formatNumber(summary.occurrences)} />
          <SummaryTile label="Entries" value={formatNumber(summary.entries)} />
          {summary.quantities.map((quantity) => (
            <SummaryTile
              detail={`Unverified ${quantity.unverified}, disputed ${quantity.disputed}`}
              key={quantity.unitKey}
              label={`Quantity: ${quantity.unitKey}`}
              value={`${quantity.verified} verified`}
            />
          ))}
        </div>
      </section>

      <SectionCard title="Entries">
        <ContributionsTable
          emptyState={
            <EmptyState
              action={
                canWrite ? (
                  <Button onClick={() => setPending({ kind: "record" })}>
                    Record entry
                  </Button>
                ) : undefined
              }
              description="Entries you record for this week appear here."
              title="No evidence recorded"
            />
          }
          entityLogicalName="my-contributions"
          renderActions={(row) => (
            <>
              <Button
                aria-label={`History: ${row.workKind} ${row.occurredAt}`}
                onClick={() => setPending({ kind: "history", entry: row })}
                size="xs"
                variant="outline"
              >
                History
              </Button>
              {canWrite && isLiveEntry(row) ? (
                <>
                  <Button
                    aria-label={`Correct: ${row.workKind} ${row.occurredAt}`}
                    onClick={() => setPending({ kind: "correct", entry: row })}
                    size="xs"
                    variant="outline"
                  >
                    Correct
                  </Button>
                  <Button
                    aria-label={`Withdraw: ${row.workKind} ${row.occurredAt}`}
                    onClick={() => setPending({ kind: "withdraw", entry: row })}
                    size="xs"
                    variant="danger-soft"
                  >
                    Withdraw
                  </Button>
                  <Button
                    aria-label={`Dispute: ${row.workKind} ${row.occurredAt}`}
                    onClick={() => setPending({ kind: "dispute", entry: row })}
                    size="xs"
                    variant="outline"
                  >
                    Dispute
                  </Button>
                </>
              ) : null}
            </>
          )}
          rows={entries}
        />
      </SectionCard>

      {pending?.kind === "record" ? (
        <ContributionFormDialog onClose={() => setPending(null)} onDone={done} />
      ) : null}
      {pending?.kind === "correct" ? (
        <ContributionFormDialog
          entry={pending.entry}
          onClose={() => setPending(null)}
          onDone={done}
        />
      ) : null}
      {pending?.kind === "history" ? (
        <ContributionHistoryDialog
          entry={pending.entry}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === "withdraw" ? (
        <NoteDialog
          confirmLabel="Withdraw entry"
          fieldLabel="Reason for withdrawing"
          onClose={() => setPending(null)}
          onConfirm={async (text) => {
            await workRequest("contributions", `/${pending.entry.id}/withdraw`, {
              method: "POST",
              body: buildReasonPayload(text),
            });
            done();
          }}
          title="Withdraw entry"
          validate={validateReason}
        />
      ) : null}
      {pending?.kind === "dispute" ? (
        <NoteDialog
          confirmLabel="Dispute entry"
          fieldLabel="Reason for disputing"
          onClose={() => setPending(null)}
          onConfirm={async (text) => {
            await workRequest("contributions", `/${pending.entry.id}/dispute`, {
              method: "POST",
              body: buildReasonPayload(text),
            });
            done();
          }}
          title="Dispute entry"
          validate={validateReason}
        />
      ) : null}
    </div>
  );
}
