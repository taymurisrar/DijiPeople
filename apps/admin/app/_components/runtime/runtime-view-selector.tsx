"use client";

import {
  Check,
  ChevronDown,
  Pin,
  RotateCcw,
  Settings2,
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
  return (
    <div ref={container} className={`relative min-w-0 ${className ?? ""}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-w-[240px] max-w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            View
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">
            {selected.label}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {savedDefault === selected.key ? (
            <Pin className="h-3.5 w-3.5 text-[var(--admin-primary)]" />
          ) : null}
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+8px)] z-20 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Select {moduleKey.replaceAll("-", " ")} view
            </p>
            {selected.description ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {selected.description}
              </p>
            ) : null}
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {groups.map(([label, items]) =>
              items.length ? (
                <section key={label} className="mb-2">
                  <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    {label}
                  </p>
                  {items.map((view) => (
                    <button
                      key={view.key}
                      role="menuitemradio"
                      aria-checked={selected.key === view.key}
                      type="button"
                      onClick={() => select(view.key)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${selected.key === view.key ? "bg-[var(--admin-surface-tint)]" : "hover:bg-slate-50"}`}
                    >
                      <span className="mt-0.5">
                        {view.kind === "personal" ? (
                          <UserRound className="h-4 w-4 text-slate-500" />
                        ) : view.kind === "team" ? (
                          <UsersRound className="h-4 w-4 text-slate-500" />
                        ) : (
                          <Settings2 className="h-4 w-4 text-slate-500" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          {view.label}
                          {savedDefault === view.key ? (
                            <Pin className="h-3 w-3 text-[var(--admin-primary)]" />
                          ) : null}
                        </span>
                        {view.description ? (
                          <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                            {view.description}
                          </span>
                        ) : null}
                      </span>
                      {selected.key === view.key ? (
                        <Check className="mt-0.5 h-4 w-4 text-[var(--admin-primary)]" />
                      ) : null}
                    </button>
                  ))}
                </section>
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2.5">
            <span
              className={`text-xs ${message?.startsWith("Unable") ? "text-rose-600" : "text-emerald-700"}`}
            >
              {message}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !savedDefault}
                onClick={() => persist(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                System default
              </button>
              <button
                type="button"
                disabled={pending || savedDefault === selected.key}
                onClick={() => persist(selected.key)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                <Pin className="h-3.5 w-3.5" />
                Set default
              </button>
            </div>
          </div>
          {configureHref ? (
            <a
              href={configureHref}
              className="block border-t border-slate-100 px-4 py-3 text-xs font-semibold text-[var(--admin-primary)]"
            >
              Manage saved views
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
