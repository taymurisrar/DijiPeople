"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { formatEnumLabel } from "@/lib/formatters";

/**
 * The pieces every tenant panel is built from.
 *
 * They wrap the existing admin card, badge and typography conventions instead of
 * introducing a second visual language — the tenant screens should be
 * recognisably the same product as the customer and agreement screens.
 */

export function PanelCard({
  title,
  description,
  actions,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-sm ${
        tone === "danger"
          ? "border-rose-200 bg-rose-50/40"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
        <div className="min-w-0">
          <h2
            className={`text-base font-semibold ${tone === "danger" ? "text-rose-900" : "text-slate-950"}`}
          >
            {title}
          </h2>
          {description ? (
            <p
              className={`mt-1 text-xs leading-5 ${tone === "danger" ? "text-rose-800" : "text-slate-500"}`}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * One number with the thing it counts. Deliberately not a chart: an operator
 * opening a tenant wants a fact, and a sparkline over two data points is noise.
 */
export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  href?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50/60",
    warning: "border-amber-200 bg-amber-50/60",
    danger: "border-rose-200 bg-rose-50/60",
    info: "border-sky-200 bg-sky-50/60",
  };
  const body = (
    <div
      className={`h-full rounded-2xl border p-4 shadow-sm transition ${tones[tone]} ${href ? "hover:shadow-md" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      {detail ? (
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{detail}</p>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DefinitionList({
  items,
  columns = 2,
}: {
  items: Array<{ label: string; value: ReactNode; hint?: string }>;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={`grid gap-x-6 gap-y-4 ${
        columns === 3
          ? "sm:grid-cols-2 xl:grid-cols-3"
          : columns === 2
            ? "sm:grid-cols-2"
            : "grid-cols-1"
      }`}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-900">
            {item.value ?? <span className="text-slate-400">Not set</span>}
          </dd>
          {item.hint ? (
            <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * A status word carrying its own icon and text, never colour alone — the same
 * pill has to be readable to someone who cannot distinguish red from green.
 */
export function StatePill({
  value,
  tone,
}: {
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {tone === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      ) : tone === "danger" || tone === "warning" ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Info className="h-3.5 w-3.5" aria-hidden />
      )}
      {formatEnumLabel(value)}
    </span>
  );
}

export function PanelEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      <span className="sr-only">Loading {label}</span>
    </div>
  );
}

export function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
    >
      <p className="text-sm text-rose-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
      >
        Try again
      </button>
    </div>
  );
}

export function PanelButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  busy,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const variants: Record<string, string> = {
    primary: "bg-slate-950 text-white hover:bg-slate-800",
    secondary: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

/**
 * A modal that traps focus, restores it on close and can always be dismissed
 * with Escape. Confirmation is a keyboard-reachable step, not a mouse-only one.
 */
export function PanelDialog({
  title,
  description,
  onClose,
  children,
  footer,
  tone = "default",
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
  wide?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const items = [
        ...containerRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      (previouslyFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-slate-950/50 p-4"
    >
      <div
        ref={containerRef}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border bg-white shadow-2xl ${
          tone === "danger" ? "border-rose-200" : "border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              className={`text-base font-semibold ${tone === "danger" ? "text-rose-900" : "text-slate-950"}`}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DialogField({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
      <span className="block">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      <span className="mt-1 block font-normal normal-case tracking-normal">
        {children}
      </span>
      {hint ? (
        <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export const dialogInputClass =
  "h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10";

/** Relative time for heartbeat and last-seen columns. */
export function relativeTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function formatDuration(milliseconds: number | null | undefined) {
  if (milliseconds === null || milliseconds === undefined) return "—";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}
