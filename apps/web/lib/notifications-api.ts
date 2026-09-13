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
  | "DRY_RUN"
  | "NOT_DELIVERED";

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

/*
 * BUG-3375 / ITEM-0169. `configurable: false` marks a transactional event
 * (account activation, password reset) that must never be switchable off by
 * a tenant admin. `availability !== "ACTIVE"` marks a catalog entry with no
 * trigger anywhere in the product — it cannot fire no matter what the toggle
 * says, so the UI must not offer it as an ordinary Enabled/Disabled choice.
 */
export type NotificationEventAvailability = "ACTIVE" | "NOT_YET_AVAILABLE";

export type NotificationPreferenceItem = {
  eventCode: string;
  channel: NotificationChannel;
  enabled: boolean;
  preferenceId: string | null;
  metadata: unknown;
  configurable: boolean;
  availability: NotificationEventAvailability;
};

/*
 * BUG-3375. `NotificationRule` is the model that actually decides whether an
 * event can notify anyone at all (in-app always, email since ITEM-0171).
 * `NOT_CONFIGURED` is the state this screen exists to surface: no rule row
 * means the event silently produces nothing, and nothing previously showed
 * that.
 */
export type NotificationRuleStatus =
  | "NOT_CONFIGURED"
  | "ENABLED"
  | "DISABLED"
  | "ALWAYS_ON"
  | "NOT_YET_AVAILABLE";

export type NotificationRuleItem = {
  eventCode: string;
  name: string;
  description: string | null;
  category: string;
  configurable: boolean;
  availability: NotificationEventAvailability;
  ruleId: string | null;
  ruleStatus: NotificationRuleStatus;
  moduleKey: string | null;
  channels: NotificationChannel[];
  priority: number | null;
  displayMode: string | null;
  requiresAction: boolean | null;
  recipientResolverType: string | null;
};

/*
 * Where a template applies. SYSTEM is the read-only platform default; every
 * other level is authored by the tenant and beats the levels above it.
 */
export type EmailTemplateScopeLevel =
  | "TENANT"
  | "ORGANIZATION"
  | "BUSINESS_UNIT"
  | "DEPARTMENT"
  | "TEAM";

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
  moduleKey: string | null;
  scopeKey: string;
  scopeLevel: EmailTemplateScopeLevel | "SYSTEM";
  scopeId: string | null;
  status: EmailTemplateStatus;
  version: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScopeTarget = { id: string; name: string };

export type TemplateScopeOptions = {
  levels: { value: EmailTemplateScopeLevel; label: string }[];
  organizations: ScopeTarget[];
  businessUnits: (ScopeTarget & { organizationId: string | null })[];
  departments: (ScopeTarget & { businessUnitId: string | null })[];
  teams: (ScopeTarget & { departmentId: string | null })[];
  modules: { value: string; label: string }[];
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
  retryable: boolean;
  metadata: unknown;
};

export type RetryDeliveryLogResult = {
  retriedLog: EmailDeliveryLog;
  newDeliveryLog: EmailDeliveryLog;
};

export type SendTemplateEmailResult = {
  sent: boolean;
  dryRun: boolean;
  skipped: boolean;
  status: EmailDeliveryStatus;
  providerType: EmailProviderType | null;
  providerMessageId?: string | null;
  deliveryLogId: string;
  rendered: RenderedTemplate;
};

export type InAppNotification = {
  id: string;
  eventCode: string;
  eventKey: string | null;
  moduleKey: string | null;
  type: string;
  category: string;
  priority: number;
  summary: string | null;
  title: string;
  body: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedRecordNumber: string | null;
  status: string;
  requiresAction: boolean;
  targetUrl: string | null;
  payload: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type InAppNotificationItem = {
  id: string;
  notificationId: string;
  readAt: string | null;
  archivedAt: string | null;
  deliveredAt: string | null;
  popupShownAt: string | null;
  createdAt: string;
  notification: InAppNotification;
};

export type RenderedTemplate = {
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string | null;
  missingVariables: string[];
  usedVariables: string[];
};

const API_ERROR_HANDLING_HEADER = "x-dijipeople-error-handling";

/**
 * A failed notification request, carrying the status the caller needs.
 *
 * This used to throw a bare `Error` with only a message, which made every
 * failure look alike to a caller. The components that poll on a timer could
 * not tell "the server hiccuped, try again in a minute" from "this session is
 * over, there is nothing to try again for" — so they retried forever. Four
 * fingerprints in the production error log carried 1,033 occurrences of the
 * same tab asking the same question after the answer stopped being yes
 * (BUG-2459).
 */
export class NotificationRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotificationRequestError";
    this.status = status;
  }

  /** A session that has expired or been revoked. Retrying cannot help. */
  get isAuthFailure() {
    return this.status === 401;
  }
}

export function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof NotificationRequestError && error.isAuthFailure
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/notifications${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [API_ERROR_HANDLING_HEADER]: "inline",
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
    throw new NotificationRequestError(
      message ?? "Notification request failed.",
      response.status,
    );
  }

  return data as T;
}

export const getNotificationEvents = () =>
  requestJson<NotificationEvent[]>("/events");
export const getNotificationPreferences = () =>
  requestJson<{ items: NotificationPreferenceItem[] }>("/preferences");
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

export const getNotificationRules = () =>
  requestJson<{ items: NotificationRuleItem[] }>("/rules");
