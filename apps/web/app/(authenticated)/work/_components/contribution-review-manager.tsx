"use client";

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  buildContributionsQuery,
  buildReviewPayload,
  isLiveEntry,
  validateReview,
  type ContributionEntry,
  type ContributionPage,
  type ReviewDecision,
} from "../_lib/contributions";
import type { PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { ContributionHistoryDialog } from "./contribution-history-dialog";
import { ContributionsTable } from "./contributions-table";
import { NoteDialog } from "./note-dialog";

type Pending =
  | { kind: "note"; entry: ContributionEntry; decision: "REJECTED" | "DISPUTED" }
  | { kind: "history"; entry: ContributionEntry };

/**
 * The unverified evidence of the people in the reviewer's reach. The API decides
 * who is in reach and refuses a review of the reviewer's own entry; its message
 * is shown as it arrives. Rejecting or disputing needs a note.
 */
export function ContributionReviewManager({
  initialEntries,
  people,
}: {
  initialEntries: ContributionEntry[];
  people: PersonOption[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const reload = useCallback(async () => {
    const page = await workRequest<ContributionPage>(
      "contributions",
      `?${buildContributionsQuery({ verification: "UNVERIFIED" })}`,
    );
    setEntries(page.items);
  }, []);

  const review = async (
    entry: ContributionEntry,
    decision: ReviewDecision,
    note: string,
  ) => {
    await workRequest("contributions", `/${entry.id}/review`, {
      method: "POST",
      body: buildReviewPayload(decision, note),
    });
    await reload();
  };

  const verify = async (entry: ContributionEntry) => {
    setBusyId(entry.id);
    setError(null);
    try {
      await review(entry, "VERIFIED", "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid gap-4">
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <ContributionsTable
        emptyState={
          <EmptyState
            description="Evidence from the people in your reach that is waiting for review appears here."
            title="Nothing to review"
          />
        }
        entityLogicalName="contribution-review"
        people={people}
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
            {isLiveEntry(row) ? (
              <>
                <Button
                  aria-label={`Verify: ${row.workKind} ${row.occurredAt}`}
                  disabled={busyId !== null}
                  loading={busyId === row.id}
                  onClick={() => void verify(row)}
                  size="xs"
                  variant="primary"
                >
                  Verify
                </Button>
                <Button
                  aria-label={`Reject: ${row.workKind} ${row.occurredAt}`}
                  disabled={busyId !== null}
                  onClick={() =>
                    setPending({ kind: "note", entry: row, decision: "REJECTED" })
                  }
                  size="xs"
                  variant="danger-soft"
                >
                  Reject
                </Button>
                <Button
                  aria-label={`Dispute: ${row.workKind} ${row.occurredAt}`}
                  disabled={busyId !== null}
                  onClick={() =>
                    setPending({ kind: "note", entry: row, decision: "DISPUTED" })
                  }
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

      {pending?.kind === "note" ? (
        <NoteDialog
          confirmLabel={pending.decision === "REJECTED" ? "Reject entry" : "Dispute entry"}
          fieldLabel="Review note"
          onClose={() => setPending(null)}
          onConfirm={async (text) => {
            await review(pending.entry, pending.decision, text);
            setPending(null);
          }}
          title={pending.decision === "REJECTED" ? "Reject entry" : "Dispute entry"}
          validate={(text) => validateReview(pending.decision, text)}
        />
      ) : null}
      {pending?.kind === "history" ? (
        <ContributionHistoryDialog
          entry={pending.entry}
          onClose={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}
