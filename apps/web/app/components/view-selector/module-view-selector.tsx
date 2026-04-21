"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ModuleViewOption, ModuleViewSelectorConfig } from "./types";

type ModuleViewSelectorProps = ModuleViewSelectorConfig & {
  className?: string;
};

export function ModuleViewSelector({
  enabled,
  selectedViewId,
  views,
  configureHref,
  paramName = "view",
  title = "Views",
  className,
}: ModuleViewSelectorProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedView = useMemo(() => {
    return (
      views.find((view) => view.id === selectedViewId) ??
      views.find((view) => view.isDefault) ??
      views[0] ??
      null
    );
  }, [selectedViewId, views]);

  const systemViews = views.filter((view) => view.type === "system");
  const customViews = views.filter((view) => view.type === "custom");

  if (!enabled || !selectedView || views.length === 0) {
    return null;
  }

  function handleSelect(viewId: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (viewId) {
      params.set(paramName, viewId);
    } else {
      params.delete(paramName);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          {title}
        </p>

        <div className="relative">
          <button
            className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:border-accent/30"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span className="text-xs truncate">{selectedView.name}</span>
            <span
              className={`text-xs text-muted transition ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              ▼
            </span>
          </button>

          {open ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[320px] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">

              <ViewGroup
                title="System views"
                items={systemViews}
                selectedViewId={selectedViewId}
                onSelect={handleSelect}
              />

              <ViewGroup
                title="Custom views"
                items={customViews}
                selectedViewId={selectedViewId}
                onSelect={handleSelect}
              />

              {configureHref ? (
                <div className="border-t border-border p-2">
                  <Link
                    href={configureHref}
                    className="flex rounded-xl px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/5 hover:text-accent-strong"
                    onClick={() => setOpen(false)}
                  >
                    Configure custom views
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ViewGroup({
  title,
  items,
  selectedViewId,
  onSelect,
}: {
  title: string;
  items: ModuleViewOption[];
  selectedViewId: string;
  onSelect: (viewId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="p-2">
      <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        {title}
      </p>

      <div className="grid gap-1">
        {items.map((view) => {
          const active = view.id === selectedViewId;

          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onSelect(view.id)}
              className={`rounded-xl px-3 py-2 text-left transition ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-medium">{view.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}