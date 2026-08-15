import { Injectable } from '@nestjs/common';
import { TenantDomainType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TenantDomainService } from '../tenant-domains/tenant-domain.service';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import type {
  AddTenantCustomDomainDto,
  TenantDomainActionDto,
} from './dto/tenant-control-plane.dto';

/**
 * Platform Admin's view of a tenant's hostnames.
 *
 * The rules live in `TenantDomainService`; this adds the platform authorization
 * boundary and the audit trail. Every hostname change is customer-visible — it
 * decides where their people land — so all of them are recorded.
 */
@Injectable()
export class TenantDomainsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: TenantDomainService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  async list(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const [domains, routing] = await Promise.all([
      this.domains.listDomains(tenant.id),
      this.domains.getPlatformRoutingStatus(),
    ]);

    return {
      tenantId: tenant.id,
      workspaceSlug: tenant.slug,
      routing,
      domains: domains.map((domain) => ({
        id: domain.id,
        hostname: domain.domain,
        type: domain.type,
        status: domain.verificationStatus,
        tlsStatus: domain.tlsStatus,
        isPrimary: domain.isPrimary,
        verifiedAt: domain.verifiedAt,
        disabledAt: domain.disabledAt,
        lastVerificationAttemptAt: domain.lastVerificationAttemptAt,
        verificationFailureReason: domain.verificationFailureReason,
        createdAt: domain.createdAt,
        /*
         * The challenge value is returned for a custom domain because the
         * customer has to publish it — it is a proof-of-control nonce, not a
         * credential, and it grants nothing on its own. It is never logged.
         */
        verificationRecord:
          domain.type === TenantDomainType.CUSTOM_DOMAIN &&
          domain.verificationToken
            ? {
                type: 'TXT',
                name: `_dijipeople-challenge.${domain.domain}`,
                value: domain.verificationToken,
              }
            : null,
      })),
    };
  }

  async addCustomDomain(
    user: AuthenticatedUser,
    tenantId: string,
    dto: AddTenantCustomDomainDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const created = await this.domains.addCustomDomain({
      tenantId: tenant.id,
      hostname: dto.hostname,
      actorUserId: user.userId,
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_DOMAIN_ADDED',
      entityId: created.id,
      after: { hostname: created.domain, type: created.type },
    });

    return this.list(user, tenant.id);
  }

  async setPrimary(
    user: AuthenticatedUser,
    tenantId: string,
    domainId: string,
    dto: TenantDomainActionDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const result = await this.domains.setPrimaryDomain({
      tenantId: tenant.id,
      domainId,
      actorUserId: user.userId,
    });

    if (result.changed) {
      await this.record(user, tenant.id, {
        action: 'TENANT_PRIMARY_DOMAIN_CHANGED',
        entityId: domainId,
        before: { hostname: result.previousPrimary },
        after: { hostname: result.newPrimary, reason: dto.reason ?? null },
      });
    }

    return this.list(user, tenant.id);
  }

  async verify(user: AuthenticatedUser, tenantId: string, domainId: string) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const outcome = await this.domains.attemptCustomDomainVerification({
      tenantId: tenant.id,
      domainId,
      actorUserId: user.userId,
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_DOMAIN_VERIFICATION_ATTEMPTED',
      entityId: domainId,
      /* The token itself is deliberately not written to the audit trail. */
      after: { verified: outcome.verified, message: outcome.message },
    });

    return { ...outcome, domains: (await this.list(user, tenant.id)).domains };
  }

  async disable(
    user: AuthenticatedUser,
    tenantId: string,
    domainId: string,
    dto: TenantDomainActionDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    await this.domains.disableDomain({
      tenantId: tenant.id,
      domainId,
      actorUserId: user.userId,
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_DOMAIN_DISABLED',
      entityId: domainId,
      after: { reason: dto.reason ?? null },
    });

    return this.list(user, tenant.id);
  }

  private async record(
    user: AuthenticatedUser,
    tenantId: string,
    input: {
      action: string;
      entityId: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ) {
    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId,
      actorUserId: user.userId,
      action: input.action,
      entityType: 'TenantDomain',
      entityId: input.entityId,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: input.before,
      afterSnapshot: input.after,
    });
    await this.events.record({
      eventCode: input.action,
      source: 'API',
      entityType: 'TenantDomain',
      entityId: input.entityId,
      tenantId,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/domains',
      metadata: { actorName: actor.name, ...input.after },
    });
  }
}
