export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH";
export type EmailTemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type EmailProviderType =
  | "CONSOLE"
  | "DEV"
  | "SMTP"
  | "SES"
  | "SENDGRID"
  | "MAILGUN"
  | "POSTMARK"
  | "CUSTOM";
export type EmailDeliveryStatus =
  | "REQUESTED"
  | "PENDING"
  | "PROCESSING"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "SKIPPED"
  | "DRY_RUN";

export type NotificationEvent = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  enabledByDefault: boolean;
  supportedChannels: NotificationChannel[];
  systemDefined: boolean;
};

export type NotificationPreferenceItem = {
  eventCode: string;
  channel: NotificationChannel;
  enabled: boolean;
  preferenceId: string | null;
  metadata: unknown;
};

export type EmailTemplate = {
  id: string;
  tenantId: string | null;
  eventCode: string;
  templateKey: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  availableVariables: Record<string, unknown>;
  status: EmailTemplateStatus;
  version: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailProviderSetting = {
  id: string;
  tenantId: string;
  providerType: EmailProviderType;
  providerName: string;
  enabled: boolean;
  isDefault: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  configuration: Record<string, unknown>;
  updatedAt: string;
};

export type EmailDeliveryLog = {
  id: string;
  requestedAt: string;
  processedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  recipient: string;
  eventCode: string;
  subject: string;
  providerType: EmailProviderType | null;
  status: EmailDeliveryStatus;
  errorMessage: string | null;
  providerMessageId: string | null;
  metadata: unknown;
};

export type RenderedTemplate = {
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string | null;
  missingVariables: string[];
  usedVariables: string[];
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/notifications${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => null)) as
    | { message?: string; error?: { message?: string } }
    | T
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : data &&
            typeof data === "object" &&
            "error" in data &&
            data.error?.message
          ? data.error.message
          : "Notification request failed.";
    throw new Error(message ?? "Notification request failed.");
  }

  return data as T;
}

export const getNotificationEvents = () =>
  requestJson<NotificationEvent[]>("/events");
export const getNotificationPreferences = () =>
  requestJson<{ items: NotificationPreferenceItem[]; sourceOfTruth: string }>(
    "/preferences",
  );
export const updateNotificationPreferences = (
  preferences: Array<{
    eventCode: string;
    channel: NotificationChannel;
    enabled: boolean;
  }>,
) =>
  requestJson("/preferences", {
    method: "PATCH",
    body: JSON.stringify({ preferences }),
  });

export const getEmailTemplates = () =>
  requestJson<{ items: EmailTemplate[] }>("/email-templates");
export const getEmailTemplate = (id: string) =>
  requestJson<EmailTemplate>(`/email-templates/${id}`);
export const createEmailTemplate = (body: unknown) =>
  requestJson<EmailTemplate>("/email-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateEmailTemplate = (id: string, body: unknown) =>
  requestJson<EmailTemplate>(`/email-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const cloneEmailTemplate = (id: string, body: unknown = {}) =>
  requestJson<EmailTemplate>(`/email-templates/${id}/clone`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const activateEmailTemplate = (id: string) =>
  requestJson<EmailTemplate>(`/email-templates/${id}/activate`, {
    method: "POST",
    body: "{}",
  });
export const archiveEmailTemplate = (id: string) =>
  requestJson<{ archived: boolean }>(`/email-templates/${id}/archive`, {
    method: "POST",
    body: "{}",
  });
export const previewEmailTemplate = (
  id: string,
  variables: Record<string, unknown>,
) =>
  requestJson<RenderedTemplate>(`/email-templates/${id}/preview`, {
    method: "POST",
    body: JSON.stringify({ variables }),
  });
export const testSendEmailTemplate = (id: string, body: unknown) =>
  requestJson(`/email-templates/${id}/test-send`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getEmailProviders = () =>
  requestJson<{ items: EmailProviderSetting[] }>("/email-providers");
export const createEmailProvider = (body: unknown) =>
  requestJson<EmailProviderSetting>("/email-providers", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateEmailProvider = (id: string, body: unknown) =>
  requestJson<EmailProviderSetting>(`/email-providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const setDefaultEmailProvider = (id: string) =>
  requestJson<EmailProviderSetting>(`/email-providers/${id}/set-default`, {
    method: "POST",
    body: "{}",
  });
export const disableEmailProvider = (id: string) =>
  requestJson<{ disabled: boolean }>(`/email-providers/${id}/disable`, {
    method: "POST",
    body: "{}",
  });
export const validateEmailProvider = (id: string) =>
  requestJson(`/email-providers/${id}/validate`, {
    method: "POST",
    body: "{}",
  });

export const getEmailDeliveryLogs = (query = "") =>
  requestJson<{
    items: EmailDeliveryLog[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/email-delivery-logs${query ? `?${query}` : ""}`);
export const getEmailDeliveryLog = (id: string) =>
  requestJson<EmailDeliveryLog>(`/email-delivery-logs/${id}`);
