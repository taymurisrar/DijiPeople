import { apiRequestJson } from "@/lib/server-api";
import type {
  EmailProviderSetting,
  ProviderSchema,
} from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import { EmailProvidersManager } from "../_components/email-providers-manager";

export default async function EmailProvidersPage() {
  const user = await requireSettingsPermissions(["notification.providers.read"]);
  const [response, schemas] = await Promise.all([
    apiRequestJson<{ items: EmailProviderSetting[] }>(
      "/notifications/email-providers",
    ),
    apiRequestJson<{ items: ProviderSchema[] }>(
      "/notifications/email-providers/field-schema",
    ),
  ]);
  const canManage = hasAnySettingsPermission(user, [
    "notification.providers.manage",
  ]);

  return (
    <SettingsShell
      description="Configure who email comes from and how it is sent. The fields below change with the provider you choose, and credentials are stored encrypted."
      eyebrow="Notifications"
      title="Email Providers"
    >
      <EmailProvidersManager
        canManage={canManage}
        providers={response.items ?? []}
        schemas={schemas.items ?? []}
      />
    </SettingsShell>
  );
}
