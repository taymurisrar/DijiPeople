"use client";

import { EmptyState } from "@/app/components/ui/empty-state";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import type { EmailTemplateAuthoringEvent } from "../templates/_lib/email-template-client";
import { EmailTemplateComposer } from "./email-template-composer";

/*
 * ITEM-0181. The event list comes from the API and holds only events that send
 * an email this workspace can write a template for, so an empty list is a real
 * state rather than a loading glitch.
 */
export function EmailTemplateCreateForm({
  events,
  scopeOptions,
}: {
  events: EmailTemplateAuthoringEvent[];
  scopeOptions: TemplateScopeOptions | null;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        description="No email events are available for this workspace."
        title="No email events"
      />
    );
  }

  return (
    <EmailTemplateComposer
      canManage
      events={events}
      mode="create"
      scopeOptions={scopeOptions}
    />
  );
}
