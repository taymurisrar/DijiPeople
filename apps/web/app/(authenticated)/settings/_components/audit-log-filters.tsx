"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type AuditLogFiltersProps = {
  actions: string[];
  actors: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  currentAction?: string;
  currentActorUserId?: string;
  currentEntityType?: string;
  currentFromDate?: string;
  currentToDate?: string;
  entityTypes: string[];
};

export function AuditLogFilters({
  actions,
  actors,
  currentAction,
  currentActorUserId,
  currentEntityType,
  currentFromDate,
  currentToDate,
  entityTypes,
}: AuditLogFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [action, setAction] = useState(currentAction ?? "");
  const [entityType, setEntityType] = useState(currentEntityType ?? "");
  const [actorUserId, setActorUserId] = useState(currentActorUserId ?? "");
  const [fromDate, setFromDate] = useState(currentFromDate ?? "");
  const [toDate, setToDate] = useState(currentToDate ?? "");

  const activeFiltersCount = useMemo(() => {
    return [action, entityType, actorUserId, fromDate, toDate].filter(
      (v) => v && v.trim().length > 0,
    ).length;
  }, [action, entityType, actorUserId, fromDate, toDate]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams(searchParams.toString());

    setQueryParam(params, "action", action);
    setQueryParam(params, "entityType", entityType);
    setQueryParam(params, "actorUserId", actorUserId);
    setQueryParam(params, "fromDate", fromDate);
    setQueryParam(params, "toDate", toDate);

    params.delete("page");

    router.push(`${pathname}?${params.toString()}`);
  }

  function handleReset() {
    setAction("");
    setEntityType("");
    setActorUserId("");
    setFromDate("");
    setToDate("");
    router.push(pathname);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-border bg-white shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-serif text-lg text-foreground">Filter Audit Logs</h3>
          <p className="mt-1 text-sm text-muted">
            Narrow down events by action, entity, actor, or time range.
          </p>
        </div>

        {activeFiltersCount > 0 && (
          <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">
            {activeFiltersCount} active filter
            {activeFiltersCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Fields */}
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-5">
        {/* Action */}
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="input"
          >
            <option value="">All actions</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {formatLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        {/* Entity */}
        <Field label="Entity type">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="input"
          >
            <option value="">All entity types</option>
            {entityTypes.map((item) => (
              <option key={item} value={item}>
                {formatLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        {/* Actor */}
        <Field label="Actor">
          <select
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            className="input"
          >
            <option value="">All actors</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.firstName} {actor.lastName} ({actor.email})
              </option>
            ))}
          </select>
        </Field>

        {/* From */}
        <Field label="From date">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input"
          />
        </Field>

        {/* To */}
        <Field label="To date">
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input"
          />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
        >
          Reset
        </button>

        <button
          type="submit"
          className="rounded-2xl bg-foreground px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          Apply Filters
        </button>
      </div>
    </form>
  );
}

/* ---------- Reusable Field Wrapper ---------- */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------- Helpers ---------- */

function setQueryParam(params: URLSearchParams, key: string, value: string) {
  const nextValue = value.trim();

  if (!nextValue) {
    params.delete(key);
    return;
  }

  params.set(key, nextValue);
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}