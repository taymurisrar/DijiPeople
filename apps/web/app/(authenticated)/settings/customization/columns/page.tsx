import { apiRequestJson } from "@/lib/server-api";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationTable } from "../types";

export default async function CustomizationColumnsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.columns.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a module to configure its fields. Field changes stay tenant-scoped and metadata-only."
      eyebrow="Customization"
      title="Fields"
    >
      <SectionCard
        description="Field editing happens inside each module so validation can use that module's system fields and tenant fields together."
        title="Select a module"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {tables.map((table) => (
            <Button
              href={`/settings/customization/tables/${table.tableKey}`}
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
