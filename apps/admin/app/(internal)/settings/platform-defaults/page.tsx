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
import { isPlatformSuperAdmin } from "@/lib/platform-rbac";
import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Platform Defaults",
};


export default async function PlatformDefaultsPage() {
  const sessionUser = await getSessionUser();
  /*
   * Owner-level access uses the shared helper, not a role-string comparison.
   * SUPER_ADMIN is the legacy alias for PLATFORM_OWNER and the API grants
   * `platform.*` to both, so testing the literal locked owners out.
   */
  if (!isPlatformSuperAdmin(sessionUser?.role)) {
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
