"use client";

type SessionExpiredDialogProps = {
  message?: string;
  onLoginAgain: () => void;
};

export function SessionExpiredDialog({
  message = "For security, your session ended due to inactivity. Please sign in again to continue.",
  onLoginAgain,
}: SessionExpiredDialogProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Session expired
        </p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">
          You were signed out due to inactivity
        </h3>
        <p className="mt-2 text-sm text-muted">{message}</p>

        <div className="mt-5 flex justify-end">
          <button
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
            onClick={onLoginAgain}
            type="button"
          >
            Login again
          </button>
        </div>
      </div>
    </div>
  );
}
