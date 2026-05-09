import type { ProductivitySummary } from "./types";

export function formatDashboardDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString();
}

export function formatDashboardTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDashboardDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
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