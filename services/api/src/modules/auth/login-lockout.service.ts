import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';

/*
 * Locks an account after repeated failed sign-ins.
 *
 * `failedAttemptsBeforeLock` and `lockDurationMinutes` were configurable on the
 * Password & Login Policies screen and referenced nowhere in the codebase, so
 * every account accepted unlimited password guesses.
 *
 * Two decisions worth keeping:
 *
 * - The counter is on the account, not the request. Counting per address would
 *   be avoided by rotating addresses, which is exactly what an attacker does.
 * - A locked account returns the same error as a wrong password. Saying "this
 *   account is locked" confirms the address exists and tells an attacker their
 *   guessing is having an effect.
 */

const DEFAULT_ATTEMPTS_BEFORE_LOCK = 5;
const DEFAULT_LOCK_MINUTES = 30;

/* A tenant may loosen these, but never past the point of being useless. */
const MAX_ATTEMPTS_BEFORE_LOCK = 20;
const MAX_LOCK_MINUTES = 24 * 60;

@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
  ) {}

  private async resolvePolicy(tenantId: string) {
    try {
      const security =
        await this.tenantSettingsResolver.getSecuritySettings(tenantId);

      return {
        attemptsBeforeLock: clamp(
          security.failedAttemptsBeforeLock,
          DEFAULT_ATTEMPTS_BEFORE_LOCK,
          1,
          MAX_ATTEMPTS_BEFORE_LOCK,
        ),
        lockMinutes: clamp(
          security.lockDurationMinutes,
          DEFAULT_LOCK_MINUTES,
          1,
          MAX_LOCK_MINUTES,
        ),
      };
    } catch {
      return {
        attemptsBeforeLock: DEFAULT_ATTEMPTS_BEFORE_LOCK,
        lockMinutes: DEFAULT_LOCK_MINUTES,
      };
    }
  }

  /** True while the account is locked. Expired locks clear themselves. */
  isLocked(user: { lockedUntil?: Date | null }) {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  }

  /**
   * Records a failed attempt and locks the account once the tenant's threshold
   * is reached. Never throws: a bookkeeping failure must not turn a wrong
   * password into a server error.
   */
  async registerFailure(user: {
    id: string;
    tenantId: string;
    failedLoginAttempts?: number | null;
  }) {
    try {
      const policy = await this.resolvePolicy(user.tenantId);
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = attempts >= policy.attemptsBeforeLock;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          ...(shouldLock
            ? {
                lockedUntil: new Date(
                  Date.now() + policy.lockMinutes * 60 * 1000,
                ),
                /*
                 * Reset the counter with the lock so the next window starts
                 * fresh; otherwise one more failure after expiry re-locks
                 * immediately.
                 */
                failedLoginAttempts: 0,
              }
            : {}),
        },
      });

      if (shouldLock) {
        this.logger.warn(
          JSON.stringify({
            event: 'auth.login.locked',
            userId: user.id,
            tenantId: user.tenantId,
            lockMinutes: policy.lockMinutes,
          }),
        );
      }

      return { locked: shouldLock, attempts };
    } catch (error) {
      this.logger.error(
        `Could not record a failed sign-in: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { locked: false, attempts: 0 };
    }
  }

  /** Clears the counter and any expired lock after a correct password. */
  async registerSuccess(user: {
    id: string;
    failedLoginAttempts?: number | null;
    lockedUntil?: Date | null;
  }) {
    if (!user.failedLoginAttempts && !user.lockedUntil) return;

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    } catch (error) {
      this.logger.error(
        `Could not clear the sign-in failure count: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function clamp(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}
