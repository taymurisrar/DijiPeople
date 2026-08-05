import { PlatformBrandingForm } from "@/app/_components/platform-branding-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import type { PlatformAppearance } from "@/lib/platform-appearance";
import { apiRequestJson } from "@/lib/server-api";

export default async function BrandingSettingsPage() {
  const settings = await apiRequestJson<{
    branding?: Partial<PlatformAppearance>;
  }>("/super-admin/platform-settings");

  return (
    <SettingsShell
      title="Appearance & themes"
      description="Add a recognizable visual identity to the admin workspace with reusable color presets and configurable brand colors."
    >
      <SettingsFormCard
        title="Workspace theme"
        description="Theme settings are stored centrally and applied to navigation, primary actions, focus states, and workspace backgrounds."
      >
        <PlatformBrandingForm initialBranding={settings.branding ?? {}} />
      </SettingsFormCard>
    </SettingsShell>
  );
}
