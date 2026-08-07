import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import { ImportValidatorPanel } from "./_components/import-validator-panel";
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
      title="Import & Export"
      description="Download templates, import records in bulk, and export module data."
    >
      {modulesResult.ok ? (
        <div className="grid gap-8">
          <TemplateDownloadPanel modules={modulesResult.value} />
          {canValidate ? (
            <ImportValidatorPanel modules={modulesResult.value} />
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Data management is unavailable right now. ({modulesResult.message})
        </div>
      )}
    </SettingsShell>
  );
}
