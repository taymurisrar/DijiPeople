import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Resolves which organization a request belongs to.
 *
 * A user is attached to a business unit, and a business unit belongs to an
 * organization, so the organization is derived rather than selected. That keeps
 * organization-scoped settings working for every role without introducing a
 * switcher or new session state.
 *
 * Results are cached briefly because this sits on the settings read path, which
 * every authenticated page hits.
 */
@Injectable()
export class ActiveOrganizationService {
  private readonly cache = new Map<
    string,
    { organizationId: string | null; expiresAt: number }
  >();

  private static readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(
    tenantId: string,
    userId: string,
  ): Promise<string | undefined> {
    const cacheKey = `${tenantId}:${userId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.organizationId ?? undefined;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { businessUnit: { select: { organizationId: true } } },
    });

    const organizationId = user?.businessUnit?.organizationId ?? null;

    this.cache.set(cacheKey, {
      organizationId,
      expiresAt: Date.now() + ActiveOrganizationService.CACHE_TTL_MS,
    });

    return organizationId ?? undefined;
  }

  /** Called after a user's business unit changes so the next read is accurate. */
  invalidateUser(tenantId: string, userId: string) {
    this.cache.delete(`${tenantId}:${userId}`);
  }

  invalidateTenant(tenantId: string) {
    const prefix = `${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
