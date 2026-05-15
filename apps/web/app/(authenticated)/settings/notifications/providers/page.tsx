import { apiRequestJson } from "@/lib/server-api";
import type { EmailProviderSetting } from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import { EmailProvidersManager } from "../_components/email-providers-manager";

export default async function EmailProvidersPage() {
  const user = await requireSettingsPermissions(["notification.providers.read"]);
  const response = await apiRequestJson<{ items: EmailProviderSetting[] }>(
    "/notifications/email-providers",
  );
  const canManage = hasAnySettingsPermission(user, [
    "notification.providers.manage",
  ]);

  return (
    <SettingsShell
      description="Configure tenant sender identities and provider settings without exposing provider secrets."
      eyebrow="Notifications"
      title="Email Providers"
    >
      <EmailProvidersManager
        canManage={canManage}
        providers={response.items ?? []}
      />
    </SettingsShell>
  );
}
