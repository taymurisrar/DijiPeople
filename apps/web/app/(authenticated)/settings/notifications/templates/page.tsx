import { apiRequestJson } from "@/lib/server-api";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import { EmailTemplatesTable } from "../_components/email-templates-table";
import type { ListedEmailTemplate } from "./_lib/email-template-client";

export default async function EmailTemplatesPage() {
  const user = await requireSettingsPermissions(["notification.templates.read"]);
  const [response, scopeOptions] = await Promise.all([
    apiRequestJson<{ items: ListedEmailTemplate[] }>(
      "/notifications/email-templates",
    ),
    apiRequestJson<TemplateScopeOptions>(
      "/notifications/email-templates/scope-options",
    ),
  ]);
  const canManage = hasAnySettingsPermission(user, [
    "notification.templates.manage",
  ]);

  return (
    <SettingsShell description="" eyebrow="Notifications" title="Email Templates">
      <EmailTemplatesTable
        canManage={canManage}
        scopeOptions={scopeOptions}
        templates={response.items ?? []}
      />
    </SettingsShell>
  );
}
