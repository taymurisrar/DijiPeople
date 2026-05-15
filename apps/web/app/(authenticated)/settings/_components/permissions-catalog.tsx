"use client";

import { useMemo, useState } from "react";
import { AccessPermissionRecord } from "../types";

export function PermissionsCatalog({
  permissions,
}: {
  permissions: AccessPermissionRecord[];
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? permissions.filter(
          (permission) =>
            permission.key.toLowerCase().includes(normalized) ||
            permission.name.toLowerCase().includes(normalized) ||
            permission.description.toLowerCase().includes(normalized),
        )
      : permissions;

    const grouped = new Map<string, AccessPermissionRecord[]>();

    filtered.forEach((permission) => {
      const moduleKey = permission.key.split(".")[0] || "general";
      const items = grouped.get(moduleKey) ?? [];
      items.push(permission);
      grouped.set(moduleKey, items);
    });

    return Array.from(grouped.entries())
      .map(([key, items]) => ({
        key,
        label: startCase(key),
        items: [...items].sort((left, right) => left.key.localeCompare(right.key)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [permissions, query]);

  return (
    <section className="grid gap-6">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Permissions
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Inspect the tenant permission catalog
            </h3>
          </div>
          <label className="w-full max-w-sm">
            <span className="sr-only">Search permissions</span>
            <input
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search permission code, label, or description"
              value={query}
            />
          </label>
        </div>
      </article>

      {groups.map((group) => (
        <article
          className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
          key={group.key}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                {group.label}
              </p>
              <h4 className="mt-2 text-xl font-semibold text-foreground">
                {group.items.length} permissions
              </h4>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {group.items.map((permission) => (
              <div
                className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                key={permission.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{permission.name}</p>
                    <p className="mt-1 text-sm text-muted">{permission.description}</p>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
                    {permission.key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function startCase(value: string) {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
