"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
  TimeField,
} from "@/app/components/ui/form-control";
import {
  WEEKDAYS,
  buildTemplatePayload,
  draftFromTemplate,
  emptyTemplateDraft,
  templateKeyFromName,
  timezoneOptions,
  toggleWeekday,
  type DutyTemplate,
  type TeamOption,
  type TemplateDraft,
} from "../_lib/duties";
import type { PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { EmployeeLookupField } from "./duty-people-field";

const NO_TEAM = "";

/**
 * Create or edit a duty template. Editing replaces the checklist for duties
 * generated from now on; duties already generated keep their own copy. The key
 * is fixed once created. The API validates everything again and its message is
 * shown as it arrives.
 */
export function DutyTemplateDialog({
  defaultTimezone,
  onClose,
  onDone,
  people,
  teams,
  template,
}: {
  defaultTimezone: string;
  onClose: () => void;
  onDone: () => void;
  people: PersonOption[];
  teams: TeamOption[];
  template: DutyTemplate | null;
}) {
  const editing = template !== null;
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    template ? draftFromTemplate(template) : emptyTemplateDraft(defaultTimezone),
  );
  const [keyTouched, setKeyTouched] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (next: Partial<TemplateDraft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const setChecklistLabel = (index: number, label: string) =>
    patch({
      checklist: draft.checklist.map((item, i) =>
        i === index ? { ...item, label } : item,
      ),
    });
  const setChecklistRequired = (index: number, required: boolean) =>
    patch({
      checklist: draft.checklist.map((item, i) =>
        i === index ? { ...item, required } : item,
      ),
    });

  const submit = async () => {
    const built = buildTemplatePayload(draft, editing ? "update" : "create");
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await workRequest(
        "work-duties",
        editing ? `/templates/${template.id}` : "/templates",
        { method: editing ? "PATCH" : "POST", body: built.body },
      );
      onDone();
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
          <Button loading={busy} onClick={() => void submit()}>
            {editing ? "Save template" : "Create template"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={editing ? `Edit ${template.name}` : "New duty template"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextField
          label="Name"
          maxLength={200}
          onChange={(name) =>
            patch({
              name,
              ...(keyTouched ? {} : { key: templateKeyFromName(name) }),
            })
          }
          required
          value={draft.name}
        />
        <TextField
          disabled={editing}
          label="Key"
          maxLength={63}
          onChange={(key) => {
            setKeyTouched(true);
            patch({ key });
          }}
          required={!editing}
          value={draft.key}
        />
        <TextAreaField
          label="Description"
          onChange={(description) => patch({ description })}
          rows={3}
          value={draft.description}
        />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-foreground">Weekdays</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WEEKDAYS.map((day) => (
              <CheckboxField
                checked={draft.weekdays.includes(day.value)}
                key={day.value}
                label={day.long}
                onChange={() =>
                  patch({ weekdays: toggleWeekday(draft.weekdays, day.value) })
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Timezone"
            onChange={(timezone) => patch({ timezone })}
            options={timezoneOptions(draft.timezone)}
            value={draft.timezone}
          />
          <TimeField
            label="Start time"
            onChange={(startTime) => patch({ startTime })}
            value={draft.startTime}
          />
          <TimeField
            label="Due time"
            onChange={(dueTime) => patch({ dueTime })}
            value={draft.dueTime}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <EmployeeLookupField
            label="Assignee"
            onChange={(assigneeEmployeeId) => patch({ assigneeEmployeeId })}
            people={people}
            value={draft.assigneeEmployeeId}
          />
          <SelectField
            label="Team"
            onChange={(teamId) => patch({ teamId })}
            options={[
              { value: NO_TEAM, label: "No team" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            value={draft.teamId}
          />
        </div>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-foreground">
            Checklist
          </legend>
          {draft.checklist.map((item, index) => (
            <div
              className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
              key={index}
            >
              <TextField
                label={`Checklist item ${index + 1}`}
                maxLength={300}
                onChange={(label) => setChecklistLabel(index, label)}
                value={item.label}
              />
              <CheckboxField
                checked={item.required}
                label={`Required, item ${index + 1}`}
                onChange={(required) => setChecklistRequired(index, required)}
              />
              <Button
                aria-label={`Remove checklist item ${index + 1}`}
                onClick={() =>
                  patch({
                    checklist: draft.checklist.filter((_, i) => i !== index),
                  })
                }
                size="icon-sm"
                variant="danger-soft"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() =>
                patch({
                  checklist: [...draft.checklist, { label: "", required: false }],
                })
              }
              variant="outline"
            >
              Add checklist item
            </Button>
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
