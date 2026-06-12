"use client";

export function ModuleRefreshOverlay({ active }: { readonly active: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-white/35 backdrop-blur-[1px]">
      <div className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-foreground shadow-lg">
        Refreshing...
      </div>
    </div>
  );
}
