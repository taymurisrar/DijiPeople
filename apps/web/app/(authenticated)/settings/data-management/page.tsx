import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import { ExportPanel } from "./_components/export-panel";
import { ImportWorkspace } from "./_components/import-workspace";
import { TemplateDownloadPanel } from "./_components/template-download-panel";

export type DataModuleSummary = {
  moduleKey: string;
  label: string;
  supportsImport: boolean;
  supportsExport: boolean;
  matchingKeys: readonly string[];
  fieldCount: number;
  requiredFieldCount: number;
};

export default async function DataManagementPage() {
  const user = await requireSettingsPermissions(["data-management.view"]);

  // Validation is a separate permission, so viewers who cannot run it are not
  // shown an upload control that would only fail.
  const canValidate = hasSettingsPermission(
    user,
    "data-management.import.validate",
  );
  const canExecute = hasSettingsPermission(
    user,
    "data-management.import.execute",
  );
  const canExport = hasSettingsPermission(user, "data-management.export");

  // A failed load must not render as "no modules", which would look like the
  // feature is empty rather than unavailable.
  const modulesResult = await apiRequestJson<DataModuleSummary[]>(
    "/data-management/modules",
  )
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to load data management modules.",
    }));

  return (
    <SettingsShell
      eyebrow="Data Management"
      showHeader
      title="Import & Export"
      description="Download templates, import records in bulk, and export module data."
    >
      {modulesResult.ok ? (
        <div className="grid gap-8">
          <TemplateDownloadPanel modules={modulesResult.value} />
          {canValidate ? (
            <ImportWorkspace
              canExecute={canExecute}
              modules={modulesResult.value}
            />
          ) : null}
          {canExport ? <ExportPanel modules={modulesResult.value} /> : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Data management is unavailable right now. ({modulesResult.message})
        </div>
      )}
    </SettingsShell>
  );
}
