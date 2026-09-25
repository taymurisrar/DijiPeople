import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/*
 * BUG-3146 — account lockout for platform operators.
 *
 * The most privileged accounts on the platform were the only ones with no
 * lockout at all: `validatePlatformAdminCredentials` compared a password and
 * returned, so a platform super admin's password could be guessed without
 * limit from any address that stayed under the per-IP rate limit. This mirrors
 * `LoginLockoutService` for tenant users, with the same two decisions:
 *
 * - The counter is on the account, not the request. Rotating addresses defeats
 *   a per-address counter; it does not defeat this one.
 * - A locked account answers exactly like a wrong password, so the lock neither
 *   confirms the address nor tells an attacker they are close.
 *
 * It is also the lockout that wrong MFA codes count toward (ADR-0019): a
 * stolen password followed by unlimited six-digit guesses is not a second
 * factor.
 *
 * The thresholds are fixed. There is no platform security-settings store to
 * read them from, and the tenant defaults (5 failures, 30 minutes) are the
 * values tenant administrators already live with; a platform owner who wants
 * them tunable is asking for a settings surface, not a constant change.
 */

export const PLATFORM_LOCKOUT_ATTEMPTS = 5;
export const PLATFORM_LOCKOUT_MINUTES = 30;

@Injectable()
export class PlatformLoginLockoutService {
  private readonly logger = new Logger(PlatformLoginLockoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** True while the account is locked. An expired lock clears itself. */
  isLocked(user: { lockedUntil?: Date | null }) {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  }

  /**
   * Records one failed password or MFA attempt and locks the account at the
   * threshold. The increment is done by the database rather than read-modify-
   * write, so a burst of concurrent guesses cannot all read the same count and
   * each record "one" failure.
   *
   * Never throws: a bookkeeping failure must not turn a wrong password into a
   * server error that tells the caller something different happened.
   */
  async registerFailure(user: { id: string }) {
    try {
      const updated = await this.prisma.platformUser.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });

      if (updated.failedLoginAttempts < PLATFORM_LOCKOUT_ATTEMPTS) {
        return { locked: false, attempts: updated.failedLoginAttempts };
      }

      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: {
          lockedUntil: new Date(
            Date.now() + PLATFORM_LOCKOUT_MINUTES * 60 * 1000,
          ),
          /*
           * Reset with the lock so the next window starts fresh; otherwise the
           * first failure after the lock expires would re-lock immediately.
           */
          failedLoginAttempts: 0,
        },
      });

      this.logger.warn(
        JSON.stringify({
          event: 'admin.auth.login.locked',
          platformUserId: user.id,
          lockMinutes: PLATFORM_LOCKOUT_MINUTES,
        }),
      );

      return { locked: true, attempts: updated.failedLoginAttempts };
    } catch (error) {
      this.logger.error(
        `Could not record a failed platform sign-in: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { locked: false, attempts: 0 };
    }
  }

  /** Clears the counter and any expired lock after a successful factor. */
  async registerSuccess(user: {
    id: string;
    failedLoginAttempts?: number | null;
    lockedUntil?: Date | null;
  }) {
    if (!user.failedLoginAttempts && !user.lockedUntil) return;

    try {
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    } catch (error) {
      this.logger.error(
        `Could not clear the platform sign-in failure count: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
