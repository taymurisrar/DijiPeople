import { ArrowRight, Database, FormInput, LayoutList, Table2 } from "lucide-react";
import { apiRequestJson } from "@/lib/server-api";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import {
  CustomizationPublishHistoryItem,
  CustomizationSummary,
} from "./types";
import { PublishPanel } from "./_components/publish-panel";

const quickLinks = [
  {
    href: "/dashboard/settings/customization/tables",
    title: "Tables",
    description: "Review configurable system tables and tenant-facing labels.",
    icon: Table2,
  },
  {
    href: "/dashboard/settings/customization/columns",
    title: "Columns",
    description: "Open a table to rename, hide, require, and reorder fields.",
    icon: Database,
  },
  {
    href: "/dashboard/settings/customization/views",
    title: "Views",
    description: "Configure saved list views, filters, sorting, and scope.",
    icon: LayoutList,
  },
  {
    href: "/dashboard/settings/customization/forms",
    title: "Forms",
    description: "Manage form metadata for main, quick, create, and edit forms.",
    icon: FormInput,
  },
];

export default async function CustomizationOverviewPage() {
  await requireSettingsPermissions(["customization.read"]);
  const [summary, publishHistory] = await Promise.all([
    apiRequestJson<CustomizationSummary>("/customization"),
    apiRequestJson<CustomizationPublishHistoryItem[]>(
      "/customization/publish-history",
    ).catch(() => []),
  ]);

  return (
    <SettingsShell
      description="Configure tenant-specific metadata for existing DijiPeople system tables without creating runtime database tables."
      eyebrow="Customization"
      title="Customization"
    >
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="System tables" value={summary.systemTables} />
        <Metric label="Table overrides" value={summary.tableOverrides} />
        <Metric label="Tenant columns" value={summary.tenantColumns} />
        <Metric label="Published versions" value={summary.publishSnapshots} />
      </section>

      <SectionCard
        description="This phase intentionally supports metadata customization for existing modules only. Custom tables can be introduced later without changing this workspace pattern."
        title="What can be customized"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {quickLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Button
                className="h-full justify-between"
                href={item.href}
                key={item.href}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                variant="card"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm font-normal leading-6 text-muted">
                      {item.description}
                    </span>
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </SectionCard>

      <PublishPanel history={publishHistory} />
    </SettingsShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[22px] border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
