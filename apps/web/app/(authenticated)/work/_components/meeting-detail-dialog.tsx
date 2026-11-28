"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { CheckboxField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  DECISION_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  buildAttendancePayload,
  buildDecisionsQuery,
  canEditMeeting,
  canHoldOrCancel,
  canRecordAttendance,
  canRecordDecision,
  decisionTone,
  meetingTone,
  type Decision,
  type Meeting,
  type Page,
} from "../_lib/decisions";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";

/**
 * One meeting: its agenda, who was invited and who came, and the decisions taken in
 * it. A meeting the caller cannot see is a 404 from the API and is shown as such.
 */
export function MeetingDetailDialog({
  canWrite,
  meetingId,
  onClose,
  onEdit,
  onHoldOrCancel,
  onRecordDecision,
  people,
  reloadKey,
}: {
  canWrite: boolean;
  meetingId: string;
  onClose: () => void;
  onEdit: (meeting: Meeting) => void;
  onHoldOrCancel: (kind: "hold" | "cancel", meeting: Meeting) => void;
  onRecordDecision: (meeting: Meeting) => void;
  people: readonly PersonOption[];
  reloadKey: number;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [attended, setAttended] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [row, taken] = await Promise.all([
        workRequest<Meeting>("work-meetings", `/${meetingId}`),
        workRequest<Page<Decision>>(
          "work-decisions",
          `?${buildDecisionsQuery({ meetingId, take: 50 })}`,
        ),
      ]);
      setMeeting(row);
      setDecisions(taken.items);
      setAttended(
        new Set(row.attendees.filter((a) => a.attended).map((a) => a.employeeId)),
      );
    } catch (e) {
      setMeeting(null);
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const saveAttendance = async () => {
    if (!meeting) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await workRequest<Meeting>(
        "work-meetings",
        `/${meeting.id}/attendance`,
        { method: "POST", body: buildAttendancePayload(meeting.attendees, attended) },
      );
      setMeeting(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, on: boolean) =>
    setAttended((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const manage = canWrite && meeting !== null;

  return (
    <Dialog
      footer={
        <>
          {manage && meeting && canEditMeeting(meeting) ? (
            <Button onClick={() => onEdit(meeting)} variant="secondary">
              Edit
            </Button>
          ) : null}
          {manage && meeting && canHoldOrCancel(meeting) ? (
            <>
              <Button onClick={() => onHoldOrCancel("hold", meeting)} variant="secondary">
                Hold
              </Button>
              <Button onClick={() => onHoldOrCancel("cancel", meeting)} variant="secondary">
                Cancel meeting
              </Button>
            </>
          ) : null}
          {manage && meeting && canRecordDecision(meeting) ? (
            <Button onClick={() => onRecordDecision(meeting)}>Record decision</Button>
          ) : null}
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="xl"
      title={meeting ? meeting.title : "Meeting"}
    >
      {loading && !meeting ? (
        <div
          aria-busy="true"
          aria-label="Loading meeting"
          className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
          role="status"
        />
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {meeting ? (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={meetingTone(meeting.status)}>
              {MEETING_STATUS_LABELS[meeting.status]}
            </StatusPill>
            <span className="text-sm text-foreground">
              {formatDateTime(meeting.scheduledAt)}
            </span>
            {meeting.heldAt ? (
              <span className="text-sm text-muted">{`Held ${formatDateTime(meeting.heldAt)}`}</span>
            ) : null}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted">Facilitator</dt>
              <dd className="text-foreground">
                {personLabel(people, meeting.facilitatorEmployeeId)}
              </dd>
            </div>
          </dl>
          <section aria-label="Agenda" className="grid gap-1">
            <h3 className="text-sm font-semibold text-foreground">Agenda</h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {meeting.agenda?.trim() || "No agenda"}
            </p>
          </section>
          {meeting.notes ? (
            <section aria-label="Notes" className="grid gap-1">
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {meeting.notes}
              </p>
            </section>
          ) : null}
          <section aria-label="Attendance" className="grid gap-2">
            <h3 className="text-sm font-semibold text-foreground">Attendees</h3>
            {meeting.attendees.length === 0 ? (
              <p className="text-sm text-muted">No attendees invited</p>
            ) : canRecordAttendance(meeting) && canWrite ? (
              <div className="grid gap-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {meeting.attendees.map((a) => (
                    <CheckboxField
                      checked={attended.has(a.employeeId)}
                      key={a.employeeId}
                      label={`${personLabel(people, a.employeeId)} attended`}
                      onChange={(on) => toggle(a.employeeId, on)}
                    />
                  ))}
                </div>
                <div>
                  <Button loading={busy} onClick={() => void saveAttendance()} variant="secondary">
                    Save attendance
                  </Button>
                </div>
                {saved ? (
                  <p className="text-sm text-foreground" role="status">
                    Attendance saved.
                  </p>
                ) : null}
              </div>
            ) : (
              <ul aria-label="Invited people" className="grid gap-1 text-sm">
                {meeting.attendees.map((a) => (
                  <li className="flex flex-wrap items-center gap-2" key={a.employeeId}>
                    <span className="text-foreground">
                      {personLabel(people, a.employeeId)}
                    </span>
                    {meeting.status === "HELD" ? (
                      <StatusPill tone={a.attended ? "good" : "muted"}>
                        {a.attended ? "Attended" : "Absent"}
                      </StatusPill>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Decisions taken" className="grid gap-2">
            <h3 className="text-sm font-semibold text-foreground">Decisions</h3>
            {decisions.length === 0 ? (
              <p className="text-sm text-muted">No decisions recorded</p>
            ) : (
              <ul aria-label="Decisions in this meeting" className="grid gap-2">
                {decisions.map((d) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                    key={d.id}
                  >
                    <a
                      className="text-sm font-medium text-accent underline"
                      href={`/work/decisions?open=${d.id}`}
                    >
                      {d.title}
                    </a>
                    <StatusPill tone={decisionTone(d.status)}>
                      {DECISION_STATUS_LABELS[d.status]}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
