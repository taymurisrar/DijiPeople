import {
  AlertTriangle,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export type Severity = "CRITICAL" | "WARNING" | "INFO";

/** One row of the feed, as `platform-notifications.ts` projects it. */
export type Notification = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  action: string | null;
  occurredAt: string;
  eventCode: string;
  entityType: string | null;
  entityId?: string | null;
  href: string | null;
  unread: boolean;
  category?: Category;
  /** True only where a person has something to do. */
  actionRequired?: boolean;
  actionLabel?: string | null;
  subject?: { type: string; id: string; label: string | null } | null;
  /** Who it concerns, e.g. "Acme Ltd (acme) · Acme Holdings". */
  context?: string | null;
  /** Identical repeats this row stands for. */
  count?: number;
};

export type Category =
  | "onboarding"
  | "billing"
  | "tenants"
  | "agreements"
  | "support"
  | "leads"
  | "system";

/** Category as a chip — text, so it never relies on colour alone. */
export const CATEGORY_LABEL: Record<Category, string> = {
  onboarding: "Onboarding",
  billing: "Billing",
  tenants: "Tenants",
  agreements: "Agreements",
  support: "Support",
  leads: "Leads",
  system: "System",
};

/**
 * A 401 means the session has ended; asking again cannot help.
 *
 * BUG-3895 — the bell polled every five minutes forever after sign-out, and
 * each refusal was a row in the error log. Same defect `apps/web` fixed as
 * BUG-2459; kept as a pure function so the rule is testable without a mounted
 * component.
 */
export function isSessionEnded(status: number) {
  return status === 401;
}

export type Feed = {
  items: Notification[];
  unreadCount: number;
  /**
   * The API stopped scanning before the end of the window, so `unreadCount` is
   * a floor. The badge renders `99+` rather than an exact number nothing can
   * stand behind.
   */
  scanTruncated?: boolean;
  readAt: string | null;
};

/** The read endpoint, and the one that clears the unread mark. */
export const NOTIFICATIONS_ENDPOINT = "/api/platform/events/notifications";
export const NOTIFICATIONS_READ_ENDPOINT =
  "/api/platform/events/notifications/read";

/**
 * The badge and the page read the same count from the same endpoint, so
 * clearing it in one place has to reach the other. A page reload would do it
 * too — and leaving the badge lit until the next one is precisely the "dot that
 * means nothing" both components exist to stop being.
 */
export const NOTIFICATIONS_READ_EVENT = "dijipeople:notifications-read";

/**
 * Severity as it is drawn.
 *
 * Shared by the popover and the page deliberately: two severity scales that
 * drift apart is the same class of defect as two permission catalogs. The
 * label is not decoration — it is what carries the severity for anybody who
 * cannot rely on the colour.
 */
export const SEVERITY: Record<
  Severity,
  { label: string; icon: LucideIcon; pill: string; dot: string }
> = {
  CRITICAL: {
    label: "Critical",
    icon: AlertTriangle,
    pill: "bg-rose-100 text-rose-800",
    dot: "text-rose-600",
  },
  WARNING: {
    label: "Warning",
    icon: TriangleAlert,
    pill: "bg-amber-100 text-amber-900",
    dot: "text-amber-600",
  },
  INFO: {
    label: "Info",
    icon: Info,
    pill: "bg-slate-100 text-slate-700",
    dot: "text-slate-500",
  },
};

/**
 * "4 minutes ago", falling back to an absolute time once relative stops being
 * the more useful phrasing. An unparseable timestamp is returned untouched
 * rather than rendered as "Invalid Date".
 */
export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return date.toLocaleString();
}
