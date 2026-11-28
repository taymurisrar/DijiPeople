"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  MultiSelectField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import {
  MAX_TITLE,
  agendaLocked,
  buildCreateMeetingPayload,
  buildUpdateMeetingPayload,
  toLocalMoment,
  validateMeeting,
  type Meeting,
} from "../_lib/decisions";
import { personSelectOptions, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { EmployeeLookupField } from "./duty-people-field";
import { MomentField } from "./moment-field";

export type ProjectOption = { id: string; name: string };

/**
 * Plan a meeting, or edit one. A held meeting keeps its agenda, time and
 * invitation list, so only its notes are editable; a cancelled one is not offered
 * here at all. The API's own refusal is shown as it arrives.
 */
export function MeetingFormDialog({
  link,
  meeting,
  onClose,
  onSaved,
  people,
  projects,
}: {
  /** Work item or blocker the meeting is being planned for, from the screen's context. */
  link?: { workItemId?: string; blockerId?: string };
  meeting: Meeting | null;
  onClose: () => void;
  onSaved: (meeting: Meeting) => void;
  people: readonly PersonOption[];
  projects: readonly ProjectOption[];
}) {
  const locked = meeting ? agendaLocked(meeting) : false;
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    toLocalMoment(meeting?.scheduledAt),
  );
  const [facilitator, setFacilitator] = useState(
    meeting?.facilitatorEmployeeId ?? "",
  );
  const [attendees, setAttendees] = useState<string[]>(
    meeting?.attendees.map((a) => a.employeeId) ?? [],
  );
  const [projectId, setProjectId] = useState(meeting?.projectId ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!locked) {
      const problem = validateMeeting({
        title,
        agenda,
        scheduledAt,
        attendeeIds: attendees,
      });
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const saved = meeting
        ? await workRequest<Meeting>("work-meetings", `/${meeting.id}`, {
            method: "PATCH",
            body: buildUpdateMeetingPayload(meeting, {
              title,
              agenda,
              scheduledAt,
              facilitatorEmployeeId: facilitator,
              attendeeIds: attendees,
              notes,
            }),
          })
        : await workRequest<Meeting>("work-meetings", "", {
            method: "POST",
            body: buildCreateMeetingPayload({
              title,
              agenda,
              scheduledAt,
              facilitatorEmployeeId: facilitator,
              attendeeIds: attendees,
              projectId,
              ...link,
            }),
          });
      onSaved(saved);
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
            {meeting ? "Save meeting" : "Create meeting"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={meeting ? "Edit meeting" : "New meeting"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {locked ? (
          <TextAreaField label="Notes" onChange={setNotes} rows={6} value={notes} />
        ) : (
          <>
            <TextField
              label="Title"
              maxLength={MAX_TITLE}
              onChange={setTitle}
              required
              value={title}
            />
            <MomentField
              label="Scheduled"
              onChange={setScheduledAt}
              required
              value={scheduledAt}
            />
            <TextAreaField
              label="Agenda"
              onChange={setAgenda}
              rows={5}
              value={agenda}
            />
            <EmployeeLookupField
              label="Facilitator"
              onChange={setFacilitator}
              people={people}
              value={facilitator}
            />
            <MultiSelectField
              label="Attendees"
              onChange={setAttendees}
              options={personSelectOptions(people)}
              value={attendees}
            />
            {meeting ? null : (
              <SelectField
                label="Project"
                onChange={setProjectId}
                options={[
                  { value: "", label: "No project" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={projectId}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
