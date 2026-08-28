import type { Metadata } from "next";
import { DesignTokenInspector } from "@/app/_components/settings/design-token-inspector";
import { PlatformBrandingForm } from "@/app/_components/platform-branding-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import type { PlatformAppearance } from "@/lib/platform-appearance";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Appearance",
};


export default async function AppearanceSettingsPage() {
  const settings = await apiRequestJson<{
    branding?: Partial<PlatformAppearance>;
  }>("/super-admin/platform-settings");

  return (
    <SettingsShell
      title="Appearance & design system"
      description="Inspect the live Platform Admin design tokens and safely adjust the supported brand palette. The application currently supports a light appearance only."
    >
      <SettingsFormCard
        title="Authoritative design tokens"
        description="Values below are read from the CSS variables currently applied to this Admin workspace."
      >
        <DesignTokenInspector />
      </SettingsFormCard>
      <SettingsFormCard
        title="Controlled theme configuration"
        description="These supported tokens drive navigation, primary actions, focus states, and workspace tint throughout Platform Admin."
      >
        <PlatformBrandingForm initialBranding={settings.branding ?? {}} />
      </SettingsFormCard>
    </SettingsShell>
  );
}
