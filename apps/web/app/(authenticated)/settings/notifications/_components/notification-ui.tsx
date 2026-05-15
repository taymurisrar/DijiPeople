"use client";

import { ReactNode } from "react";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime as formatResolvedDateTime } from "@/lib/formatting-context";

export function SettingsPanel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

export const inputClassName =
  "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20";

export const codeInputClassName =
  "w-full rounded-2xl border border-border bg-white px-4 py-3 font-mono text-xs text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE" || status === "SENT" || status === "DELIVERED"
      ? "good"
      : status === "FAILED"
        ? "danger"
        : status === "ARCHIVED" || status === "SKIPPED" || status === "DRY_RUN"
          ? "muted"
          : status === "PROCESSING" || status === "PENDING"
            ? "warning"
            : "neutral";

  return <StatusPill tone={tone}>{status.replaceAll("_", " ")}</StatusPill>;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return formatResolvedDateTime(value) || value;
}

export function parseJsonObject(value: string, fallbackMessage: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(fallbackMessage);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : fallbackMessage);
  }
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
