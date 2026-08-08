import { apiRequestJson } from "@/lib/server-api";
import type {
  EmailTemplate,
  TemplateScopeOptions,
} from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import { EmailTemplatesTable } from "../_components/email-templates-table";

export default async function EmailTemplatesPage() {
  const user = await requireSettingsPermissions(["notification.templates.read"]);
  const [response, scopeOptions] = await Promise.all([
    apiRequestJson<{ items: EmailTemplate[] }>("/notifications/email-templates"),
    apiRequestJson<TemplateScopeOptions>(
      "/notifications/email-templates/scope-options",
    ),
  ]);
  const canManage = hasAnySettingsPermission(user, [
    "notification.templates.manage",
  ]);

  return (
    <SettingsShell
      description="Create, clone, activate, archive, preview, and test the email templates this tenant sends, and choose which part of the organization each one applies to."
      eyebrow="Notifications"
      title="Email Templates"
    >
      <EmailTemplatesTable
        canManage={canManage}
        scopeOptions={scopeOptions}
        templates={response.items ?? []}
      />
    </SettingsShell>
  );
}
