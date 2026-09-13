"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import type {
  RenderedTemplate,
  TemplateScopeOptions,
} from "@/lib/notifications-api";
import {
  customizeTemplate,
  previewSavedTemplate,
  type EditableEmailTemplate,
} from "../templates/_lib/email-template-client";
import { EmailTemplateComposer } from "./email-template-composer";
import { EmailTemplatePreview } from "./email-template-preview";
import { ErrorBanner, StatusBadge } from "./notification-ui";

/*
 * ITEM-0181. A system template is a read-only default: it opens as the email a
 * recipient would receive, with one action, Customize, which makes a tenant copy
 * that replaces the default once activated. It used to open as a form of
 * disabled inputs under a banner saying it could not be edited, which looked
 * editable and hid the path that worked.
 */
export function EmailTemplateEditor({
  canManage,
  scopeOptions,
  template,
}: {
  canManage: boolean;
  scopeOptions: TemplateScopeOptions | null;
  template: EditableEmailTemplate;
}) {
  if (template.isSystem) {
    return <SystemTemplateView canManage={canManage} template={template} />;
  }

  return (
    <EmailTemplateComposer
      canManage={canManage}
      mode="edit"
      scopeOptions={scopeOptions}
      template={template}
    />
  );
}

function SystemTemplateView({
  canManage,
  template,
}: {
  canManage: boolean;
  template: EditableEmailTemplate;
}) {
  const router = useRouter();
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewSavedTemplate(template.id, {})
      .then((result) => {
        if (!cancelled) setRendered(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "The preview could not be rendered.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [template.id]);

  async function customize() {
    setBusy(true);
    setError(null);
    try {
      const copy = await customizeTemplate(template.id);
      router.push(`/settings/notifications/templates/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The template could not be customized.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={template.status} />
          <span className="text-sm text-muted">System default</span>
        </div>
        {template.customizable && canManage ? (
          <Button loading={busy} onClick={customize} type="button">
            Customize
          </Button>
        ) : null}
      </div>
      <ErrorBanner message={error} />
      <div className="max-w-4xl">
        <EmailTemplatePreview error={null} loading={loading} rendered={rendered} />
      </div>
    </div>
  );
}
