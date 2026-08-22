"use client";

export function ModuleRefreshOverlay({ active }: { readonly active: boolean }) {
  if (!active) return null;

  // Not a dialog: `pointer-events-none`, nothing to activate, nothing to
  // contain. It is a status message, so it says so and is announced politely
  // rather than being invisible to a screen reader. BUG-0043.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-white/35 backdrop-blur-[1px]"
      role="status"
    >
      <div className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-foreground shadow-lg">
        Refreshing...
      </div>
    </div>
  );
}
