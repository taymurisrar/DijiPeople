import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProviderSetting, EmailProviderType } from '@prisma/client';
import { NotificationsRepository } from '../notifications.repository';
import {
  ApiPlaceholderEmailProvider,
  ConsoleEmailProvider,
  isSinkProvider,
  SmtpEmailProvider,
} from './providers';
import type { EmailProvider } from '../interfaces/email-provider.interface';

export type ResolvedEmailProvider = {
  provider: EmailProvider;
  providerType: EmailProviderType;
  providerSettingId: string | null;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  configuration: Record<string, unknown>;
  source: 'tenant' | 'platform' | 'env' | 'dev-fallback';
};

@Injectable()
export class EmailProviderFactory {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly configService: ConfigService,
    private readonly consoleProvider: ConsoleEmailProvider,
    private readonly smtpProvider: SmtpEmailProvider,
  ) {}

  /**
   * @param options.tenantOnly stop after the tenant's own providers instead of
   * falling through to the environment and the dev console. `EmailExecutionService`
   * uses it to slot the platform provider between the two — see PLAN-023. The
   * platform provider cannot be resolved here, because
   * `PlatformEmailProviderResolver` depends on this factory for `getProvider`
   * and injecting it back would be a dependency cycle.
   */
  async resolveProvider(
    tenantId: string,
    options: { tenantOnly?: boolean } = {},
  ): Promise<ResolvedEmailProvider | null> {
    const enabledTenantProviders =
      await this.repository.listEnabledProviders(tenantId);
    const tenantProvider =
      enabledTenantProviders.find((provider) => provider.isDefault) ??
      enabledTenantProviders.find(
        (provider) => !isSinkProvider(provider.providerType),
      ) ??
      enabledTenantProviders.find((provider) =>
        isSinkProvider(provider.providerType),
      );

    if (tenantProvider) {
      return this.fromTenantProvider(tenantProvider);
    }

    if (options.tenantOnly) {
      return null;
    }

    const envProvider = this.fromEnvironment();
    if (envProvider) {
      return envProvider;
    }

    if (this.configService.get('NODE_ENV') !== 'production') {
      return {
        provider: this.consoleProvider,
        providerType: EmailProviderType.CONSOLE,
        providerSettingId: null,
        fromEmail: 'dev-notifications@dijipeople.local',
        fromName: 'DijiPeople Dev',
        replyToEmail: null,
        configuration: {},
        source: 'dev-fallback',
      };
    }

    return null;
  }

  /*
   * BUG-0050 — the set of provider types this returns a real implementation for
   * is published as `SUPPORTED_EMAIL_PROVIDER_TYPES` in `@repo/config`, which is
   * also what the settings UI offers. Keep the two in step: the placeholder
   * below still exists because the Prisma enum keeps every historical value and
   * an existing row may reference one, but nothing should be able to *select*
   * an unimplemented provider any more.
   *
   * `email-provider-support.spec.ts` fails if this method and that list ever
   * disagree, which is the drift that let a tenant configure SES and silently
   * receive no mail.
   */
  getProvider(providerType: EmailProviderType): EmailProvider {
    if (isSinkProvider(providerType)) {
      return this.consoleProvider;
    }

    if (providerType === EmailProviderType.SMTP) {
      return this.smtpProvider;
    }

    return new ApiPlaceholderEmailProvider(providerType);
  }

  private fromTenantProvider(
    providerSetting: EmailProviderSetting,
  ): ResolvedEmailProvider {
    const provider = this.getProvider(providerSetting.providerType);
    const configuration = normalizeObject(providerSetting.configuration);
    provider.validateConfig(configuration);

    return {
      provider,
      providerType: providerSetting.providerType,
      providerSettingId: providerSetting.id,
      fromEmail: providerSetting.fromEmail,
      fromName: providerSetting.fromName,
      replyToEmail: providerSetting.replyToEmail,
      configuration,
      source: 'tenant',
    };
  }

  private fromEnvironment(): ResolvedEmailProvider | null {
    const providerTypeValue = this.configService.get<string>('EMAIL_PROVIDER');
    if (!providerTypeValue) {
      return null;
    }

    const providerType = normalizeProviderType(providerTypeValue);
    if (!providerType) {
      return null;
    }

    const configuration =
      providerType === EmailProviderType.SMTP
        ? {
            host: this.configService.get('EMAIL_SMTP_HOST'),
            port: Number(this.configService.get('EMAIL_SMTP_PORT') ?? 587),
            secure: this.configService.get('EMAIL_SMTP_SECURE') === 'true',
            username: this.configService.get('EMAIL_SMTP_USER'),
            password: this.configService.get('EMAIL_SMTP_PASSWORD'),
          }
        : {
            apiKey: this.configService.get('EMAIL_API_KEY'),
          };

    const provider = this.getProvider(providerType);
    provider.validateConfig(configuration);

    return {
      provider,
      providerType,
      providerSettingId: null,
      fromEmail:
        this.configService.get<string>('EMAIL_FROM') ??
        'notifications@dijipeople.local',
      fromName:
        this.configService.get<string>('EMAIL_FROM_NAME') ?? 'DijiPeople',
      replyToEmail: this.configService.get<string>('EMAIL_REPLY_TO') ?? null,
      configuration,
      source: 'env',
    };
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeProviderType(value: string): EmailProviderType | null {
  const normalized = value.trim().toUpperCase();
  const values = Object.values(EmailProviderType) as string[];
  return values.includes(normalized) ? (normalized as EmailProviderType) : null;
}
