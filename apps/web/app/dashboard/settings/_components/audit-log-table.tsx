import { AuditLogRecord } from "../types";

type AuditLogTableProps = {
  items: AuditLogRecord[];
};

export function AuditLogTable({ items }: AuditLogTableProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-[24px] border border-dashed border-border bg-white p-10 text-center shadow-sm">
        <h3 className="font-serif text-2xl text-foreground">No audit entries</h3>
        <p className="mt-3 text-sm text-muted">
          Try widening the filters or perform an admin action to generate a new
          audit event.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">When</th>
              <th className="px-5 py-4 font-medium">Action</th>
              <th className="px-5 py-4 font-medium">Entity</th>
              <th className="px-5 py-4 font-medium">Actor</th>
              <th className="px-5 py-4 font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="px-5 py-4 text-muted">
                  {formatDateTime(item.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-foreground">
                    {item.action}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="font-medium text-foreground">{item.entityType}</div>
                  <div className="mt-1 text-xs text-muted">{item.entityId}</div>
                </td>
                <td className="px-5 py-4">
                  {item.actorUser ? (
                    <div>
                      <div className="font-medium text-foreground">
                        {item.actorUser.firstName} {item.actorUser.lastName}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {item.actorUser.email}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted">System</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <SnapshotCard label="Before" value={item.beforeSnapshot} />
                    <SnapshotCard label="After" value={item.afterSnapshot} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-2xl border border-border bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
        {formatSnapshot(value)}
      </pre>
    </div>
  );
}

function formatSnapshot(value: unknown) {
  if (value === null || value === undefined) {
    return "No snapshot";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to render snapshot";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
