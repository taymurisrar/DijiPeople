import {
  NotificationRequestError,
  type EmailTemplate,
  type RenderedTemplate,
  type SendTemplateEmailResult,
} from "@/lib/notifications-api";
import type { EmailTemplateVariable } from "./email-template-editing";

/*
 * ITEM-0181. Browser calls for the template editor's new and changed routes.
 *
 * These sit beside the editor rather than in `lib/notifications-api.ts`, which
 * the events and providers screens are changing in parallel. The request shape
 * matches that file's helper: same proxy path, same error header, same error
 * type, so a failure here reads exactly like one there.
 */

export type EmailTemplateAuthoringEvent = {
  code: string;
  name: string;
  category: string;
  templateKey: string;
  variables: EmailTemplateVariable[];
  defaultContent: {
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate: string;
  };
};

export type EditableEmailTemplate = EmailTemplate & {
  customizable: boolean;
  variables: EmailTemplateVariable[];
};

export type ListedEmailTemplate = EmailTemplate & { customizable: boolean };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/notifications${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-dijipeople-error-handling": "inline",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => null)) as
    | { message?: string; error?: { message?: string } }
    | T
    | null;

  if (!response.ok) {
    const record = (data ?? {}) as {
      message?: string;
      error?: { message?: string };
    };
    throw new NotificationRequestError(
      record.message ?? record.error?.message ?? "Request failed.",
      response.status,
    );
  }

  return data as T;
}

function post<T>(path: string, body: unknown) {
  return requestJson<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const createTemplate = (body: unknown) =>
  post<ListedEmailTemplate>("/email-templates", body);

export const updateTemplate = (id: string, body: unknown) =>
  requestJson<ListedEmailTemplate>(`/email-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const customizeTemplate = (id: string) =>
  post<ListedEmailTemplate>(`/email-templates/${encodeURIComponent(id)}/clone`, {});

export const activateTemplate = (id: string) =>
  post<ListedEmailTemplate>(`/email-templates/${encodeURIComponent(id)}/activate`, {});

export const archiveTemplate = (id: string) =>
  post<{ archived: boolean }>(`/email-templates/${encodeURIComponent(id)}/archive`, {});

export const previewSavedTemplate = (id: string, body: unknown) =>
  post<RenderedTemplate>(`/email-templates/${encodeURIComponent(id)}/preview`, body);

export const previewDraftTemplate = (body: unknown) =>
  post<RenderedTemplate>("/email-templates/preview", body);

export const sendTestTemplate = (id: string, body: unknown) =>
  post<SendTemplateEmailResult>(
    `/email-templates/${encodeURIComponent(id)}/test-send`,
    body,
  );
