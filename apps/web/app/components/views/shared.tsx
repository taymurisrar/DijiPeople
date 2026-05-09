import Link from "next/link";
import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import type { ModuleViewSelectorConfig } from "@/app/components/view-selector/types";
import type { DashboardNotification, PriorityItem } from "./types";

export function ModuleViewSelectorBlock({
  dashboardViews,
}: {
  dashboardViews?: ModuleViewSelectorConfig;
}) {
  if (!dashboardViews?.enabled) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface px-4 py-2 shadow-sm">
      <ModuleViewSelector {...dashboardViews} />
    </section>
  );
}

export function StatusCard({
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: string;
}) {
  return (
    <article className="rounded-[20px] border border-border bg-surface-strong p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {title}
      </p>
      <h4 className="mt-3 text-xl font-semibold text-foreground">{value}</h4>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function DashboardEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-white/80 p-6 text-sm text-muted">
      {message}
    </div>
  );
}

export function DashboardNotificationList({
  notifications,
}: {
  notifications: DashboardNotification[];
}) {
  if (notifications.length === 0) {
    return <DashboardEmptyState message="No immediate alerts right now." />;
  }

  return (
    <div className="mt-5 grid gap-3">
      {notifications.map((notification) => (
        <DashboardActionItem key={notification.id} item={notification} />
      ))}
    </div>
  );
}

export function DashboardPriorityList({ items }: { items: PriorityItem[] }) {
  if (items.length === 0) {
    return <DashboardEmptyState message="You are all caught up for now." />;
  }

  return (
    <div className="mt-5 grid gap-3">
      {items.map((item) => (
        <DashboardActionItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function DashboardActionItem({
  item,
}: {
  item: {
    title: string;
    detail: string;
    href?: string;
  };
}) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-4">
      <p className="text-sm font-semibold text-foreground">{item.title}</p>
      <p className="mt-1 text-sm text-muted">{item.detail}</p>

      {item.href ? (
        <Link
          href={item.href}
          className="mt-3 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
        >
          Open
        </Link>
      ) : null}
    </div>
  );
}