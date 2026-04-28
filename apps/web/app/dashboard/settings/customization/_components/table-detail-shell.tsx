"use client";

import { useState } from "react";
import { SectionCard } from "@/app/components/ui/section-card";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
  CustomizationView,
} from "../types";
import { ColumnsManagement } from "./columns-management";
import { FormsManagement } from "./forms-management";
import { ViewsManagement } from "./views-management";

type TabKey = "columns" | "views" | "forms" | "settings";

type TableDetailShellProps = {
  table: CustomizationTable;
  columns: CustomizationColumn[];
  views: CustomizationView[];
  forms: CustomizationForm[];
  lookupTables: CustomizationTable[];
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "columns", label: "Columns" },
  { key: "views", label: "Views" },
  { key: "forms", label: "Forms" },
  { key: "settings", label: "Settings" },
];

export function TableDetailShell({
  table,
  columns,
  views,
  forms,
  lookupTables,
}: TableDetailShellProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("columns");

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-4">
        <Metric label="Columns" value={columns.length} />
        <Metric label="Views" value={views.length} />
        <Metric label="Forms" value={forms.length} />
        <Metric label="Mode" value={table.isCustomTable ? "Custom" : "System"} />
      </section>

      <div className="flex flex-wrap gap-2 rounded-[24px] border border-border bg-surface p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-accent text-white"
                : "text-muted hover:bg-accent-soft hover:text-foreground"
            }`}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "columns" ? (
        <ColumnsManagement
          columns={columns}
          lookupTables={lookupTables}
          table={table}
        />
      ) : null}
      {activeTab === "views" ? (
        <ViewsManagement columns={columns} table={table} views={views} />
      ) : null}
      {activeTab === "forms" ? (
        <FormsManagement columns={columns} forms={forms} table={table} />
      ) : null}
      {activeTab === "settings" ? <SettingsTab table={table} /> : null}
    </div>
  );
}

function SettingsTab({ table }: { table: CustomizationTable }) {
  return (
    <SectionCard
      description="Table-level metadata controls how this system table appears in tenant-facing customization-aware screens."
      title="Table settings"
    >
      <dl className="grid gap-4 md:grid-cols-2">
        <Meta label="System name" value={table.systemName} />
        <Meta label="Table key" value={table.tableKey} />
        <Meta label="Module" value={table.moduleKey} />
        <Meta label="Icon" value={table.icon ?? "Not set"} />
        <Meta label="Active" value={table.isActive ? "Yes" : "No"} />
        <Meta
          label="Customizable"
          value={table.isCustomizable ? "Yes" : "No"}
        />
      </dl>
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