export const updateNotificationRule = (
  ruleId: string,
  body: {
    enabled?: boolean;
    channels?: NotificationChannel[];
    priority?: number;
    displayMode?: string;
    requiresAction?: boolean;
  },
) =>
  requestJson<NotificationRuleItem>(`/rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/*
 * ITEM-0180. The notification events page. Each item is an event some code
 * path can actually deliver to this workspace; `channels` holds only the
 * channels it can arrive on, each `enabled` computed the way dispatch decides
 * it. Events with no emitter, and channels nothing sends, are not returned.
 */
export type NotificationEventSettingChannel = "IN_APP" | "EMAIL";

export type NotificationEventSetting = {
  eventCode: string;
  name: string;
  moduleKey: string;
  moduleLabel: string;
  required: boolean;
  channels: Array<{ channel: NotificationEventSettingChannel; enabled: boolean }>;
};

export const getNotificationEventSettings = () =>
  requestJson<{ items: NotificationEventSetting[] }>("/event-settings");

export const updateNotificationEventChannel = (
  eventCode: string,
  payload: { channel: NotificationEventSettingChannel; enabled: boolean },
) =>
  requestJson<NotificationEventSetting>(
    `/event-settings/${encodeURIComponent(eventCode)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

export const getEmailTemplates = () =>
  requestJson<{ items: EmailTemplate[] }>("/email-templates");
export const getEmailTemplate = (id: string) =>
  requestJson<EmailTemplate>(`/email-templates/${id}`);
export const getTemplateScopeOptions = () =>
  requestJson<TemplateScopeOptions>("/email-templates/scope-options");
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
  requestJson<SendTemplateEmailResult>(`/email-templates/${id}/test-send`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export type ProviderField = {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "boolean";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  secret?: boolean;
  defaultValue?: string | number | boolean;
};

export type ProviderSchema = {
  providerType: EmailProviderType;
  label: string;
  description: string;
  fields: ProviderField[];
};

/**
 * BUG-3501. `selectableProviderTypes` is what an administrator may choose in
 * this environment — production leaves out CONSOLE and DEV. Optional, because
 * an API from before the change does not send it.
 */
export type ProviderFieldSchemaResponse = {
  items: ProviderSchema[];
  selectableProviderTypes?: string[];
};

export const getProviderFieldSchemas = () =>
  requestJson<ProviderFieldSchemaResponse>("/email-providers/field-schema");
export const getEmailProviders = () =>
  requestJson<{ items: EmailProviderSetting[] }>("/email-providers");

/**
 * Which provider will actually carry this workspace's mail.
 *
 * ITEM-0129. `getEmailProviders` returns only the workspace's OWN providers, so
 * a workspace inheriting the DijiPeople platform relay sees an empty list — which
 * looks identical to having no email at all, while its mail is in fact being
 * delivered perfectly well.
 */
export type EffectiveEmailProvider = {
  canSend: boolean;
  source: "tenant" | "platform" | "env" | "dev-fallback" | null;
  inherited: boolean;
  providerType: string | null;
  providerSettingId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyToEmail: string | null;
  /*
   * BUG-3501. Whether mail reaches anyone, and through whom — `canSend` is true
   * for a Console sink. Optional only for an API that predates the field.
   */
  deliveryPath?: EmailDeliveryPath;
  notDeliveredReason?: EmailNotDeliveredReason | null;
  /** True in production, where Console and Dev rows are ignored (ADR-0015). */
  sinkProvidersRetired?: boolean;
};

export type EmailDeliveryPath =
  | "TENANT_PROVIDER"
  | "PLATFORM_RELAY"
  | "NOT_DELIVERED";

export type EmailNotDeliveredReason = "NO_PROVIDER" | "SINK_PROVIDER";

export const getEffectiveEmailProvider = () =>
  requestJson<EffectiveEmailProvider>("/email-providers/effective");

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
export const retryEmailDeliveryLog = (id: string) =>
  requestJson<RetryDeliveryLogResult>(`/email-delivery-logs/${id}/retry`, {
    method: "POST",
    body: "{}",
  });

export const getInAppNotifications = (query = "") =>
  requestJson<{ items: InAppNotificationItem[] }>(
    `/in-app${query ? `?${query}` : ""}`,
  );
export const getUnreadNotificationCount = () =>
  requestJson<{ unreadCount: number }>("/in-app/unread-count");
export const markInAppNotificationRead = (id: string) =>
  requestJson<{ read: boolean }>(`/in-app/${id}/read`, {
    method: "POST",
    body: "{}",
  });
export const archiveInAppNotification = (id: string) =>
  requestJson<{ archived: boolean }>(`/in-app/${id}/archive`, {
    method: "POST",
    body: "{}",
  });
export const markInAppNotificationPopupShown = (id: string) =>
  requestJson<{ popupShown: boolean }>(`/in-app/${id}/popup-shown`, {
    method: "POST",
    body: "{}",
  });
export const openInboxNotification = (id: string) =>
  fetch(`/api/inbox/${id}/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  }).then(async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message ?? "Unable to open notification.");
    }
    return data as {
      state: "OK" | "ACCESS_DENIED" | "RECORD_NOT_FOUND" | "SUPERSEDED" | "EXPIRED";
      navigationTarget: string | null;
    };
  });
export const getNotificationDiagnostics = () =>
  requestJson<{
    delivery: {
      failedCount24h: number;
      retryBacklog: number;
      skippedCount24h: number;
      lastExecutionAt: string | null;
      lastExecutionStatus: EmailDeliveryStatus | null;
    };
    provider: {
      configured: boolean;
      providerType: EmailProviderType | null;
      source: string | null;
      providerSettingId: string | null;
    };
    queue: {
      enabled: boolean;
      adapter: string;
      redisConfigured: boolean;
      redisHost: string | null;
      redisPort: string | null;
      note: string;
    };
  }>("/diagnostics");
