export type DashboardSeverity = "neutral" | "good" | "warning" | "critical";

export type DashboardAction = {
  key: string;
  label: string;
  href: string;
  description?: string;
  icon?: string;
  variant?: "primary" | "secondary" | "danger";
  badgeCount?: number;
};

export type DashboardWidgetType =
  | "metric-card"
  | "kpi-card"
  | "chart"
  | "table"
  | "work-queue"
  | "insight-list"
  | "quick-actions"
  | "profile-summary"
  | "attendance-summary"
  | "leave-summary"
  | "payroll-summary"
  | "timesheet-summary"
  | "approval-aging"
  | "compliance-status"
  | "exception-list";

export type DashboardWidget = {
  key: string;
  title: string;
  description?: string;
  type: DashboardWidgetType;
  size?: "sm" | "md" | "lg" | "xl";
  order: number;
  value?: number | string;
  subtitle?: string;
  severity?: DashboardSeverity;
  trend?: {
    direction: "up" | "down" | "flat";
    value: number | string;
    label: string;
  };
  data?: unknown;
  emptyState?: string;
  action?: DashboardAction;
  actions?: DashboardAction[];
};

export type DashboardSection = {
  key: string;
  title: string;
  description?: string;
  layout: "grid" | "list" | "table" | "split";
  order: number;
  widgets: DashboardWidget[];
};

export type DashboardView = {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  visible: boolean;
  order: number;
  badgeCount?: number;
  sections: DashboardSection[];
};

export type DashboardSummary = {
  defaultView: string;
  views: DashboardView[];
};
