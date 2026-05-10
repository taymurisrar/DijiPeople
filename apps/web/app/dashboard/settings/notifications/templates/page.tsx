import { apiRequestJson } from "@/lib/server-api";
import type { EmailTemplate } from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import { EmailTemplatesTable } from "../_components/email-templates-table";

export default async function EmailTemplatesPage() {
  const user = await requireSettingsPermissions(["notification.templates.read"]);
  const response = await apiRequestJson<{ items: EmailTemplate[] }>(
    "/notifications/email-templates",
  );
  const canManage = hasAnySettingsPermission(user, [
    "notification.templates.manage",
  ]);

  return (
    <SettingsShell
      description="View, clone, activate, archive, preview, and test tenant-scoped email templates resolved by the backend."
      eyebrow="Notifications"
      title="Email Templates"
    >
      <EmailTemplatesTable
        canManage={canManage}
        templates={response.items ?? []}
      />
    </SettingsShell>
  );
}
