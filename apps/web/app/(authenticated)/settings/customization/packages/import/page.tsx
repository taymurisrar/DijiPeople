import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../../_lib/customization-access";
import { CustomizationAccessDenied } from "../../_components/customization-access-denied";
import { PackageImportWizard } from "../../_components/package-import-wizard";
import type { PackageOperation, PackageOperationSummary } from "../../types";

type PackageImportPageProps = {
  searchParams?: Promise<{ operation?: string }>;
};

/*
 * TASK-0033 — import a `.djpkg` exported from another environment. `?operation`
 * reopens an analysis or a finished import from the deployment history.
 */
export default async function PackageImportPage({
  searchParams,
}: PackageImportPageProps) {
  const { allowed } = await requireCustomizationPage("packageImport");
  if (!allowed) return <CustomizationAccessDenied />;

  const { operation: operationId } =
    (await searchParams) ?? ({} as { operation?: string });

  let recentOperations: PackageOperationSummary[];
  let initialOperation: PackageOperation | null = null;
  try {
    [recentOperations, initialOperation] = await Promise.all([
      apiRequestJson<PackageOperationSummary[]>(
        "/customization/package-operations?take=20",
      ),
      operationId
        ? apiRequestJson<PackageOperation>(
            `/customization/package-operations/${encodeURIComponent(operationId)}`,
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }

  return (
    <SettingsShell description="" eyebrow="Packages" title="Import Package">
      <PackageImportWizard
        initialOperation={initialOperation}
        recentOperations={recentOperations}
      />
    </SettingsShell>
  );
}
