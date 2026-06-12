import { apiRequestJson } from "@/lib/server-api";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationTable } from "../types";

export default async function CustomizationFormsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.forms.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a module to manage form layout metadata for main, quick create, create, and edit experiences."
      eyebrow="Customization"
      title="Forms"
    >
      <SectionCard
        description="Forms are configured inside each module so layouts can be validated against available fields."
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
