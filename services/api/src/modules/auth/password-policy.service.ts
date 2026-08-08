import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';

/*
 * Enforces the tenant's configured password rules.
 *
 * These rules were configurable on the Password & Login Policies screen but
 * nothing read them: every password was accepted on a hardcoded eight-character
 * minimum regardless of what a tenant had saved. A policy that a tenant can set
 * and that silently does nothing is worse than no policy, because it is
 * reported as met.
 */

export type ResolvedPasswordPolicy = {
  minimumPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialCharacter: boolean;
};

/*
 * Used when a tenant's settings cannot be read. Chosen to be at least as strict
 * as the platform default so a lookup failure can never weaken a password.
 */
const FALLBACK_POLICY: ResolvedPasswordPolicy = {
  minimumPasswordLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
};

/* Anything that is not a letter, a digit or whitespace counts as special. */
const SPECIAL_CHARACTER = /[^A-Za-z0-9\s]/;

const ABSOLUTE_MINIMUM_LENGTH = 8;
const ABSOLUTE_MAXIMUM_LENGTH = 200;

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readLength(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  /*
   * A tenant must be able to be stricter than the platform, never looser: a
   * misconfigured or hostile value cannot drop the floor below eight.
   */
  return Math.min(
    ABSOLUTE_MAXIMUM_LENGTH,
    Math.max(ABSOLUTE_MINIMUM_LENGTH, Math.trunc(parsed)),
  );
}

@Injectable()
export class PasswordPolicyService {
  constructor(
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async resolvePolicy(tenantId: string): Promise<ResolvedPasswordPolicy> {
    try {
      const security =
        await this.tenantSettingsResolver.getSecuritySettings(tenantId);

      return {
        minimumPasswordLength: readLength(
          security.minimumPasswordLength,
          FALLBACK_POLICY.minimumPasswordLength,
        ),
        requireUppercase: readBoolean(
          security.requireUppercase,
          FALLBACK_POLICY.requireUppercase,
        ),
        requireLowercase: readBoolean(
          security.requireLowercase,
          FALLBACK_POLICY.requireLowercase,
        ),
        requireNumber: readBoolean(
          security.requireNumber,
          FALLBACK_POLICY.requireNumber,
        ),
        requireSpecialCharacter: readBoolean(
          security.requireSpecialCharacter,
          FALLBACK_POLICY.requireSpecialCharacter,
        ),
      };
    } catch {
      // A settings outage must not let a weak password through.
      return FALLBACK_POLICY;
    }
  }

  /** Every rule the password breaks, so a user can fix them in one go. */
  describeViolations(password: string, policy: ResolvedPasswordPolicy) {
    const violations: string[] = [];

    if (password.length < policy.minimumPasswordLength) {
      violations.push(
        `be at least ${policy.minimumPasswordLength} characters long`,
      );
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      violations.push('include an uppercase letter');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      violations.push('include a lowercase letter');
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      violations.push('include a number');
    }
    if (policy.requireSpecialCharacter && !SPECIAL_CHARACTER.test(password)) {
      violations.push('include a special character');
    }

    return violations;
  }

  /**
   * Throws unless the password satisfies the tenant's policy. Call this on
   * every path that sets or changes a password.
   */
  async assertPasswordMeetsPolicy(tenantId: string, password: string) {
    const policy = await this.resolvePolicy(tenantId);
    const violations = this.describeViolations(password, policy);

    if (violations.length) {
      throw new BadRequestException(`Password must ${violations.join(', ')}.`);
    }

    return policy;
  }

  /*
   * Refuses a password the user has recently used. Comparing hashes means one
   * bcrypt check per remembered password, so the count is capped by the
   * settings resolver rather than trusted from the tenant.
   */
  async assertPasswordNotReused(
    userId: string,
    tenantId: string,
    password: string,
  ) {
    const historyCount = await this.resolveHistoryCount(tenantId);
    if (historyCount <= 0) return;

    const previous = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: historyCount,
      select: { passwordHash: true },
    });

    for (const entry of previous) {
      if (await bcrypt.compare(password, entry.passwordHash)) {
        throw new BadRequestException(
          `This password was used recently. Choose one you have not used in your last ${historyCount} password${historyCount === 1 ? '' : 's'}.`,
        );
      }
    }
  }

  /*
   * Records the hash that was just set and trims the tail. Never throws: losing
   * a history entry must not fail a password change the user asked for.
   */
  async recordPasswordChange(
    userId: string,
    tenantId: string,
    passwordHash: string,
  ) {
    try {
      const historyCount = await this.resolveHistoryCount(tenantId);
      if (historyCount <= 0) return;

      await this.prisma.passwordHistory.create({
        data: { userId, passwordHash },
      });

      const keep = await this.prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyCount,
        select: { id: true },
      });

      await this.prisma.passwordHistory.deleteMany({
        where: { userId, id: { notIn: keep.map((entry) => entry.id) } },
      });
    } catch {
      // Best effort; the password itself is already stored.
    }
  }

  /** Days until a password must be changed. 0 means it never expires. */
  async resolveExpiryDays(tenantId: string) {
    try {
      const security =
        await this.tenantSettingsResolver.getSecuritySettings(tenantId);
      const parsed = Number(security.passwordExpiryDays);
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return Math.min(3650, Math.trunc(parsed));
    } catch {
      return 0;
    }
  }

  /** True when the password is older than the tenant allows. */
  async isPasswordExpired(tenantId: string, passwordChangedAt?: Date | null) {
    const expiryDays = await this.resolveExpiryDays(tenantId);
    if (!expiryDays) return false;
    /*
     * A password with no recorded change date is treated as current rather
     * than expired, so enabling expiry cannot lock out everyone at once.
     */
    if (!passwordChangedAt) return false;

    const ageMs = Date.now() - passwordChangedAt.getTime();
    return ageMs > expiryDays * 24 * 60 * 60 * 1000;
  }

  private async resolveHistoryCount(tenantId: string) {
    try {
      const security =
        await this.tenantSettingsResolver.getSecuritySettings(tenantId);
      const parsed = Number(security.passwordHistoryCount);
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return Math.min(24, Math.trunc(parsed));
    } catch {
      return 0;
    }
  }
}
