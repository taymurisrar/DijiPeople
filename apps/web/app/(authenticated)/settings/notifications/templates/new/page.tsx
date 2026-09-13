import { apiRequestJson } from "@/lib/server-api";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { EmailTemplateCreateForm } from "../../_components/email-template-create-form";
import type { EmailTemplateAuthoringEvent } from "../_lib/email-template-client";

export default async function NewEmailTemplatePage() {
  await requireSettingsPermissions(["notification.templates.manage"]);

  /*
   * ITEM-0181. Not `/notifications/events`: that lists every catalog event,
   * including ones nothing sends by email. This lists only events a template
   * can be written for in this workspace, with the variables each supplies.
   */
  const [events, scopeOptions] = await Promise.all([
    apiRequestJson<{ items: EmailTemplateAuthoringEvent[] }>(
      "/notifications/email-templates/authoring-events",
    ),
    apiRequestJson<TemplateScopeOptions>(
      "/notifications/email-templates/scope-options",
    ),
  ]);

  return (
    <SettingsShell
      description=""
      eyebrow="Notifications"
      title="New Email Template"
    >
      <EmailTemplateCreateForm
        events={events.items ?? []}
        scopeOptions={scopeOptions}
      />
    </SettingsShell>
  );
}
