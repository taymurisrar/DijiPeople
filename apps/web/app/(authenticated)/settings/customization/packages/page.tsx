import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../_lib/customization-access";
import { CustomizationAccessDenied } from "../_components/customization-access-denied";
import { PackagesList } from "../_components/packages-list";
import type { CustomizationPackage } from "../types";

type CustomizationPackagesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function CustomizationPackagesPage({
  searchParams,
}: CustomizationPackagesPageProps) {
  const { allowed } = await requireCustomizationPage("packages");
  if (!allowed) return <CustomizationAccessDenied />;

  let packages: CustomizationPackage[];
  let resolvedSearchParams: { message?: string };
  try {
    [packages, resolvedSearchParams] = await Promise.all([
      apiRequestJson<CustomizationPackage[]>("/customization/packages"),
      searchParams ?? Promise.resolve({} as { message?: string }),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }

  return (
    <SettingsShell description="" eyebrow="Customization" title="Packages">
      <PackagesList
        initialMessage={resolvedSearchParams.message}
        packages={packages}
      />
    </SettingsShell>
  );
}
