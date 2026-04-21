"use client";

export default function EmployeesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-danger/20 bg-danger/5 p-6 text-danger">
      <p className="text-sm uppercase tracking-[0.18em]">Employee Module Error</p>
      <h3 className="mt-3 text-2xl font-semibold text-foreground">
        We could not load the employee module.
      </h3>
      <p className="mt-3 text-sm">{error.message}</p>
      <button
        className="mt-5 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white"
        onClick={reset}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}
