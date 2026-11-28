"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  DECISION_STATUS_LABELS,
  canAddAction,
  canConfirm,
  canReverse,
  canSupersede,
  decisionTone,
  hasChain,
  reversalNote,
  type DecisionDetail,
} from "../_lib/decisions";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { DecisionChain } from "./decision-chain";

export type DecisionActKind = "supersede" | "reverse" | "action";

/**
 * One decision with its meeting, its actions and its chain. A link the caller
 * cannot see simply is not shown (the API sends it as null), and a chain step the
 * caller cannot see reads "Not visible"; neither is an error.
 */
export function DecisionDetailDialog({
  canWrite,
  decisionId,
  onChanged,
  onClose,
  onNavigate,
  onAct,
  people,
  reloadKey,
}: {
  canWrite: boolean;
  decisionId: string;
  onAct: (kind: DecisionActKind, detail: DecisionDetail) => void;
  onChanged: () => void;
  onClose: () => void;
  onNavigate: (id: string) => void;
  people: readonly PersonOption[];
  reloadKey: number;
}) {
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(
        await workRequest<DecisionDetail>("work-decisions", `/${decisionId}`),
      );
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [decisionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const confirmDecision = async () => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await workRequest("work-decisions", `/${detail.id}/decide`, {
        method: "POST",
      });
      onChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const manage = canWrite && detail !== null;
  const reversal = detail ? reversalNote(detail) : null;

  return (
    <Dialog
      busy={busy}
      footer={
        <>
          {manage && detail && canConfirm(detail) ? (
            <Button loading={busy} onClick={() => void confirmDecision()}>
              Confirm decision
            </Button>
          ) : null}
          {manage && detail && canAddAction(detail) ? (
            <Button onClick={() => onAct("action", detail)} variant="secondary">
              Add action
            </Button>
          ) : null}
          {manage && detail && canSupersede(detail) ? (
            <Button onClick={() => onAct("supersede", detail)} variant="secondary">
              Supersede
            </Button>
          ) : null}
          {manage && detail && canReverse(detail) ? (
            <Button onClick={() => onAct("reverse", detail)} variant="secondary">
              Reverse
            </Button>
          ) : null}
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="xl"
      title={detail ? detail.title : "Decision"}
    >
      {loading && !detail ? (
        <div
          aria-busy="true"
          aria-label="Loading decision"
          className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
          role="status"
        />
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {detail ? (
        <div aria-busy={loading} className="grid gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={decisionTone(detail.status)}>
              {DECISION_STATUS_LABELS[detail.status]}
            </StatusPill>
            {detail.decidedAt ? (
              <span className="text-sm text-muted">{`Decided ${formatDateTime(detail.decidedAt)}`}</span>
            ) : null}
            <span className="text-sm text-foreground">
              {`Owner ${personLabel(people, detail.ownerEmployeeId)}`}
            </span>
          </div>
          {reversal ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="note"
            >
              {`Reversed: ${reversal}`}
            </p>
          ) : null}
          <section aria-label="Decision text" className="grid gap-1">
            <h3 className="text-sm font-semibold text-foreground">Decision</h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {detail.decision}
            </p>
          </section>
          {detail.context ? (
            <section aria-label="Context" className="grid gap-1">
              <h3 className="text-sm font-semibold text-foreground">Context</h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {detail.context}
              </p>
            </section>
          ) : null}
          {detail.meeting ? (
            <section aria-label="Meeting" className="grid gap-1">
              <h3 className="text-sm font-semibold text-foreground">Meeting</h3>
              <a
                className="text-sm font-medium text-accent underline"
                href={`/work/meetings`}
              >
                {detail.meeting.title}
              </a>
            </section>
          ) : null}
          <section aria-label="Actions" className="grid gap-2">
            <h3 className="text-sm font-semibold text-foreground">Actions</h3>
            {detail.actions.length === 0 ? (
              <p className="text-sm text-muted">No actions</p>
            ) : (
              <ul aria-label="Decision actions" className="grid gap-2">
                {detail.actions.map((action) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                    key={action.workItemId}
                  >
                    <span className="break-words font-medium text-foreground">
                      {action.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-muted">
                      <span>{personLabel(people, action.ownerEmployeeId)}</span>
                      {action.dueAt ? (
                        <span>{`Due ${formatDateTime(action.dueAt)}`}</span>
                      ) : null}
                      <StatusPill
                        tone={action.status === "DONE" ? "good" : "info"}
                      >
                        {action.status}
                      </StatusPill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {hasChain(detail) ? (
            <section aria-label="Chain" className="grid gap-2">
              <h3 className="text-sm font-semibold text-foreground">Chain</h3>
              <DecisionChain detail={detail} onOpen={onNavigate} />
            </section>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
