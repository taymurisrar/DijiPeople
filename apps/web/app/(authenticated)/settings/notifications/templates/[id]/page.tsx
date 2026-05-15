import { apiRequestJson } from "@/lib/server-api";
import type { EmailTemplate } from "@/lib/notifications-api";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import { EmailTemplateEditor } from "../../_components/email-template-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmailTemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireSettingsPermissions(["notification.templates.read"]);
  const template = await apiRequestJson<EmailTemplate>(
    `/notifications/email-templates/${encodeURIComponent(id)}`,
  );
  const canManage = hasAnySettingsPermission(user, [
    "notification.templates.manage",
  ]);

  return (
    <SettingsShell
      description="Inspect template source, render previews with sample variables, and run backend dry-run or test sends."
      eyebrow="Notifications"
      title={template.name}
    >
      <EmailTemplateEditor canManage={canManage} template={template} />
    </SettingsShell>
  );
}
