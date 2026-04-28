import { apiRequestJson } from "@/lib/server-api";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationTable } from "../types";

export default async function CustomizationViewsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.views.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a table to manage its saved views, list columns, filters, sorting, and visibility scope."
      eyebrow="Customization"
      title="Views"
    >
      <SectionCard
        description="Views are table-scoped so they can be validated against the correct metadata columns."
        title="Select a table"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {tables.map((table) => (
            <Button
              href={`/dashboard/settings/customization/tables/${table.tableKey}`}
              key={table.tableKey}
              variant="card"
            >
              <span>
                <span className="block font-semibold">
                  {table.pluralDisplayName}
                </span>
                <span className="mt-1 block text-sm font-normal text-muted">
                  {table.tableKey}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </SectionCard>
    </SettingsShell>
  );
}
