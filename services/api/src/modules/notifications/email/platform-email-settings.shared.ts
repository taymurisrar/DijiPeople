import type { Prisma } from '@prisma/client';
/*
 * Type-only, and deliberately so. These two unions derive from const arrays the
 * settings DTO already owns, and a type import is erased at compile time — so
 * notifications carries no runtime dependency on platform-communications and no
 * module cycle exists. Redeclaring them here would be a second source of truth
 * for the same two-value vocabularies, which is the worse trade.
 */
import type {
  PlatformEmailProviderType,
  SmtpSecurityMode,
} from '../../platform-communications/dto/platform-email-settings.dto';

/**
 * The shape of the platform email provider, and how to read it.
 *
 * This lives in `notifications` rather than beside the settings screen because
 * two modules need it and only one of them may depend on the other.
 * `platform-communications` owns the screen that *writes* this row;
 * `notifications` owns every path that *sends* mail, and
 * `PlatformCommunicationsModule` already imports `NotificationsModule`. Putting
 * the reader on the far side of that arrow would have required a `forwardRef`
 * to reach it from the delivery path.
 *
 * See PLAN-023. Before it, nothing outside the settings screen could resolve
 * the platform provider at all — which is how production ran with a working
 * SMTP configuration on screen and no tenant able to send a single email
 * (BUG-1595).
 */
export const PLATFORM_EMAIL_SETTINGS_KEY = 'email-provider';

export type StoredPlatformEmailSettings = {
  enabled: boolean;
  providerType: PlatformEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  smtp: {
    host: string;
    port: number;
    authEnabled: boolean;
    username: string;
    password?: string;
    security: SmtpSecurityMode;
    connectionTimeoutMs: number;
  };
};

export const DEFAULT_PLATFORM_EMAIL_SETTINGS: StoredPlatformEmailSettings = {
  enabled: false,
  providerType: 'CONSOLE',
  fromName: 'DijiPeople',
  fromEmail: 'notifications@dijipeople.local',
  replyToEmail: null,
  smtp: {
    host: '',
    port: 587,
    authEnabled: true,
    username: '',
    security: 'STARTTLS',
    connectionTimeoutMs: 10000,
  },
};

/*
 * Tolerant of both the nested `smtp: { … }` shape the settings screen writes
 * today and the flat one earlier rows used, because a stored row is whatever
 * the version that wrote it produced.
 */
export function normalizePlatformEmailSettings(value: Prisma.JsonValue) {
  const source = isRecord(value) ? value : {};
  const smtp = isRecord(source.smtp) ? source.smtp : {};
  const providerType: PlatformEmailProviderType =
    source.providerType === 'SMTP' || source.provider === 'smtp'
      ? 'SMTP'
      : 'CONSOLE';
  return {
    enabled: source.enabled === true,
    providerType,
    fromName: text(source.fromName) || DEFAULT_PLATFORM_EMAIL_SETTINGS.fromName,
    fromEmail:
      text(source.fromEmail) || DEFAULT_PLATFORM_EMAIL_SETTINGS.fromEmail,
    replyToEmail: text(source.replyToEmail) || null,
    smtp: {
      host: text(smtp.host) || text(source.host),
      port: number(
        smtp.port ?? source.port,
        DEFAULT_PLATFORM_EMAIL_SETTINGS.smtp.port,
      ),
      authEnabled: (smtp.authEnabled ?? source.authEnabled) !== false,
      username: text(smtp.username) || text(source.username),
      ...(text(smtp.password) || text(source.password)
        ? { password: text(smtp.password) || text(source.password) }
        : {}),
      security: security(smtp.security ?? source.security),
      connectionTimeoutMs: number(
        smtp.connectionTimeoutMs ?? source.connectionTimeoutMs,
        DEFAULT_PLATFORM_EMAIL_SETTINGS.smtp.connectionTimeoutMs,
      ),
    },
  } satisfies StoredPlatformEmailSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function security(value: unknown): SmtpSecurityMode {
  return value === 'NONE' || value === 'TLS' ? value : 'STARTTLS';
}
