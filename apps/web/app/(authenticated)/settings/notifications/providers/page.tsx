import { apiRequestJson } from "@/lib/server-api";
import type {
  EffectiveEmailProvider,
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
  /*
   * ITEM-0129. `effective` is fetched alongside the workspace's own providers
   * because the two answer different questions: the list says what this
   * workspace configured, and `effective` says what will actually carry its
   * mail — which may be the DijiPeople platform relay it inherits.
   *
   * Fetched in parallel rather than one after another, which is BUG-3219's
   * shape.
   */
  const [response, schemas, effective] = await Promise.all([
    apiRequestJson<{ items: EmailProviderSetting[] }>(
      "/notifications/email-providers",
    ),
    apiRequestJson<{ items: ProviderSchema[] }>(
      "/notifications/email-providers/field-schema",
    ),
    apiRequestJson<EffectiveEmailProvider>(
      "/notifications/email-providers/effective",
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
        effective={effective}
        providers={response.items ?? []}
        schemas={schemas.items ?? []}
      />
    </SettingsShell>
  );
}
