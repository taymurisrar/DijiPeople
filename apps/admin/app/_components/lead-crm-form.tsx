"use client";

import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type LeadFormMode = "CREATE" | "UPDATE" | "READ_ONLY" | "COMPLETED";

type SelectOption = {
  value: string;
  label: string;
};

export function LeadCrmShell({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export function LeadRibbon({
  left,
  leftCommands,
  right,
  rightMeta,
}: {
  left: ReactNode;
  leftCommands?: ReactNode;
  right?: ReactNode;
  rightMeta?: ReactNode;
}) {
  const commands = leftCommands ?? left;
  const metadata = rightMeta ?? right;

  return (
    <section className="relative z-20 w-full overflow-visible rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-12 w-full min-w-0 items-center justify-between gap-3 overflow-visible">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1.5">{commands}</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 overflow-visible">
          {metadata}
        </div>
      </div>
    </section>
  );
}

export function LeadRibbonButton({
  children,
  disabled = false,
  form,
  icon: Icon,
  label,
  onClick,
  type = "button",
}: {
  children?: ReactNode;
  disabled?: boolean;
  form?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      form={form}
      onClick={onClick}
      title={label}
      type={type}
    >
      <Icon className="h-4 w-4" />
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function LeadRibbonSelect({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  return (
    <label className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
      {label}
      <select
        className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OwnerStatusDropdown({
  disabled = false,
  ownerLabel,
  ownerOptions,
  ownerValue,
  statusLabel = "Status",
  statusOptions,
  statusValue,
  subStatusOptions,
  subStatusValue,
  onOwnerChange,
  onStatusChange,
  onSubStatusChange,
}: {
  disabled?: boolean;
  ownerLabel?: string;
  ownerOptions: SelectOption[];
  ownerValue: string;
  statusLabel?: string;
  statusOptions: SelectOption[];
  statusValue: string;
  subStatusOptions: SelectOption[];
  subStatusValue: string;
  onOwnerChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSubStatusChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const owner = useMemo(
    () => ownerOptions.find((option) => option.value === ownerValue),
    [ownerOptions, ownerValue],
  );
  const initials = getInitials(owner?.label ?? ownerLabel ?? "Unassigned");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = ref.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(384, Math.max(320, window.innerWidth - 24));
      const left = Math.max(
        12,
        Math.min(trigger.right - width, window.innerWidth - width - 12),
      );
      setMenuStyle({
        position: "fixed",
        top: trigger.bottom + 8,
        left,
        width,
        zIndex: 120,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative min-w-[220px] sm:min-w-[280px]" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-left text-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950/15"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[11px] font-bold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-950">
            {owner?.label ?? ownerLabel ?? "Unassigned"}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {statusLabel}: {statusValue.replaceAll("_", " ")}
          </span>
        </span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-slate-400 transition",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
              ref={menuRef}
              role="menu"
              style={menuStyle}
            >
              <div className="grid gap-3">
                <LeadRibbonSelect
                  disabled={disabled}
                  label="Owner"
                  onChange={onOwnerChange}
                  options={ownerOptions}
                  value={ownerValue}
                />
                <LeadRibbonSelect
                  disabled={disabled}
                  label="Status"
                  onChange={onStatusChange}
                  options={statusOptions}
                  value={statusValue}
                />
                <LeadRibbonSelect
                  disabled={disabled}
                  label="Sub-status"
                  onChange={onSubStatusChange}
                  options={subStatusOptions}
                  value={subStatusValue}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return initials || value.trim()[0]?.toUpperCase() || "U";
}

export function LeadPipeline({
  current,
  disabled = false,
  onStageClick,
  stages,
}: {
  current: string;
  disabled?: boolean;
  onStageClick?: (value: string) => void;
  stages: SelectOption[];
}) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.value === current),
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center">
          {stages.map((stage, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isClickable =
              Boolean(onStageClick) && !disabled && !isCurrent;

            return (
              <div
                className="flex min-w-[150px] flex-1 items-center"
                key={stage.value}
              >
                <button
                  className={[
                    "group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-950/15",
                    isClickable
                      ? "cursor-pointer hover:bg-slate-50"
                      : "cursor-default",
                  ].join(" ")}
                  disabled={!isClickable}
                  onClick={() => onStageClick?.(stage.value)}
                  type="button"
                >
                  <span
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      isCompleted
                        ? "border-slate-950 bg-slate-950 text-white"
                        : isCurrent
                          ? "border-slate-950 bg-white text-slate-950 ring-4 ring-slate-950/10"
                          : "border-slate-300 bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Circle className="h-3 w-3 fill-current" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={[
                        "block truncate text-sm font-semibold",
                        isCurrent
                          ? "text-slate-950"
                          : isCompleted
                            ? "text-slate-700"
                            : "text-slate-400",
                      ].join(" ")}
                    >
                      {stage.label}
                    </span>
                  </span>
                </button>
                {index < stages.length - 1 ? (
                  <span
                    className={[
                      "mx-1 h-px w-8 shrink-0",
                      index < currentIndex ? "bg-slate-950" : "bg-slate-200",
                    ].join(" ")}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function LeadRecordHeader({
  badge,
  helperText,
  metadata,
  title,
}: {
  badge?: ReactNode;
  helperText?: string;
  metadata: Array<{ label: string; value?: ReactNode }>;
  title: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          {badge}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-slate-500">
          {metadata.map((item, index) => (
            <span className="inline-flex items-center gap-1.5" key={item.label}>
              {index > 0 ? <span className="text-slate-300">·</span> : null}
              <span>{item.value || item.label}</span>
            </span>
          ))}
        </div>
        {helperText ? (
          <p className="mt-1.5 text-sm text-slate-500">{helperText}</p>
        ) : null}
      </div>
    </section>
  );
}

export function LeadCompletedNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function LeadFormShell({
  children,
  footer,
  formId,
  onSubmit,
}: {
  children: ReactNode;
  footer?: ReactNode;
  formId?: string;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      id={formId}
      onSubmit={onSubmit}
    >
      <div className="grid gap-x-4 gap-y-3 p-4 lg:grid-cols-2">{children}</div>
      {footer ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {footer}
        </div>
      ) : null}
    </form>
  );
}

export function LeadField({
  disabled = false,
  error,
  fieldKey,
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  disabled?: boolean;
  error?: string;
  fieldKey?: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      <span className="flex items-center gap-1">
        {label}
        {required ? <span className="text-slate-950">*</span> : null}
      </span>
      <input
        aria-invalid={Boolean(error)}
        className={[
          "mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          error ? "border-amber-400 bg-amber-50" : "border-slate-300",
        ].join(" ")}
        data-field-key={fieldKey}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? "Not specified" : undefined}
        required={required && !disabled}
        type={type}
        value={value}
      />
      {error ? (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function LeadSelectField({
  disabled = false,
  error,
  fieldKey,
  label,
  onChange,
  options,
  required = false,
  value,
}: {
  disabled?: boolean;
  error?: string;
  fieldKey?: string;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      <span className="flex items-center gap-1">
        {label}
        {required ? <span className="text-slate-950">*</span> : null}
      </span>
      <select
        aria-invalid={Boolean(error)}
        className={[
          "mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          error ? "border-amber-400 bg-amber-50" : "border-slate-300",
        ].join(" ")}
        data-field-key={fieldKey}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required={required && !disabled}
        value={value}
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function LeadTextarea({
  disabled = false,
  error,
  fieldKey,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  error?: string;
  fieldKey?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700 lg:col-span-2">
      {label}
      <textarea
        aria-invalid={Boolean(error)}
        className={[
          "mt-1.5 min-h-24 w-full rounded-lg border bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          error ? "border-amber-400 bg-amber-50" : "border-slate-300",
        ].join(" ")}
        data-field-key={fieldKey}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? "Not specified" : undefined}
        value={value}
      />
      {error ? (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function LeadReadOnlyField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5",
        wide ? "lg:col-span-2" : "",
      ].join(" ")}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">
        {value || <span className="text-slate-400">Not specified</span>}
      </div>
    </div>
  );
}

export function LeadTabs<T extends string>({
  activeTab,
  onChange,
  tabs,
}: {
  activeTab: T;
  onChange: (value: T) => void;
  tabs: Array<{ key: T; label: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            className={[
              "rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-950/15",
              activeTab === tab.key
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LeadLockedFieldHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
      <Lock className="h-3 w-3" />
      {children}
    </span>
  );
}
