"use client";

import { Database, FileJson, FormInput, LayoutList } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { StatusPill } from "@/app/components/ui/status-pill";
import type {
  DefaultSolution,
  DefaultSolutionComponent,
  DefaultSolutionComponentType,
} from "../types";

const componentLabels: Record<DefaultSolutionComponentType, string> = {
  table: "Tables",
  column: "Columns",
  form: "Forms",
  view: "Views",
  optionSet: "Option Sets",
  lookup: "Lookups",
};

const componentIcons = {
  table: Database,
  column: FileJson,
  form: FormInput,
  view: LayoutList,
  optionSet: FileJson,
  lookup: FileJson,
};

type Props = {
  solution: DefaultSolution;
};

export function DefaultSolutionBrowser({ solution }: Props) {
  const [showInternal, setShowInternal] = useState(false);
  const visibleComponents = useMemo(
    () =>
      showInternal
        ? solution.components
        : solution.components.filter(
            (component) =>
              component.isVisibleInCustomization && component.isActive,
          ),
    [showInternal, solution.components],
  );
  const moduleGroups = useMemo(() => {
    return visibleComponents
      .filter((component) => component.componentType === "table")
      .reduce<Record<string, DefaultSolutionComponent[]>>((acc, component) => {
        const key = component.moduleKey ?? "Other";
        acc[key] ??= [];
        acc[key].push(component);
        return acc;
      }, {});
  }, [visibleComponents]);
  const groups = visibleComponents.reduce<
    Record<DefaultSolutionComponentType, DefaultSolutionComponent[]>
  >(
    (acc, component) => {
      acc[component.componentType].push(component);
      return acc;
    },
    {
      table: [],
      column: [],
      form: [],
      view: [],
      optionSet: [],
      lookup: [],
    },
  );

  return (
    <div className="grid gap-5">
      <div className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Default Solution
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {solution.displayName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {solution.description ??
                "All system and custom metadata components available to this tenant."}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusPill tone={solution.isManaged ? "neutral" : "good"}>
              {solution.isManaged ? "Managed" : "Unmanaged-ready"}
            </StatusPill>
            <StatusPill tone="neutral">
              {visibleComponents.length} components
            </StatusPill>
            <Button
              onClick={() => setShowInternal((current) => !current)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {showInternal ? "Hide internal" : "Show internal"}
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Business modules
            </h3>
            <p className="mt-1 text-sm text-muted">
              Default Solution tables exposed for tenant customization.
            </p>
          </div>
          <StatusPill tone="neutral">
            {Object.keys(moduleGroups).length} modules
          </StatusPill>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(moduleGroups).map(([moduleKey, items]) => (
            <div
              className="rounded-2xl border border-border bg-slate-50 p-4"
              key={moduleKey}
            >
              <p className="text-sm font-semibold text-foreground">
                {formatModuleLabel(moduleKey)}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {items.length}
              </p>
              <p className="mt-1 text-xs text-muted">table components</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {Object.entries(groups).map(([type, items]) => {
          const componentType = type as DefaultSolutionComponentType;
          const Icon = componentIcons[componentType];
          return (
            <div
              className="rounded-[20px] border border-border bg-surface p-4 shadow-sm"
              key={type}
            >
              <Icon className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {componentLabels[componentType]}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {items.length}
              </p>
            </div>
          );
        })}
      </section>

      {(Object.keys(groups) as DefaultSolutionComponentType[]).map((type) => (
        <SolutionGroup components={groups[type]} key={type} type={type} />
      ))}
    </div>
  );
}

function formatModuleLabel(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SolutionGroup({
  components,
  type,
}: {
  components: DefaultSolutionComponent[];
  type: DefaultSolutionComponentType;
}) {
  if (components.length === 0) return null;

  const columns: DataTableColumn<DefaultSolutionComponent>[] = [
    {
      key: "displayName",
      header: "Display name",
      sortable: true,
      sortAccessor: (row) => row.displayName,
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.displayName}</p>
          {row.tableDisplayName ? (
            <p className="mt-1 text-xs text-muted">{row.tableDisplayName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "logicalName",
      header: "Logical name",
      sortable: true,
      sortAccessor: (row) => row.logicalName,
      render: (row) => (
        <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {row.logicalName}
        </code>
      ),
    },
    {
      key: "system",
      header: "Origin",
      render: (row) => (
        <StatusPill tone={row.isSystem ? "neutral" : "good"}>
          {row.isSystem ? "System" : "Custom"}
        </StatusPill>
      ),
    },
    {
      key: "managed",
      header: "Layer",
      render: (row) => (
        <StatusPill tone={row.isManaged ? "neutral" : "muted"}>
          {row.isManaged ? "Managed" : "Unmanaged-ready"}
        </StatusPill>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (row) => (
        <StatusPill tone={row.isActive ? "good" : "muted"}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.componentType === "table" ? (
          <Button
            href={`/settings/customization/tables/${row.logicalName}`}
            size="sm"
            variant="secondary"
          >
            Open
          </Button>
        ) : row.tableKey ? (
          <Button
            href={`/settings/customization/tables/${row.tableKey}`}
            size="sm"
            variant="ghost"
          >
            Open table
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {componentLabels[type]}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Components registered in the tenant Default Solution.
          </p>
        </div>
        <StatusPill tone="neutral">{components.length}</StatusPill>
      </div>
      <DataTable
        columns={columns}
        getRowKey={(row) => row.id}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        rows={components}
      />
    </section>
  );
}
