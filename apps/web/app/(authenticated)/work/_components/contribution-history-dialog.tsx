"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  STATE_LABELS,
  VERIFICATION_LABELS,
  describeAmount,
  stateTone,
  verificationTone,
  type ContributionDetail,
  type ContributionEntry,
} from "../_lib/contributions";
import { workRequest } from "../_lib/work-client";

/** The revision chain of one entry, oldest first, with what was said at each step. */
export function ContributionHistoryDialog({
  entry,
  onClose,
}: {
  entry: ContributionEntry;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ContributionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workRequest<ContributionDetail>("contributions", `/${entry.id}`)
      .then((value) => {
        if (!cancelled) setDetail(value);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "The request failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const shown = detail ?? entry;

  return (
    <Dialog
      footer={<Button onClick={onClose}>Close</Button>}
      onClose={onClose}
      open
      title="Entry history"
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Recorded</dt>
            <dd className="text-foreground">{formatDateTime(shown.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Amount</dt>
            <dd className="text-foreground">{describeAmount(shown)}</dd>
          </div>
          <div>
            <dt className="text-muted">Verification</dt>
            <dd>
              <StatusPill tone={verificationTone(shown.verification)}>
                {VERIFICATION_LABELS[shown.verification]}
              </StatusPill>
            </dd>
          </div>
          <div>
            <dt className="text-muted">State</dt>
            <dd>
              <StatusPill tone={stateTone(shown.state)}>
                {STATE_LABELS[shown.state]}
              </StatusPill>
            </dd>
          </div>
          {shown.note ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Note</dt>
              <dd className="text-foreground">{shown.note}</dd>
            </div>
          ) : null}
          {shown.correctionReason ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Correction reason</dt>
              <dd className="text-foreground">{shown.correctionReason}</dd>
            </div>
          ) : null}
          {shown.reviewNote ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Review note</dt>
              <dd className="text-foreground">{shown.reviewNote}</dd>
            </div>
          ) : null}
        </dl>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revisions</h3>
          {detail ? (
            <ol aria-label="Revisions" className="mt-2 grid gap-2">
              {detail.history.map((revision) => (
                <li
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                  key={revision.id}
                >
                  <span>{`Revision ${revision.revision}`}</span>
                  <StatusPill tone={stateTone(revision.state)}>
                    {STATE_LABELS[revision.state] ?? revision.state}
                  </StatusPill>
                </li>
              ))}
            </ol>
          ) : error ? null : (
            <p className="mt-2 text-sm text-muted" role="status">
              Loading history
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
