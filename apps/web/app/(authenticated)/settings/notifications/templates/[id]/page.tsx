import { apiRequestJson } from "@/lib/server-api";
import type {
  EmailTemplate,
  TemplateScopeOptions,
} from "@/lib/notifications-api";
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
  const [template, scopeOptions] = await Promise.all([
    apiRequestJson<EmailTemplate>(
      `/notifications/email-templates/${encodeURIComponent(id)}`,
    ),
    apiRequestJson<TemplateScopeOptions>(
      "/notifications/email-templates/scope-options",
    ),
  ]);
  const canManage = hasAnySettingsPermission(user, [
    "notification.templates.manage",
  ]);

  return (
    <SettingsShell
      description="Inspect template source, render previews with sample variables, and run backend dry-run or test sends."
      eyebrow="Notifications"
      title={template.name}
    >
      <EmailTemplateEditor
        canManage={canManage}
        scopeOptions={scopeOptions}
        template={template}
      />
    </SettingsShell>
  );
}
