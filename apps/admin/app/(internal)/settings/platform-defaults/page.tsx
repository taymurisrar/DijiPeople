import { PlatformDefaultsForm } from "@/app/_components/platform-defaults-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import {
  DEFAULT_PLATFORM_DEFAULTS,
  type PlatformDefaults,
} from "@/lib/reference-data/platform-reference-data";
import { getSessionUser } from "@/lib/auth";
import { ACCESS_DENIED_ROUTE } from "@/lib/auth-config";
import { apiRequestJson } from "@/lib/server-api";
import { redirect } from "next/navigation";

export default async function PlatformDefaultsPage() {
  const sessionUser = await getSessionUser();
  if (sessionUser?.role !== "SUPER_ADMIN") {
    redirect(ACCESS_DENIED_ROUTE);
  }

  const settings = await apiRequestJson<{
    platformDefaults?: Partial<PlatformDefaults>;
  }>("/super-admin/platform-settings");
  const platformDefaults = {
    ...DEFAULT_PLATFORM_DEFAULTS,
    ...(settings.platformDefaults ?? {}),
  };

  return (
    <SettingsShell
      title="Platform defaults"
      description="Configure the global behavior used across DijiPeople admin, billing, tenants, and operational modules."
    >
      <SettingsFormCard
        title="Regional defaults"
        description="These values are used as the default configuration when new tenants or commercial records are created."
      >
        <PlatformDefaultsForm initialDefaults={platformDefaults} />
      </SettingsFormCard>
    </SettingsShell>
  );
}
