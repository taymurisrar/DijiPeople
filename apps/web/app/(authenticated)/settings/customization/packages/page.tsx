import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { PackagesList } from "../_components/packages-list";
import type { CustomizationPackage } from "../types";

type CustomizationPackagesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function CustomizationPackagesPage({
  searchParams,
}: CustomizationPackagesPageProps) {
  await requireSettingsPermissions(["customization.read"]);
  const [packages, resolvedSearchParams] = await Promise.all([
    apiRequestJson<CustomizationPackage[]>("/customization/packages"),
    searchParams ?? Promise.resolve({} as { message?: string }),
  ]);

  return (
    <SettingsShell
      description="Organize customization metadata into Packages for future layering, import, and export."
      eyebrow="Customization"
      title="Packages"
    >
      <PackagesList
        initialMessage={resolvedSearchParams.message}
        packages={packages}
      />
    </SettingsShell>
  );
}
