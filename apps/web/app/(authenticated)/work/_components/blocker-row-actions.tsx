"use client";

import { Button } from "@/app/components/ui/button";
import {
  blockerName,
  canEscalate,
  isOpenBlocker,
  type WorkBlocker,
} from "../_lib/blockers";
import type { BlockerPending } from "./blocker-dialogs";

/**
 * The actions on one blocker. Closed blockers have none: they stay in history.
 * "Set cause" is a reviewer's judgement and the API refuses it for the person
 * the blocker waits on and for people doing the delayed work, so once it has
 * said no for a blocker the control is not offered again for it.
 */
export function BlockerRowActions({
  blocker,
  canWrite,
  causeRefused,
  disabled,
  onAction,
}: {
  blocker: WorkBlocker;
  canWrite: boolean;
  causeRefused: boolean;
  disabled?: boolean;
  onAction: (pending: BlockerPending) => void;
}) {
  if (!canWrite || !isOpenBlocker(blocker)) return null;
  const name = blockerName(blocker);

  return (
    <>
      <Button
        aria-label={`Assign owner: ${name}`}
        disabled={disabled}
        onClick={() => onAction({ kind: "assign", blocker })}
        size="xs"
        variant="outline"
      >
        Assign owner
      </Button>
      {canEscalate(blocker) ? (
        <Button
          aria-label={`Escalate blocker: ${name}`}
          disabled={disabled}
          onClick={() => onAction({ kind: "escalate", blocker })}
          size="xs"
          variant="outline"
        >
          Escalate
        </Button>
      ) : null}
      {causeRefused ? null : (
        <Button
          aria-label={`Set cause: ${name}`}
          disabled={disabled}
          onClick={() => onAction({ kind: "cause", blocker })}
          size="xs"
          variant="outline"
        >
          Set cause
        </Button>
      )}
      <Button
        aria-label={`Resolve blocker: ${name}`}
        disabled={disabled}
        onClick={() => onAction({ kind: "resolve", blocker })}
        size="xs"
        variant="primary"
      >
        Resolve
      </Button>
      <Button
        aria-label={`Cancel blocker: ${name}`}
        disabled={disabled}
        onClick={() => onAction({ kind: "cancel", blocker })}
        size="xs"
        variant="danger-soft"
      >
        Cancel
      </Button>
    </>
  );
}
