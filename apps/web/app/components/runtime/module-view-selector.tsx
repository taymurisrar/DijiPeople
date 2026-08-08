"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/app/components/ui/button";

/*
 * The one view selector. A second near-identical component used to live under
 * components/view-selector; both are now this, so a change to how views are
 * chosen lands everywhere at once.
 */

export type ModuleViewType = "system" | "custom";

export type ModuleViewOption = {
  id: string;
  name: string;
  description?: string | null;
  type?: ModuleViewType;
  isDefault?: boolean;
  badgeCount?: number;
  icon?: string;
};

export type ModuleViewSelectorProps = {
  enabled?: boolean;
  activeViewId?: string | null;
  selectedViewId?: string | null;
  views: readonly ModuleViewOption[];
  configureHref?: string;
  paramName?: string;
  className?: string;
  disabled?: boolean;
  mode?: "select" | "dropdown";
  /* Shown above the trigger when the selector needs naming on a busy page. */
  title?: string;
  /*
   * Above this many views the list gets a filter box. Below it the box is
   * noise, so it only appears when scanning actually becomes hard.
   */
  searchThreshold?: number;
  onViewChange?: (viewId: string) => void;
};

/* The server-side shape pages pass through; kept for callers that build it. */
export type ModuleViewSelectorConfig = {
  enabled: boolean;
  selectedViewId: string;
  views: ModuleViewOption[];
  configureHref?: string;
  paramName?: string;
  title?: string;
};

export function ModuleViewSelector({
  enabled = true,
  activeViewId,
  selectedViewId,
  views,
  configureHref,
  paramName = "view",
  className,
  disabled = false,
  mode = "select",
  title,
  searchThreshold = 8,
  onViewChange,
}: ModuleViewSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolvedSelectedViewId = activeViewId ?? selectedViewId ?? null;

  const selectedView = useMemo(() => {
    return (
      views.find((view) => view.id === resolvedSelectedViewId) ??
      views.find((view) => view.isDefault) ??
      views[0] ??
      null
    );
  }, [resolvedSelectedViewId, views]);

  const showSearch = views.length > searchThreshold;
  const term = query.trim().toLowerCase();
  const matchingViews = term
    ? views.filter(
        (view) =>
          view.name.toLowerCase().includes(term) ||
          view.description?.toLowerCase().includes(term),
      )
    : views;

  const systemViews = matchingViews.filter((view) => view.type === "system");
  const customViews = matchingViews.filter((view) => view.type === "custom");
  const otherViews = matchingViews.filter(
    (view) => view.type !== "system" && view.type !== "custom",
  );

  useEffect(() => {
    if (
      mode !== "dropdown" ||
      !resolvedSelectedViewId ||
      views.some((view) => view.id === resolvedSelectedViewId)
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const fallbackView = views.find((view) => view.isDefault) ?? views[0] ?? null;

    if (fallbackView) {
      params.set(paramName, fallbackView.id);
    } else {
      params.delete(paramName);
    }

    clearStaleViewStorage(pathname, paramName, resolvedSelectedViewId);

    const queryString = params.toString();

    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [
    mode,
    paramName,
    pathname,
    router,
    searchParams,
    resolvedSelectedViewId,
    views,
  ]);

  useEffect(() => {
    if (!open) return;

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
    if (onViewChange) {
      onViewChange(viewId);
      setOpen(false);
      setQuery("");
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (viewId) {
      params.set(paramName, viewId);
    } else {
      params.delete(paramName);
    }

    const queryString = params.toString();

    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });

    setOpen(false);
    setQuery("");
  }

  if (mode === "select") {
    return (
      <label className={`inline-flex items-center gap-2 ${className ?? ""}`}>
        {title ? (
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {title}
          </span>
        ) : null}
        <span className="text-sm font-medium text-muted">View</span>

        <select
          className="h-9 min-w-[220px] rounded-md border border-border bg-white px-3 text-sm font-semibold text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          value={selectedView.id}
          onChange={(event) => handleSelect(event.target.value)}
        >
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={`min-w-0 ${className ?? ""} px-2 py-1`} ref={containerRef}>
      {title ? (
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </p>
      ) : null}
      <div className="relative min-w-0 max-w-full">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          type="button"
          className="flex min-w-[220px] max-w-full items-center justify-start gap-1.5 rounded-md px-0 py-1 text-left text-lg font-semibold text-foreground hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block min-w-0 truncate">
            {selectedView.name}
          </span>

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""
              }`}
            aria-hidden="true"
          />
        </button>

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

            {showSearch ? (
              <div className="shrink-0 border-b border-border p-2">
                <input
                  autoFocus
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter views"
                  value={query}
                />
              </div>
            ) : null}

            <div className="min-h-0 overflow-y-auto">
              {matchingViews.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  No views match &ldquo;{query}&rdquo;.
                </p>
              ) : null}

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

              <ViewGroup
                title="Other views"
                items={otherViews}
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
  );
}

function clearStaleViewStorage(
  pathname: string,
  paramName: string,
  selectedViewId: string,
) {
  if (typeof window === "undefined") return;

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
  items: readonly ModuleViewOption[];
  selectedViewId: string;
  onSelect: (viewId: string) => void;
}) {
  if (items.length === 0) return null;

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
              className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors ${active
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-muted/40"
                }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {view.name}
                </div>

                {view.description ? (
                  <div className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-muted">
                    {view.description}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {typeof view.badgeCount === "number" && view.badgeCount > 0 ? (
                  <span className="max-w-16 truncate rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">
                    {view.badgeCount}
                  </span>
                ) : null}

                {active ? <Check className="h-4 w-4" /> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}