"use client";

import { Clipboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
  CustomizationTable,
  CustomizationView,
} from "../types";
import { ColumnsManagement } from "./columns-management";
import { FormsManagement } from "./forms-management";
import { MetadataComponentsManagement } from "./metadata-components-management";
import { ViewsManagement } from "./views-management";

export type TabKey =
  | "columns"
  | "forms"
  | "views"
  | "choiceLists"
  | "relationships"
  | "actionBars"
  | "widgets"
  | "settings";

type TableDetailShellProps = {
  table: CustomizationTable;
  columns: CustomizationColumn[];
  views: CustomizationView[];
  forms: CustomizationForm[];
  lookupTables: CustomizationTable[];
  packages: CustomizationPackage[];
  initialTab?: TabKey;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "columns", label: "Fields" },
  { key: "forms", label: "Forms" },
  { key: "views", label: "Views" },
  { key: "choiceLists", label: "Choice Lists" },
  { key: "relationships", label: "Relationships" },
  { key: "actionBars", label: "Action Bars" },
  { key: "widgets", label: "Widgets" },
  { key: "settings", label: "Module Properties" },
];

export function TableDetailShell({
  table,
  columns,
  views,
  forms,
  lookupTables,
  packages,
  initialTab = "columns",
}: TableDetailShellProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [metadataCounts, setMetadataCounts] = useState({
    actionBars: 0,
    choiceLists: 0,
    relationships: 0,
    widgets: 0,
  });

  useEffect(() => {
    const componentTypes = [
      ["choiceLists", "choiceList"],
      ["relationships", "relationship"],
      ["actionBars", "actionBar"],
      ["widgets", "widget"],
    ] as const;
    let cancelled = false;

    async function loadCounts() {
      const results = await Promise.all(
        componentTypes.map(async ([key, componentType]) => {
          const response = await fetch(
            `/api/customization/tables/${table.tableKey}/metadata-components?componentType=${componentType}`,
          );
          const data = (await response.json().catch(() => [])) as unknown;
          return [key, Array.isArray(data) ? data.length : 0] as const;
        }),
      );
      if (!cancelled) {
        setMetadataCounts(Object.fromEntries(results) as typeof metadataCounts);
      }
    }

    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, [table.tableKey]);

  return (
    <div
      className={`grid w-full max-w-full gap-4 overflow-x-hidden ${
        sidebarCollapsed
          ? "xl:grid-cols-[56px_minmax(0,1fr)]"
          : "xl:grid-cols-[240px_minmax(0,1fr)]"
      }`}
    >
      <aside className="min-w-0 rounded-lg border border-border bg-surface p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          {!sidebarCollapsed ? (
            <div>
              <p className="text-xs font-semibold uppercase text-muted">
                Customization
              </p>
              <p className="text-sm font-semibold text-foreground">Modules</p>
            </div>
          ) : null}
          <button
            aria-label={
              sidebarCollapsed
                ? "Expand customization sidebar"
                : "Collapse customization sidebar"
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        {!sidebarCollapsed ? (
          <nav className="grid gap-1 text-sm">
            <Link
              className="rounded-md px-3 py-2 text-muted transition hover:bg-muted/20 hover:text-foreground"
              href="/settings/customization/tables"
            >
              All Modules
            </Link>
            {tabs.map((tab) => (
              <button
                className={`rounded-md px-3 py-2 text-left font-medium transition ${
                  activeTab === tab.key
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-muted/20 hover:text-foreground"
                }`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}
      </aside>

      <div className="min-w-0 grid gap-4">
        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:grid-cols-5">
          <Metric label="Fields" value={columns.length} />
          <Metric label="Forms" value={forms.length} />
          <Metric label="Views" value={views.length} />
          <Metric
            label="Metadata"
            value={
              metadataCounts.choiceLists +
              metadataCounts.relationships +
              metadataCounts.actionBars +
              metadataCounts.widgets
            }
          />
          <Metric
            label="Source"
            value={table.isCustomTable ? "Custom" : "System"}
          />
        </section>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2 shadow-sm">
          {tabs.map((tab) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
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

        <div className="text-xs text-muted">
          Customization &gt; Modules &gt; {table.displayName}
        </div>

        {activeTab === "columns" ? (
          <ColumnsManagement
            columns={columns}
            lookupTables={lookupTables}
            packages={packages}
            table={table}
          />
        ) : null}
        {activeTab === "views" ? (
          <ViewsManagement
            columns={columns}
            packages={packages}
            table={table}
            views={views}
          />
        ) : null}
        {activeTab === "forms" ? (
          <FormsManagement
            columns={columns}
            forms={forms}
            packages={packages}
            table={table}
          />
        ) : null}
        {activeTab === "choiceLists" ? (
          <MetadataComponentsManagement
            componentType="choiceList"
            lookupTables={lookupTables}
            onCountChange={(choiceLists) =>
              setMetadataCounts((current) => ({ ...current, choiceLists }))
            }
            packages={packages}
            table={table}
          />
        ) : null}
        {activeTab === "relationships" ? (
          <MetadataComponentsManagement
            componentType="relationship"
            lookupTables={lookupTables}
            onCountChange={(relationships) =>
              setMetadataCounts((current) => ({ ...current, relationships }))
            }
            packages={packages}
            table={table}
          />
        ) : null}
        {activeTab === "actionBars" ? (
          <MetadataComponentsManagement
            componentType="actionBar"
            lookupTables={lookupTables}
            onCountChange={(actionBars) =>
              setMetadataCounts((current) => ({ ...current, actionBars }))
            }
            packages={packages}
            table={table}
          />
        ) : null}
        {activeTab === "widgets" ? (
          <MetadataComponentsManagement
            componentType="widget"
            lookupTables={lookupTables}
            onCountChange={(widgets) =>
              setMetadataCounts((current) => ({ ...current, widgets }))
            }
            packages={packages}
            readOnly
            table={table}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsTab
            counts={{
              actionBars: metadataCounts.actionBars,
              choiceLists: metadataCounts.choiceLists,
              fields: columns.length,
              forms: forms.length,
              relationships: metadataCounts.relationships,
              views: views.length,
              widgets: metadataCounts.widgets,
            }}
            table={table}
          />
        ) : null}
      </div>
    </div>
  );
}

function SettingsTab({
  counts,
  table,
}: {
  counts: {
    actionBars: number;
    choiceLists: number;
    fields: number;
    forms: number;
    relationships: number;
    views: number;
    widgets: number;
  };
  table: CustomizationTable;
}) {
  return (
    <SectionCard
      description="Module-level metadata controls how this module appears in customization-aware runtime screens. System identity and routes are locked."
      title="Module Properties"
    >
      <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Meta
          copyValue={table.displayName}
          label="Singular name"
          value={table.displayName}
        />
        <Meta
          copyValue={table.pluralDisplayName}
          label="Plural name"
          value={table.pluralDisplayName}
        />
        <Meta
          copyValue={table.tableKey}
          label="Logical name"
          locked
          value={table.tableKey}
        />
        <Meta
          copyValue={`/settings/customization/tables/${table.tableKey}`}
          label="Route"
          locked
          value={`/settings/customization/tables/${table.tableKey}`}
        />
        <Meta label="Primary name field" value="Metadata-ready" />
        <Meta label="Owner required" value="Yes" />
        <Meta label="Status/Sub Status" value="Enabled" />
        <Meta label="Timeline" value="Enabled" />
        <Meta label="Change History" value="Enabled" />
        <Meta label="Audit" value="Enabled" />
        <Meta label="Icon" value={table.icon ?? "Not set"} />
        <Meta label="Color" value="Metadata-ready" />
        <Meta
          label="Source"
          value={table.isCustomTable ? "Custom" : "System"}
        />
        <Meta label="Package" value="Default Package" />
        <Meta
          label="Lifecycle"
          value={table.isActive ? "Active" : "Inactive"}
        />
        <Meta label="Fields" value={String(counts.fields)} />
        <Meta label="Forms" value={String(counts.forms)} />
        <Meta label="Views" value={String(counts.views)} />
        <Meta label="Choice Lists" value={String(counts.choiceLists)} />
        <Meta label="Relationships" value={String(counts.relationships)} />
        <Meta label="Action Bars" value={String(counts.actionBars)} />
        <Meta label="Widgets" value={String(counts.widgets)} />
        <Meta label="Description" value={table.description ?? "Not set"} />
        <Meta
          label="Customizable"
          value={table.isCustomizable ? "Yes" : "No"}
        />
        <Meta
          label="Deletion"
          value={
            table.isSystem
              ? "System modules cannot be deleted"
              : "Dependency guarded"
          }
        />
      </dl>
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Meta({
  copyValue,
  label,
  locked = false,
  value,
}: {
  copyValue?: string;
  label: string;
  locked?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <dt className="flex items-center justify-between gap-2 text-xs font-semibold uppercase text-muted">
        <span>{label}</span>
        {locked ? (
          <span className="text-[10px] normal-case">Locked</span>
        ) : null}
      </dt>
      <dd className="mt-1 flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
        <span className="min-w-0 truncate">{value}</span>
        {copyValue ? (
          <Button
            aria-label={`Copy ${label}`}
            leftIcon={<Clipboard className="h-3.5 w-3.5" />}
            onClick={() => void navigator.clipboard.writeText(copyValue)}
            size="icon-xs"
            type="button"
            variant="ghost"
          />
        ) : null}
      </dd>
    </div>
  );
}
