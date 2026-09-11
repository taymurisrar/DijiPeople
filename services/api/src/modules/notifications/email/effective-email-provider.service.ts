import { Injectable } from '@nestjs/common';
import {
  EmailProviderFactory,
  type ResolvedEmailProvider,
} from './email-provider-factory.service';
import { PlatformEmailProviderResolver } from './platform-email-provider.resolver';

/**
 * Which provider will actually carry a tenant's mail, and where it came from.
 *
 * ITEM-0129. The precedence for tenant-originated mail — the tenant's own
 * provider, then the platform's, then the environment, then the dev console —
 * lived inside `EmailExecutionService.resolveProviderForOrigin` and was reachable
 * only by sending an email. The tenant settings screen therefore could not say
 * what was in force, and showed an empty provider list to a tenant whose mail was
 * being delivered perfectly well by the platform relay. "Inheriting" and "not
 * configured" looked identical, which is the complaint this service answers.
 *
 * It is one method with two callers, deliberately. `EmailExecutionService`
 * delegates to it rather than keeping its own copy, because a screen that
 * *describes* the precedence and a sender that *applies* it must not be able to
 * disagree — that is the BUG-3241 shape, two call sites for one rule, and it is
 * how a settings page starts lying.
 *
 * The platform resolver cannot live in `EmailProviderFactory` itself: it depends
 * on that factory for `getProvider`, so injecting it back is a cycle. This sits
 * above both and composes them.
 */
@Injectable()
export class EffectiveEmailProviderService {
  constructor(
    private readonly providerFactory: EmailProviderFactory,
    private readonly platformProvider: PlatformEmailProviderResolver,
  ) {}

  /**
   * Tenant-originated mail: the tenant's own configured provider wins, the
   * platform's fills in where the tenant has none, and the environment and dev
   * console remain the last resorts.
   */
  async resolveForTenant(
    tenantId: string,
  ): Promise<ResolvedEmailProvider | null> {
    return (
      (await this.providerFactory.resolveProvider(tenantId, {
        tenantOnly: true,
      })) ??
      (await this.platformProvider.resolve()) ??
      (await this.providerFactory.resolveProvider(tenantId))
    );
  }

  /**
   * Platform-originated mail: the platform's own provider first, because a
   * message DijiPeople sends about itself should not leave on a customer's
   * relay. Falls through to the tenant chain only when the platform has none.
   */
  async resolveForPlatform(
    tenantId: string,
  ): Promise<ResolvedEmailProvider | null> {
    return (
      (await this.platformProvider.resolve()) ??
      (await this.providerFactory.resolveProvider(tenantId))
    );
  }

  /**
   * The same answer, shaped for a settings screen rather than for sending.
   *
   * `configuration` is deliberately not included. It carries provider
   * credentials, and this is read by anyone holding settings read — a narrower
   * permission than the one required to configure a provider.
   */
  async describeForTenant(tenantId: string): Promise<EffectiveProviderSummary> {
    const resolved = await this.resolveForTenant(tenantId);

    if (!resolved) {
      return {
        canSend: false,
        source: null,
        inherited: false,
        providerType: null,
        providerSettingId: null,
        fromEmail: null,
        fromName: null,
        replyToEmail: null,
      };
    }

    return {
      canSend: true,
      source: resolved.source,
      /*
       * Inherited means "somebody else's configuration is carrying this
       * tenant's mail". The environment and the dev console qualify as much as
       * the platform relay does — in all three cases the tenant configured
       * nothing and the screen must not imply that it did.
       */
      inherited: resolved.source !== 'tenant',
      providerType: resolved.providerType,
      providerSettingId: resolved.providerSettingId,
      fromEmail: resolved.fromEmail,
      fromName: resolved.fromName,
      replyToEmail: resolved.replyToEmail,
    };
  }
}

export type EffectiveProviderSummary = {
  /** False only when no provider resolves at all — then nothing can be sent. */
  canSend: boolean;
  source: ResolvedEmailProvider['source'] | null;
  /** True when the tenant configured nothing and something else is carrying it. */
  inherited: boolean;
  providerType: ResolvedEmailProvider['providerType'] | null;
  providerSettingId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyToEmail: string | null;
};
