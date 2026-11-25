"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { TextAreaField } from "@/app/components/ui/form-control";

/**
 * Asks for a piece of text, then runs an action with it. Used wherever the API
 * wants a stated reason or note: withdraw, dispute, reject. `validate` returns a
 * message, or null when the text is acceptable. The API's own refusal is shown
 * as it arrives.
 */
export function NoteDialog({
  confirmLabel,
  fieldLabel,
  onClose,
  onConfirm,
  title,
  validate,
}: {
  confirmLabel: string;
  fieldLabel: string;
  onClose: () => void;
  onConfirm: (text: string) => Promise<void>;
  title: string;
  validate: (text: string) => string | null;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const problem = validate(text);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text);
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
          <Button loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={title}
    >
      <div className="grid gap-3">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextAreaField
          label={fieldLabel}
          onChange={setText}
          required
          rows={3}
          value={text}
        />
      </div>
    </Dialog>
  );
}
