"use client";

import {
  Check,
  ChevronDown,
  Pin,
  RotateCcw,
  UserRound,
  UsersRound,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  PlatformModuleKey,
  RuntimeViewDefinition,
} from "@/lib/runtime/platform-runtime.types";

export function RuntimeViewSelector({
  moduleKey,
  views,
  defaultViewKey,
  roleKeys = [],
  paramName = "viewId",
  configureHref,
  className,
}: {
  moduleKey: PlatformModuleKey;
  views: RuntimeViewDefinition[];
  defaultViewKey?: string | null;
  roleKeys?: string[];
  paramName?: string;
  configureHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [savedDefault, setSavedDefault] = useState(defaultViewKey ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const container = useRef<HTMLDivElement | null>(null);
  const availableViews = useMemo(
    () =>
      views.filter(
        (view) =>
          !view.roles?.length ||
          view.roles.some((role) => roleKeys.includes(role)),
      ),
    [roleKeys, views],
  );
  const systemDefault =
    availableViews.find((view) => view.roleDefaultFor?.some((role) => roleKeys.includes(role)))
      ?.key ??
    availableViews.find((view) => view.isSystemDefault)?.key ??
    availableViews[0]?.key ??
    "";
  const selectedKey =
    searchParams.get(paramName) ?? savedDefault ?? systemDefault;
  const selected =
    availableViews.find((view) => view.key === selectedKey) ??
    availableViews.find((view) => view.key === systemDefault) ??
    availableViews[0];

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (
        container.current &&
        !container.current.contains(event.target as Node)
      )
        setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  if (!selected) return null;
  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }
  function persist(key: string | null) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/platform-runtime/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, defaultViewKey: key }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to save the default view.");
        return;
      }
      setSavedDefault(key);
      if (!key) select(systemDefault);
      setMessage(key ? "Default view saved." : "System default restored.");
    });
  }
  const groups = [
    [
      "System views",
      availableViews.filter((view) => (view.kind ?? "system") === "system"),
    ],
    ["Shared views", availableViews.filter((view) => view.kind === "team")],
    ["My views", availableViews.filter((view) => view.kind === "personal")],
  ] as const;
  const populatedGroups = groups.filter(([, items]) => items.length > 0);
  /*
   * Compact by design. The trigger is one line at command-bar height, and the
   * menu is a list of names: each view's description is its tooltip rather
   * than a second line under every row, which is what made the menu taller
   * than the dashboard it was choosing. Group headings appear only when there
   * is more than one group to tell apart.
   */
  return (
    <div ref={container} className={`relative min-w-0 ${className ?? ""}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={selected.description}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 min-w-[12rem] max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/30"
      >
        {/* slate-400 on white is ~2.8:1 and fails WCAG AA; slate-500 clears it. */}
        <span className="shrink-0 text-xs font-medium text-slate-500">View</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
          {selected.label}
        </span>
        {savedDefault === selected.key ? (
          <Pin
            className="h-3.5 w-3.5 shrink-0 text-[var(--admin-primary)]"
            aria-label="Your default view"
          />
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Select ${moduleKey.replaceAll("-", " ")} view`}
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:left-0 sm:right-auto"
        >
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-1">
            {populatedGroups.map(([label, items]) => (
              <section key={label}>
                {populatedGroups.length > 1 ? (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                    {label}
                  </p>
                ) : null}
                {items.map((view) => (
                  <button
                    key={view.key}
                    role="menuitemradio"
                    aria-checked={selected.key === view.key}
                    type="button"
                    title={view.description}
                    onClick={() => select(view.key)}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm ${selected.key === view.key ? "bg-[var(--admin-surface-tint)] font-semibold text-slate-950" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    {view.kind === "personal" ? (
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    ) : view.kind === "team" ? (
                      <UsersRound className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{view.label}</span>
                    {savedDefault === view.key ? (
                      <Pin
                        className="h-3 w-3 shrink-0 text-[var(--admin-primary)]"
                        aria-label="Your default view"
                      />
                    ) : null}
                    {selected.key === view.key ? (
                      <Check className="h-4 w-4 shrink-0 text-[var(--admin-primary)]" />
                    ) : null}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-2 py-1.5">
            <button
              type="button"
              disabled={pending || !savedDefault}
              onClick={() => persist(null)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              System default
            </button>
            <button
              type="button"
              disabled={pending || savedDefault === selected.key}
              onClick={() => persist(selected.key)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--admin-primary)] hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              <Pin className="h-3.5 w-3.5" />
              Set as my default
            </button>
          </div>
          {message ? (
            <p
              role="status"
              className={`border-t border-slate-100 px-3 py-1.5 text-xs ${message.startsWith("Unable") ? "text-rose-600" : "text-emerald-700"}`}
            >
              {message}
            </p>
          ) : null}
          {configureHref ? (
            <a
              href={configureHref}
              className="block border-t border-slate-100 px-3 py-2 text-xs font-semibold text-[var(--admin-primary)]"
            >
              Manage saved views
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
