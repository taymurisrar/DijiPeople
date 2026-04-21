"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

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
      className="grid gap-4 rounded-[24px] border border-border bg-white p-6 shadow-sm lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
      onSubmit={handleSubmit}
    >
      <label className="grid gap-2 text-sm text-muted">
        <span>Action</span>
        <select
          className="rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/40"
          onChange={(event) => setAction(event.target.value)}
          value={action}
        >
          <option value="">All actions</option>
          {actions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-muted">
        <span>Entity type</span>
        <select
          className="rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/40"
          onChange={(event) => setEntityType(event.target.value)}
          value={entityType}
        >
          <option value="">All entity types</option>
          {entityTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-muted">
        <span>Actor</span>
        <select
          className="rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/40"
          onChange={(event) => setActorUserId(event.target.value)}
          value={actorUserId}
        >
          <option value="">All actors</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.firstName} {actor.lastName} ({actor.email})
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-muted">
        <span>From date</span>
        <input
          className="rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/40"
          onChange={(event) => setFromDate(event.target.value)}
          type="date"
          value={fromDate}
        />
      </label>

      <label className="grid gap-2 text-sm text-muted">
        <span>To date</span>
        <input
          className="rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/40"
          onChange={(event) => setToDate(event.target.value)}
          type="date"
          value={toDate}
        />
      </label>

      <div className="flex items-end gap-3">
        <button
          className="rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
          type="submit"
        >
          Apply
        </button>
        <button
          className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={handleReset}
          type="button"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

function setQueryParam(params: URLSearchParams, key: string, value: string) {
  const nextValue = value.trim();

  if (nextValue.length === 0) {
    params.delete(key);
    return;
  }

  params.set(key, nextValue);
}
