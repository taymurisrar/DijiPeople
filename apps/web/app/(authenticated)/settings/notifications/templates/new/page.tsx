import { apiRequestJson } from "@/lib/server-api";
import type {
  NotificationEvent,
  TemplateScopeOptions,
} from "@/lib/notifications-api";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { EmailTemplateCreateForm } from "../../_components/email-template-create-form";

export default async function NewEmailTemplatePage() {
  await requireSettingsPermissions(["notification.templates.manage"]);

  /* The events endpoint answers with a bare array, not a paged envelope. */
  const [events, scopeOptions] = await Promise.all([
    apiRequestJson<NotificationEvent[]>("/notifications/events"),
    apiRequestJson<TemplateScopeOptions>(
      "/notifications/email-templates/scope-options",
    ),
  ]);

  return (
    <SettingsShell
      description="Write a tenant email template and choose the part of the organization it applies to."
      eyebrow="Notifications"
      title="New Email Template"
    >
      <EmailTemplateCreateForm
        events={events ?? []}
        scopeOptions={scopeOptions}
      />
    </SettingsShell>
  );
}
