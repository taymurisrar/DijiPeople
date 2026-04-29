import { AuditLogRecord } from "../types";

type AuditLogTableProps = {
  items: AuditLogRecord[];
};

export function AuditLogTable({ items }: AuditLogTableProps) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <h3 className="font-serif text-2xl text-foreground">No audit entries</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          No matching audit activity was found. Adjust the filters or review a
          wider date range.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="grid gap-4 p-4 xl:hidden">
        {items.map((item) => (
          <AuditLogCard key={item.id} item={item} />
        ))}
      </div>

      <div className="hidden min-w-0 max-w-full xl:block">
        <div className="max-h-[70vh] w-full overflow-auto rounded-b-[24px]">
          <table className="min-w-[1400px] divide-y divide-border text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-muted shadow-sm">
              <tr>
                <th className="w-[170px] px-5 py-4 font-medium">When</th>
                <th className="w-[180px] px-5 py-4 font-medium">Action</th>
                <th className="w-[240px] px-5 py-4 font-medium">Entity</th>
                <th className="w-[260px] px-5 py-4 font-medium">Actor</th>
                <th className="w-[550px] px-5 py-4 font-medium">
                  Change Summary
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="align-top transition-colors hover:bg-slate-50/70"
                >
                  <td className="px-5 py-5 text-muted">
                    <div className="whitespace-nowrap">
                      {formatDateTime(item.createdAt)}
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <ActionBadge value={item.action} />
                  </td>

                  <td className="px-5 py-5">
                    <EntityBlock item={item} />
                  </td>

                  <td className="px-5 py-5">
                    <ActorBlock item={item} />
                  </td>

                  <td className="px-5 py-5">
                    <ChangeSummary item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditLogCard({ item }: { item: AuditLogRecord }) {
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">
            {formatDateTime(item.createdAt)}
          </p>
          <div className="mt-2">
            <ActionBadge value={item.action} />
          </div>
        </div>

        <FieldBlock label="Entity">
          <EntityBlock item={item} />
        </FieldBlock>

        <FieldBlock label="Actor">
          <ActorBlock item={item} />
        </FieldBlock>

        <ChangeSummary item={item} />
      </div>
    </article>
  );
}

function ChangeSummary({ item }: { item: AuditLogRecord }) {
  const before = formatSnapshot(item.beforeSnapshot);
  const after = formatSnapshot(item.afterSnapshot);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <CompactSnapshotStat label="Before" count={before.count} />
        <CompactSnapshotStat label="After" count={after.count} />
      </div>

      <details className="group min-w-0 rounded-2xl border border-border bg-slate-50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
          <span className="truncate">View snapshot details</span>
          <span className="shrink-0 text-xs text-muted group-open:hidden">
            Expand
          </span>
          <span className="hidden shrink-0 text-xs text-muted group-open:inline">
            Collapse
          </span>
        </summary>

        <div className="grid min-w-0 gap-3 border-t border-border p-3 2xl:grid-cols-2">
          <SnapshotCard label="Before" snapshot={before} />
          <SnapshotCard label="After" snapshot={after} />
        </div>
      </details>
    </div>
  );
}

function CompactSnapshotStat({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-slate-50 px-3 py-2">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">
        {count} field{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

function ActionBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex max-w-full truncate rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-foreground">
      {formatAction(value)}
    </span>
  );
}

function EntityBlock({ item }: { item: AuditLogRecord }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">
        {formatEntityType(item.entityType)}
      </div>
      <div className="mt-1 truncate text-xs text-muted">{item.entityId}</div>
    </div>
  );
}

function ActorBlock({ item }: { item: AuditLogRecord }) {
  if (!item.actorUser) {
    return <span className="font-medium text-muted">System</span>;
  }

  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">
        {getActorName(item.actorUser)}
      </div>
      <div className="mt-1 truncate text-xs text-muted">
        {item.actorUser.email}
      </div>
    </div>
  );
}

function SnapshotCard({
  label,
  snapshot,
}: {
  label: string;
  snapshot: {
    count: number;
    entries: Array<[string, string]>;
  };
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-white p-3">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </p>

        <span className="shrink-0 rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-muted">
          {snapshot.count} fields
        </span>
      </div>

      {snapshot.entries.length > 0 ? (
        <dl className="grid max-h-[260px] min-w-0 gap-2 overflow-y-auto overflow-x-hidden pr-1">
          {snapshot.entries.map(([key, fieldValue]) => (
            <div
              key={key}
              className="min-w-0 rounded-xl border border-border bg-slate-50 px-3 py-2"
            >
              <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
                {formatFieldName(key)}
              </dt>
              <dd className="mt-1 max-w-full whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                {fieldValue}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-slate-50 px-3 py-4 text-xs text-muted">
          No snapshot available
        </div>
      )}
    </div>
  );
}

function formatSnapshot(value: unknown): {
  count: number;
  entries: Array<[string, string]>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { count: 0, entries: [] };
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, fieldValue]) => fieldValue !== undefined)
    .map<[string, string]>(([key, fieldValue]) => [
      key,
      formatSnapshotValue(fieldValue),
    ]);

  return { count: entries.length, entries };
}

function formatSnapshotValue(value: unknown): string {
  if (value === null) return "Empty";
  if (value === undefined) return "Not available";

  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "Empty";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return formatDateTime(value.toISOString());
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to render value";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAction(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEntityType(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFieldName(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getActorName(actorUser: AuditLogRecord["actorUser"]) {
  if (!actorUser) {
    return "System";
  }

  const fullName = [actorUser.firstName, actorUser.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || actorUser.email || "Unknown user";
}