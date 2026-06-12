import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { PublishCenter } from "../_components/publish-center";
import type {
  CustomizationPackage,
  CustomizationPublishDraftComponent,
} from "../types";

export default async function CustomizationPublishPage() {
  await requireSettingsPermissions(["customization.read"]);
  const [drafts, packages] = await Promise.all([
    apiRequestJson<CustomizationPublishDraftComponent[]>(
      "/customization/publish/drafts",
    ),
    apiRequestJson<CustomizationPackage[]>("/customization/packages"),
  ]);

  return (
    <SettingsShell
      description="Validate draft package metadata before publishing. Runtime uses published metadata only."
      eyebrow="Customization"
      title="Publish Center"
    >
      <PublishCenter drafts={drafts} packages={packages} />
    </SettingsShell>
  );
}
