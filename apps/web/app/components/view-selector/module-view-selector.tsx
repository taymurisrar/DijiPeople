"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LayoutList, Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/app/components/ui/button";

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
    if (!selectedViewId || views.some((view) => view.id === selectedViewId)) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const fallbackView =
      views.find((view) => view.isDefault) ?? views[0] ?? null;

    if (fallbackView) {
      params.set(paramName, fallbackView.id);
    } else {
      params.delete(paramName);
    }

    clearStaleViewStorage(pathname, paramName, selectedViewId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    paramName,
    pathname,
    router,
    searchParams,
    selectedViewId,
    views,
  ]);

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
    <div className={`min-w-0 ${className ?? ""}`} ref={containerRef}>
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <div className="relative min-w-0 max-w-full">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((current) => !current)}
            type="button"
            className="w-[min(320px,calc(100vw-3rem))] max-w-full justify-between overflow-hidden rounded-md border-transparent"
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
          </Button>

          {open ? (
            <div
              className="absolute left-0 top-[calc(100%+8px)] z-30 flex max-h-[min(520px,70vh)] w-[min(400px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
              role="menu"
            >
              <div className="border-b border-border bg-muted/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-muted">
                  Select view
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  {selectedView.name}
                </p>
              </div>

              <div className="min-h-0 overflow-y-auto">
                <ViewGroup
                  title="System views"
                  items={systemViews}
                  selectedViewId={selectedView.id}
                  onSelect={handleSelect}
                />

                <ViewGroup
                  title="Custom views"
                  items={customViews}
                  selectedViewId={selectedView.id}
                  onSelect={handleSelect}
                />
              </div>

              {configureHref ? (
                <div className="shrink-0 border-t border-border bg-surface p-2">
                  <Button
                    href={configureHref}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => setOpen(false)}
                    className="justify-start rounded-md text-accent hover:bg-accent/5 hover:text-accent-strong"
                    leftIcon={<Settings className="h-4 w-4" />}
                  >
                    Manage views
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function clearStaleViewStorage(
  pathname: string,
  paramName: string,
  selectedViewId: string,
) {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key || !/view/i.test(key)) continue;

      const value = storage.getItem(key);
      if (
        value === selectedViewId ||
        (value?.includes(selectedViewId) &&
          (key.includes(pathname) || key.includes(paramName)))
      ) {
        storage.removeItem(key);
      }
    }
  }
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
            <Button
              key={view.id}
              variant="ghost"
              fullWidth
              onClick={() => onSelect(view.id)}
              role="menuitemradio"
              aria-checked={active}
              className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left ${
                active
                  ? "bg-accent/10 text-accent hover:bg-accent/10 hover:text-accent"
                  : "text-foreground hover:bg-muted/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {view.name}
                </span>
                {view.description ? (
                  <span className="mt-0.5 line-clamp-2 break-words text-xs font-normal leading-4 text-muted">
                    {view.description}
                  </span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {typeof view.badgeCount === "number" && view.badgeCount > 0 ? (
                  <span className="max-w-16 truncate rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">
                    {view.badgeCount}
                  </span>
                ) : null}
                {active ? <Check className="h-4 w-4" /> : null}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
