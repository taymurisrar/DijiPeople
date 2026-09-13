import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../_lib/customization-access";
import { CustomizationAccessDenied } from "../_components/customization-access-denied";
import { PublishCenter } from "../_components/publish-center";
import type {
  CustomizationPackage,
  CustomizationPublishDraftComponent,
} from "../types";

export default async function CustomizationPublishPage() {
  const { allowed } = await requireCustomizationPage("publishCenter");
  if (!allowed) return <CustomizationAccessDenied />;

  let drafts: CustomizationPublishDraftComponent[];
  let packages: CustomizationPackage[];
  try {
    [drafts, packages] = await Promise.all([
      apiRequestJson<CustomizationPublishDraftComponent[]>(
        "/customization/publish/drafts",
      ),
      apiRequestJson<CustomizationPackage[]>("/customization/packages"),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }

  return (
    <SettingsShell description="" eyebrow="Customization" title="Publish Center">
      <PublishCenter drafts={drafts} packages={packages} />
    </SettingsShell>
  );
}
