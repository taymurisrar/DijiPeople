import { AccessDeniedState } from "../_components/access-denied-state";
import { InboxTable } from "@/app/components/inbox/inbox-table";
import type { InboxResponse } from "@/app/components/inbox/inbox-types";
import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";

type InboxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const user = await requireSessionUser("/");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.INBOX_READ)) {
    return <AccessDeniedState />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = buildQuery(resolvedSearchParams);
  const response = await apiRequestJson<InboxResponse>(
    `/inbox${query ? `?${query}` : ""}`,
  );

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work queue
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Inbox
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Notifications, action-required alerts, and retained work history.
        </p>
      </section>
      <InboxViewTabs />
      <InboxTable response={response} />
    </main>
  );
}

function InboxViewTabs() {
  const views = [
    ["all", "All"],
    ["unread", "Unread"],
    ["action-required", "Action Required"],
    ["approvals", "Approvals"],
    ["employee", "Employee"],
    ["attendance", "Attendance"],
    ["leave", "Leave"],
    ["archived", "Archived"],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {views.map(([view, label]) => (
        <a
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
          href={view === "all" ? "/inbox" : `/inbox?view=${view}`}
          key={view}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

function buildQuery(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  return search.toString();
}
