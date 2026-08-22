"use client";

import { Dialog } from "@/app/components/ui/dialog";

type SessionExpiredDialogProps = {
  message?: string;
  onLoginAgain: () => void;
};

/**
 * This had no dialog semantics, no focus containment and no Escape at all —
 * which for this one is partly deliberate: there is nothing behind it the user
 * can usefully do. `dismissible={false}` keeps that, because dismissing it would
 * leave them on a page whose every request is going to fail. BUG-0043.
 */
export function SessionExpiredDialog({
  message = "For security, your session ended due to inactivity. Please sign in again to continue.",
  onLoginAgain,
}: SessionExpiredDialogProps) {
  return (
    <Dialog
      description={message}
      dismissible={false}
      footer={
        <button
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          onClick={onLoginAgain}
          type="button"
        >
          Login again
        </button>
      }
      onClose={onLoginAgain}
      open
      title={
        <>
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Session expired
          </span>
          <span className="mt-2 block text-xl">
            You were signed out due to inactivity
          </span>
        </>
      }
    />
  );
}
