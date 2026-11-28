"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { workRequest } from "../_lib/work-client";
import {
  CATEGORY_LABELS,
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_MEASURES,
  CONTRIBUTION_WORK_KINDS,
  MEASURE_LABELS,
  WORK_KIND_LABELS,
  buildCorrectContributionPayload,
  buildCreateContributionPayload,
  emptyContributionForm,
  fieldsForMeasure,
  formFromEntry,
  newClientRequestId,
  needsRetrospectiveNote,
  validateContributionForm,
  validateReason,
  type ContributionCategory,
  type ContributionEntry,
  type ContributionFormState,
  type ContributionMeasure,
  type ContributionWorkKind,
} from "../_lib/contributions";
import { MomentField } from "./moment-field";

const KIND_OPTIONS = CONTRIBUTION_WORK_KINDS.map((value) => ({
  value,
  label: WORK_KIND_LABELS[value],
}));
const MEASURE_OPTIONS = CONTRIBUTION_MEASURES.map((value) => ({
  value,
  label: MEASURE_LABELS[value],
}));
const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  ...CONTRIBUTION_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
  })),
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Records a contribution, or corrects one. The fields follow the measure: time
 * spent has a start and an end, a quantity has an amount and its own unit, an
 * occurrence has only a time. A correction cannot change the kind or the
 * measure, and always carries a reason.
 */
export function ContributionFormDialog({
  entry,
  onClose,
  onDone,
}: {
  /** Present when correcting this entry; absent when recording a new one. */
  entry?: ContributionEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const correcting = Boolean(entry);
  const [form, setForm] = useState<ContributionFormState>(() => {
    // One id per form open, so a retried submit is one entry, not two.
    const id = newClientRequestId();
    return entry ? formFromEntry(entry, id) : emptyContributionForm(id);
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (change: Partial<ContributionFormState>) =>
    setForm((current) => ({ ...current, ...change }));
  const fields = fieldsForMeasure(form.measure);

  const submit = async () => {
    const problem =
      validateContributionForm(form) ??
      (correcting ? validateReason(reason) : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const timezone = browserTimezone();
      if (entry) {
        await workRequest("contributions", `/${entry.id}/correct`, {
          method: "POST",
          body: buildCorrectContributionPayload(form, reason, timezone),
        });
      } else {
        await workRequest("contributions", "", {
          method: "POST",
          body: buildCreateContributionPayload(form, timezone),
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {correcting ? "Save correction" : "Record entry"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={correcting ? "Correct entry" : "Record an entry"}
    >
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            disabled={correcting}
            label="Work kind"
            onChange={(value) => patch({ workKind: value as ContributionWorkKind })}
            options={KIND_OPTIONS}
            value={form.workKind}
          />
          <SelectField
            disabled={correcting}
            label="Measure"
            onChange={(value) => patch({ measure: value as ContributionMeasure })}
            options={MEASURE_OPTIONS}
            value={form.measure}
          />
        </div>
        <SelectField
          label="Category"
          onChange={(value) => patch({ category: value as ContributionCategory | "" })}
          options={CATEGORY_OPTIONS}
          value={form.category}
        />

        {fields.includes("interval") ? (
          <>
            <MomentField
              label="Start"
              onChange={(startsAt) => patch({ startsAt })}
              required
              value={form.startsAt}
            />
            <MomentField
              label="End"
              onChange={(endsAt) => patch({ endsAt })}
              required
              value={form.endsAt}
            />
          </>
        ) : null}
        {fields.includes("occurredAt") ? (
          <MomentField
            label="Occurred"
            onChange={(occurredAt) => patch({ occurredAt })}
            required
            value={form.occurredAt}
          />
        ) : null}
        {fields.includes("quantity") ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Quantity"
              min={0}
              onChange={(value) =>
                patch({ quantity: value === null ? "" : String(value) })
              }
              required
              step={0.0001}
              value={form.quantity === "" ? null : Number(form.quantity)}
            />
            <TextField
              label="Unit"
              maxLength={64}
              onChange={(unitKey) => patch({ unitKey })}
              placeholder="pages"
              required
              value={form.unitKey}
            />
          </div>
        ) : null}

        <TextAreaField
          label="Note"
          required={needsRetrospectiveNote(form)}
          onChange={(note) => patch({ note })}
          rows={3}
          value={form.note}
        />

        {correcting ? (
          <TextAreaField
            label="Reason for the correction"
            onChange={setReason}
            required
            rows={2}
            value={reason}
          />
        ) : (
          <>
            <CheckboxField
              checked={form.capturedOffline}
              label="Captured offline"
              onChange={(capturedOffline) => patch({ capturedOffline })}
            />
            {form.capturedOffline ? (
              <MomentField
                label="Captured"
                onChange={(capturedAt) => patch({ capturedAt })}
                required
                value={form.capturedAt}
              />
            ) : null}
            <TextField
              label="Request id"
              onChange={() => undefined}
              disabled
              value={form.clientRequestId}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
