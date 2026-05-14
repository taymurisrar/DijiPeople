import {
  formatDate,
  formatDateTime,
  formatTime,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import type { ProductivitySummary } from "./types";

export function formatDashboardDate(
  value?: string | null,
  context?: ResolvedFormattingContext | null,
) {
  return formatDate(value, context) || "Not set";
}

export function formatDashboardTime(
  value: string,
  context?: ResolvedFormattingContext | null,
) {
  return formatTime(value, context);
}

export function formatDashboardDateTime(
  value: string,
  context?: ResolvedFormattingContext | null,
) {
  return formatDateTime(value, context);
}

export function formatProductivityDetail(summary: ProductivitySummary) {
  if (!summary) {
    return "No desktop heartbeat recorded yet";
  }

  return `${formatDuration(summary.todayActiveSeconds)} active / ${formatDuration(
    summary.todayIdleSeconds,
  )} idle / ${formatDuration(summary.todayAwaySeconds)} away`;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
