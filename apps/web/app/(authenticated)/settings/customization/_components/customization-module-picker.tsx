import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import type { CustomizationTable } from "../types";

type CustomizationTarget =
  | "columns"
  | "forms"
  | "views"
  | "actionBars"
  | "widgets";

export function CustomizationModulePicker({
  description,
  tables,
  target,
}: {
  description: string;
  tables: readonly CustomizationTable[];
  target: CustomizationTarget;
}) {
  return (
    <SectionCard description={description} title="Select a module">
      {tables.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {tables.map((table) => (
            <Button
              href={customizationTargetHref(table.tableKey, target)}
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
      ) : (
        <EmptyState
          description="No customizable modules are available for this tenant."
          title="No modules"
        />
      )}
    </SectionCard>
  );
}

function customizationTargetHref(
  tableKey: string,
  target: CustomizationTarget,
) {
  const base = `/settings/customization/tables/${encodeURIComponent(tableKey)}`;
  if (target === "columns" || target === "forms" || target === "views") {
    return `${base}/${target}`;
  }
  return `${base}?tab=${encodeURIComponent(target)}`;
}
