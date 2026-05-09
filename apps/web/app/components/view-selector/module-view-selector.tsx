"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LayoutList, Settings } from "lucide-react";
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
  className,
}: ModuleViewSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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
    <div className={className} ref={containerRef}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative">
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            className="inline-flex min-w-[260px] max-w-full items-center justify-between gap-3 rounded-md border border-transparent bg-white px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-border hover:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-accent/25"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <LayoutList className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-left leading-5">
                  {selectedView.name}
                </span>
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {open ? (
            <div
              className="absolute left-0 top-[calc(100%+8px)] z-30 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-white shadow-xl"
              role="menu"
            >
              <div className="border-b border-border bg-muted/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-muted">
                  Select view
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedView.name}
                </p>
              </div>
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
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/5 hover:text-accent-strong"
                    onClick={() => setOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    Manage views
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
      <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase text-muted">
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
              role="menuitemradio"
              aria-checked={active}
              className={`grid w-full grid-cols-[1fr_auto] gap-3 rounded-md px-3 py-2 text-left transition ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-muted/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {view.name}
                </span>
                {view.description ? (
                  <span className="mt-0.5 block truncate text-xs font-normal text-muted">
                    {view.description}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                {typeof view.badgeCount === "number" && view.badgeCount > 0 ? (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                    {view.badgeCount}
                  </span>
                ) : null}
                {active ? <Check className="h-4 w-4" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
