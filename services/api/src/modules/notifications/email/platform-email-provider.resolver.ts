import { Injectable } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import {
  EmailProviderFactory,
  type ResolvedEmailProvider,
} from './email-provider-factory.service';
import {
  PLATFORM_EMAIL_SETTINGS_KEY,
  normalizePlatformEmailSettings,
  type StoredPlatformEmailSettings,
} from './platform-email-settings.shared';

/**
 * The platform's own email provider — DijiPeople's relay, not a tenant's.
 *
 * `ResolvedEmailProvider.source` has always declared `'platform'` as one of its
 * four values and nothing ever produced it. This is the missing producer, and
 * the reason it matters is BUG-1595: production carried a working, operator-
 * configured SMTP provider on the admin Settings → Email screen while no tenant
 * could send a single email, because the delivery path could not see that row.
 *
 * Deliberately narrow. It resolves a provider and nothing else — reading,
 * validating and auditing the settings stays with
 * `PlatformEmailSettingsService`, which owns the screen. That service now
 * delegates here so there is exactly one implementation.
 */
@Injectable()
export class PlatformEmailProviderResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly providers: EmailProviderFactory,
  ) {}

  /**
   * The configured platform provider, or null when none is configured or it is
   * switched off.
   *
   * Returns null rather than throwing on a disabled provider: the caller's
   * resolution chain continues past it, and an operator who unticked "enabled"
   * meant to stop platform sending, not to break the request.
   */
  async resolve(): Promise<ResolvedEmailProvider | null> {
    const stored = await this.readStoredSettings();
    if (!stored || !stored.enabled) return null;

    const providerType =
      stored.providerType === 'SMTP'
        ? EmailProviderType.SMTP
        : EmailProviderType.CONSOLE;

    const configuration =
      providerType === EmailProviderType.SMTP
        ? this.smtpConfiguration(stored)
        : {};

    /*
     * Validated here rather than trusted from storage. A row written before a
     * required field existed, or edited outside the screen, would otherwise
     * surface as a provider that fails at send time — one delivery attempt per
     * message, each recorded as retryable when it is not.
     */
    this.providers.getProvider(providerType).validateConfig(configuration);

    return {
      provider: this.providers.getProvider(providerType),
      providerType,
      providerSettingId: null,
      fromEmail: stored.fromEmail,
      fromName: stored.fromName,
      replyToEmail: stored.replyToEmail,
      configuration,
      source: 'platform',
    };
  }

  private async readStoredSettings() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_EMAIL_SETTINGS_KEY },
      select: { value: true },
    });
    return row ? normalizePlatformEmailSettings(row.value) : null;
  }

  private smtpConfiguration(settings: StoredPlatformEmailSettings) {
    return {
      host: settings.smtp.host,
      port: settings.smtp.port,
      authEnabled: settings.smtp.authEnabled,
      username: settings.smtp.username,
      password: settings.smtp.password
        ? this.encryption.decrypt(settings.smtp.password)
        : '',
      security: settings.smtp.security,
      connectionTimeoutMs: settings.smtp.connectionTimeoutMs,
    };
  }
}
