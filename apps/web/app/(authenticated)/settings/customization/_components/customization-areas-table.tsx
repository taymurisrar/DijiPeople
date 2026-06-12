"use client";

import {
  ExternalLink,
  Package,
  RefreshCw,
  Send,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import type { CommandBarItem } from "@/app/components/command-bar/types";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";

type CustomizationArea = {
  key: "modules" | "packages" | "publish-center";
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: "Available";
  lastUpdated: string | null;
};

const CUSTOMIZATION_AREAS: CustomizationArea[] = [
  {
    key: "modules",
    name: "Modules",
    description:
      "Manage configurable modules, metadata labels, ownership, and active state.",
    href: "/settings/customization/modules",
    icon: Table2,
    status: "Available",
    lastUpdated: null,
  },
  {
    key: "packages",
    name: "Packages",
    description:
      "Organize customization metadata into versioned packages for controlled delivery.",
    href: "/settings/customization/packages",
    icon: Package,
    status: "Available",
    lastUpdated: null,
  },
  {
    key: "publish-center",
    name: "Publish Center",
    description:
      "Validate and publish draft customization components into the runtime.",
    href: "/settings/customization/publish-center",
    icon: Send,
    status: "Available",
    lastUpdated: null,
  },
];

const COLUMNS: DataTableColumn<CustomizationArea>[] = [
  {
    key: "area",
    header: "Area",
    searchable: true,
    sortable: true,
    searchAccessor: (row) => row.name,
    sortAccessor: (row) => row.name,
    render: (row) => {
      const Icon = row.icon;

      return (
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-accent-soft/40 text-accent">
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate font-semibold text-foreground">
            {row.name}
          </span>
        </div>
      );
    },
  },
  {
    key: "description",
    header: "Description",
    searchable: true,
    searchAccessor: (row) => row.description,
    cellClassName: "min-w-[320px]",
    render: (row) => (
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {row.description}
      </p>
    ),
  },
  {
    key: "status",
    header: "Status",
    filterable: true,
    filterType: "select",
    filterAccessor: (row) => row.status,
    filterOptions: [{ label: "Available", value: "Available" }],
    render: (row) => <StatusPill tone="good">{row.status}</StatusPill>,
  },
  {
    key: "lastUpdated",
    header: "Last Updated",
    render: (row) => (
      <span className="text-sm text-muted">
        {row.lastUpdated ?? "Not recorded"}
      </span>
    ),
  },
  {
    key: "action",
    header: "Action",
    cellClassName: "w-32",
    render: (row) => (
      <Button
        aria-label={`Open ${row.name}`}
        href={row.href}
        rightIcon={<ExternalLink className="h-4 w-4" />}
        size="xs"
        variant="secondary"
      >
        Open
      </Button>
    ),
  },
];

export function CustomizationAreasTable() {
  const router = useRouter();
  const commandItems = useMemo<CommandBarItem[]>(
    () => [
      {
        key: "refresh",
        label: "Refresh",
        icon: RefreshCw,
        onClick: () => router.refresh(),
      },
      {
        key: "publish-center",
        label: "Open Publish Center",
        icon: Send,
        href: "/settings/customization/publish-center",
      },
    ],
    [router],
  );

  return (
    <section className="grid w-full min-w-0 max-w-none gap-3">
      <CommandBar
        className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-white shadow-sm"
        items={commandItems}
        variant="list"
      />

      <DataTable
        className="w-full min-w-0 max-w-none overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={COLUMNS}
        emptyState={
          <EmptyState
            description="No customization workspaces are currently available."
            title="No customization areas"
          />
        }
        getRowKey={(row) => row.key}
        initialSort={{ columnKey: "area", direction: "asc" }}
        pagination={{
          page: 1,
          pageSize: 10,
          total: CUSTOMIZATION_AREAS.length,
        }}
        rows={CUSTOMIZATION_AREAS}
        searchPlaceholder="Search customization areas"
        tableClassName="min-w-[760px] divide-y divide-border text-sm"
      />
    </section>
  );
}
