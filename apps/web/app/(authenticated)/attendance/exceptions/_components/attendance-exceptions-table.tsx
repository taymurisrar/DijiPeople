"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPill } from "@/app/components/ui/status-pill";
import { useGovernedInput } from "@/app/components/feedback/use-governed-input";
import {
  exceptionStatusLabel,
  exceptionTypeLabel,
  severityLabel,
  severityTone,
  statusTone,
  type AttendanceExceptionRow,
} from "../_lib/types";

/**
 * The triage list.
 *
 * Actions are only offered where they are valid. A resolved exception shows no
 * buttons: it is a historical record, not a task, and there is deliberately no
 * delete — the reason a correction exists is part of the audit trail for
 * attendance that was eventually paid.
 */
export function AttendanceExceptionsTable({
  items,
  total,
  page,
  pageSize,
  canManage,
}: {
  items: AttendanceExceptionRow[];
  total: number;
  page: number;
  pageSize: number;
  canManage: boolean;
}) {
  const { requestValue, governedInputDialog } = useGovernedInput();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    id: string,
    status: "RESOLVED" | "IGNORED",
  ): Promise<void> {
    // A reason is required for anything that closes an item: "resolved" with no
    // explanation is indistinguishable from "clicked to clear the list". The
    // dialog enforces that rather than leaving it to a check after the fact,
    // and it can tell "cancelled" from "typed nothing". ITEM-0031.
    const note = await requestValue({
      title: status === "RESOLVED" ? "Resolve exception" : "Ignore exception",
      description: "This note is kept with the record.",
      label:
        status === "RESOLVED"
          ? "How was this resolved?"
          : "Why is this being ignored?",
      confirmLabel: status === "RESOLVED" ? "Resolve" : "Ignore",
    });

    if (note === null) return;
    if (!note.trim()) {
      setError("A short note is required so the decision can be understood later.");
      return;
    }

    setBusyId(id);
    setError(null);

    try {
      const response = await fetch(
        `/api/attendance/engine/exceptions/${id}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, note: note.trim() }),
        },
      );

      if (!response.ok) {
        setError("That could not be saved. Try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("That could not be saved. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing needs attention here. Try widening the date range or changing the
        status filter.
      </p>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="grid gap-4">
      {governedInputDialog}
      {error ? (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <Th>Employee</Th>
              <Th>Date</Th>
              <Th>Work site</Th>
              <Th>Exception</Th>
              <Th>Severity</Th>
              <Th>Status</Th>
              <Th>Detected</Th>
              {canManage ? <Th>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-b border-border/60" key={item.id}>
                <Td>
                  <span className="font-medium text-foreground">
                    {item.employee.name}
                  </span>
                  {item.employee.employeeCode ? (
                    <span className="block text-xs text-muted">
                      {item.employee.employeeCode}
                    </span>
                  ) : null}
                </Td>
                <Td>{formatDate(item.attendanceDate)}</Td>
                <Td>{item.workSite?.name ?? "—"}</Td>
                <Td>
                  <Link
                    className="font-medium text-accent hover:underline"
                    href={`/attendance/exceptions/${item.id}`}
                  >
                    {exceptionTypeLabel(item.type)}
                  </Link>
                  <span className="block text-xs text-muted">{item.message}</span>
                </Td>
                <Td>
                  <StatusPill tone={severityTone(item.severity)}>
                    {severityLabel(item.severity)}
                  </StatusPill>
                </Td>
                <Td>
                  <StatusPill tone={statusTone(item.status)}>
                    {exceptionStatusLabel(item.status)}
                  </StatusPill>
                </Td>
                <Td>{formatDateTime(item.detectedAt)}</Td>
                {canManage ? (
                  <Td>
                    {item.status === "OPEN" ? (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-strong"
                          href={`/attendance/exceptions/${item.id}`}
                        >
                          Review
                        </Link>
                        <button
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-strong disabled:opacity-50"
                          disabled={busyId === item.id}
                          onClick={() => void act(item.id, "RESOLVED")}
                          type="button"
                        >
                          Resolve
                        </button>
                        <button
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-strong disabled:opacity-50"
                          disabled={busyId === item.id}
                          onClick={() => void act(item.id, "IGNORED")}
                          type="button"
                        >
                          Ignore
                        </button>
                      </div>
                    ) : (
                      // Kept, never deleted. Closed items stay as the record of
                      // what was decided and why.
                      <span className="text-xs text-muted">Closed</span>
                    )}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted">
        Showing {from}–{to} of {total}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
