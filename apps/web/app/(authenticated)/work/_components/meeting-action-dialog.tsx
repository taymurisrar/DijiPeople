"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { TextAreaField } from "@/app/components/ui/form-control";
import {
  MAX_NOTES,
  MAX_REASON,
  buildCancelPayload,
  buildHoldPayload,
  type Meeting,
} from "../_lib/decisions";
import { workRequest } from "../_lib/work-client";

/**
 * Hold a planned meeting (with optional notes, after which its agenda is locked)
 * or cancel it (with an optional reason). The API's refusal is shown as it arrives.
 */
export function MeetingActionDialog({
  kind,
  meeting,
  onClose,
  onDone,
}: {
  kind: "hold" | "cancel";
  meeting: Meeting;
  onClose: () => void;
  onDone: (meeting: Meeting) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = kind === "hold" ? MAX_NOTES : MAX_REASON;

  const confirm = async () => {
    if (text.length > limit) {
      setError(`Enter at most ${limit} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(
        await workRequest<Meeting>(
          "work-meetings",
          `/${meeting.id}/${kind}`,
          {
            method: "POST",
            body: kind === "hold" ? buildHoldPayload(text) : buildCancelPayload(text),
          },
        ),
      );
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
            Back
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            {kind === "hold" ? "Hold meeting" : "Cancel meeting"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={kind === "hold" ? `Hold ${meeting.title}` : `Cancel ${meeting.title}`}
    >
      <div className="grid gap-3">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <TextAreaField
          label={kind === "hold" ? "Notes" : "Reason"}
          onChange={setText}
          rows={kind === "hold" ? 6 : 3}
          value={text}
        />
      </div>
    </Dialog>
  );
}
