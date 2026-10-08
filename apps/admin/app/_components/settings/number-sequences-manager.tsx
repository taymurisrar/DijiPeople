"use client";

import { useMemo, useState, useTransition } from "react";
import { Hash, Save } from "lucide-react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { EmptyState } from "@/app/_components/ui/empty-state";
import {
  FormControl,
  type FormControlValue,
} from "@/app/_components/ui/form-control";
import {
  draftFromSequence,
  formatSequenceNumber,
  numberSequencePatch,
  validateNumberSequenceDraft,
  type NumberSequence,
  type NumberSequenceDraft,
} from "@/lib/number-sequence-format";

/**
 * Settings > Numbering (ADR-0027). One editor per platform number sequence.
 *
 * The preview is formatted here as the operator types; the saved sequence's
 * `preview` comes back from the API, which is the authority on both the
 * format and the raise-only rule for the next number.
 */
export function NumberSequencesManager({
  initialSequences,
}: {
  initialSequences: NumberSequence[];
}) {
  if (!initialSequences.length) {
    return (
      <EmptyState
        title="No number sequences"
        description="No platform number sequences are configured."
      />
    );
  }
  return (
    <div className="space-y-6">
      {initialSequences.map((sequence) => (
        <NumberSequenceEditor key={sequence.key} initial={sequence} />
      ))}
    </div>
  );
}

type Message = { tone: "success" | "error"; text: string };
type ApiFailure = {
  message?: string;
  fieldErrors?: Array<{ field?: string; message?: string }>;
};

function NumberSequenceEditor({ initial }: { initial: NumberSequence }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<NumberSequenceDraft>(() =>
    draftFromSequence(initial),
  );
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<keyof NumberSequenceDraft, string>>
  >({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isPending, startTransition] = useTransition();

  const errors = useMemo(
    () => ({
      ...serverErrors,
      ...validateNumberSequenceDraft(draft, saved.nextValue),
    }),
    [draft, saved.nextValue, serverErrors],
  );
  const patch = useMemo(
    () => numberSequencePatch(saved, draft),
    [saved, draft],
  );
  const hasChanges = Object.keys(patch).length > 0;
  const hasErrors =
    Object.keys(validateNumberSequenceDraft(draft, saved.nextValue)).length > 0;

  const preview = hasErrors
    ? null
    : formatSequenceNumber(
        {
          prefix: draft.prefix,
          separator: draft.separator,
          suffix: draft.suffix,
          padding: Number(draft.padding),
        },
        Number(draft.nextValue),
      );

  function update(field: keyof NumberSequenceDraft, value: FormControlValue) {
    setMessage(null);
    setServerErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    const text = value === null || value === undefined ? "" : String(value);
    setDraft((current) => ({
      ...current,
      [field]:
        field === "prefix" || field === "separator" || field === "suffix"
          ? text.toUpperCase()
          : text,
    }));
  }

  function reset() {
    setMessage(null);
    setServerErrors({});
    setDraft(draftFromSequence(saved));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/super-admin/platform-settings/numbering/${encodeURIComponent(saved.key)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | (NumberSequence & ApiFailure)
          | null;
        if (!response.ok || !payload) {
          const fieldErrors: Partial<
            Record<keyof NumberSequenceDraft, string>
          > = {};
          for (const item of payload?.fieldErrors ?? []) {
            if (item.field && item.message && item.field in draft)
              fieldErrors[item.field as keyof NumberSequenceDraft] =
                item.message;
          }
          setServerErrors(fieldErrors);
          setMessage({
            tone: "error",
            text: payload?.message ?? "Numbering was not saved.",
          });
          return;
        }
        setSaved(payload);
        setDraft(draftFromSequence(payload));
        setServerErrors({});
        setMessage({ tone: "success", text: "Numbering saved." });
      } catch {
        setMessage({
          tone: "error",
          text: "Network error. Numbering was not saved.",
        });
      }
    });
  }

  const fieldKey = (field: string) => `${saved.key}-${field}`;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <Hash className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-semibold text-slate-950">
            {saved.label}
          </h2>
        </div>
        <div
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right"
          aria-live="polite"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Preview
          </p>
          <p className="font-mono text-lg font-semibold text-slate-950">
            {preview ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {message ? (
          <AppNotification tone={message.tone}>{message.text}</AppNotification>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FormControl
            label="Prefix"
            fieldKey={fieldKey("prefix")}
            value={draft.prefix}
            error={errors.prefix}
            disabled={isPending}
            onChange={(value) => update("prefix", value)}
          />
          <FormControl
            label="Separator"
            fieldKey={fieldKey("separator")}
            value={draft.separator}
            error={errors.separator}
            disabled={isPending}
            onChange={(value) => update("separator", value)}
          />
          <FormControl
            label="Suffix"
            fieldKey={fieldKey("suffix")}
            value={draft.suffix}
            error={errors.suffix}
            disabled={isPending}
            onChange={(value) => update("suffix", value)}
          />
          <FormControl
            type="number"
            label="Padding"
            fieldKey={fieldKey("padding")}
            value={draft.padding}
            error={errors.padding}
            disabled={isPending}
            required
            onChange={(value) => update("padding", value)}
          />
          <FormControl
            type="number"
            label="Next number"
            fieldKey={fieldKey("nextValue")}
            value={draft.nextValue}
            error={errors.nextValue}
            disabled={isPending}
            required
            onChange={(value) => update("nextValue", value)}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending || !hasChanges}
            onClick={reset}
            type="button"
          >
            Reset changes
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending || !hasChanges || hasErrors}
            onClick={save}
            type="button"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Saving..." : "Save numbering"}
          </button>
        </div>
      </div>
    </section>
  );
}
