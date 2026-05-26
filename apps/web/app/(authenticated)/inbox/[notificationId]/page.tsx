import Link from "next/link";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { formatDateTime } from "@/lib/formatting-context";
import type { InboxNotification } from "@/app/components/inbox/inbox-types";

type InboxDetailProps = {
  params: Promise<{ notificationId: string }>;
};

export default async function InboxDetailPage({ params }: InboxDetailProps) {
  const user = await requireSessionUser("/");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.INBOX_READ)) {
    return <AccessDeniedState />;
  }

  const { notificationId } = await params;
  const { item } = await apiRequestJson<{ item: InboxNotification }>(
    `/inbox/${notificationId}`,
  );

  return (
    <main className="space-y-6">
      <Link className="text-sm font-medium text-accent" href="/inbox">
        Back to inbox
      </Link>
      <section className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          {item.moduleKey ?? "Notification"}
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">
          {item.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {item.summary ?? item.body ?? "No additional details were provided."}
        </p>
        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
          <Detail label="Status" value={item.status} />
          <Detail label="Category" value={item.category} />
          <Detail label="Related record" value={item.relatedRecordNumber ?? item.relatedEntityId ?? "None"} />
          <Detail label="Created" value={formatDateTime(item.createdAtUtc)} />
        </dl>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}
