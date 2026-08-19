import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SubscriptionOrderStatus } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PlatformCommunicationsService } from '../../platform-communications/platform-communications.service';

/** How long a code is good for. Long enough to find the mail, short enough to matter. */
const CODE_TTL_MS = 15 * 60_000;

/** Wrong guesses allowed against one code before it is burned. */
const MAX_ATTEMPTS = 5;

/** Minimum gap between sends, so the endpoint cannot be used to mail-bomb somebody. */
const RESEND_INTERVAL_MS = 60_000;

export type VerificationOutcome =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'ONBOARDING_SESSION_NOT_FOUND'
        | 'VERIFICATION_NOT_REQUESTED'
        | 'VERIFICATION_EXPIRED'
        | 'VERIFICATION_ATTEMPTS_EXCEEDED'
        | 'VERIFICATION_CODE_INCORRECT';
      message: string;
    };

/**
 * Prove the buyer controls the owner email, before they are charged.
 *
 * **Why before and not after.** A card proves somebody can pay; it proves
 * nothing about whether they typed their own address. The owner email is the one
 * credential that cannot be corrected from inside the workspace — get it wrong
 * and there is nobody who can sign in to fix it, so the recovery is a support
 * case against a paid account. Verifying first means the invariant `paidAt`
 * implies `ownerEmailVerifiedAt` holds, and nobody is ever charged for a
 * workspace they cannot reach.
 *
 * The cost is real and was accepted deliberately: a mail round-trip in the
 * middle of a funnel loses some buyers. The alternative loses their money.
 */
@Injectable()
export class OwnerEmailVerificationService {
  private readonly logger = new Logger(OwnerEmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly communications: PlatformCommunicationsService,
  ) {}

  /**
   * Issue a code and mail it.
   *
   * Returns the same shape whether or not the session exists, because a caller
   * who can distinguish "no such order" from "code sent" has an oracle for order
   * ids. The only externally visible difference is the 404 the controller raises
   * for a session that never existed — which it must, or the browser cannot tell
   * a dead wizard from a working one.
   */
  async issueCode(
    onboardingId: string,
  ): Promise<
    | { issued: true; expiresAt: Date }
    | { issued: false; reason: 'NOT_FOUND' | 'ALREADY_VERIFIED' | 'TOO_SOON' }
  > {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        ownerEmailVerifiedAt: true,
        emailVerificationSentAt: true,
        customer: { select: { primaryContactEmail: true, contactEmail: true } },
      },
    });

    if (!order || !this.isLive(order.status, order.expiresAt)) {
      return { issued: false, reason: 'NOT_FOUND' };
    }

    // Already proved. Re-sending would be noise, and re-verifying an address
    // that is already verified cannot make it more verified.
    if (order.ownerEmailVerifiedAt) {
      return { issued: false, reason: 'ALREADY_VERIFIED' };
    }

    /*
     * Throttled per order, not per IP. The abuse this stops is somebody using
     * a stranger's address as the owner and hammering resend, and that is one
     * order sending to one victim — an IP limit would not see it as unusual.
     */
    if (
      order.emailVerificationSentAt &&
      Date.now() - order.emailVerificationSentAt.getTime() < RESEND_INTERVAL_MS
    ) {
      return { issued: false, reason: 'TOO_SOON' };
    }

    const recipient =
      order.customer.primaryContactEmail ?? order.customer.contactEmail;
    if (!recipient) {
      return { issued: false, reason: 'NOT_FOUND' };
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.subscriptionOrder.update({
      where: { id: order.id },
      data: {
        emailVerificationCodeHash: hashCode(code),
        emailVerificationExpiresAt: expiresAt,
        emailVerificationSentAt: new Date(),
        // A new code starts a fresh budget; otherwise a resend would inherit
        // the exhausted attempts of the code it replaced.
        emailVerificationAttempts: 0,
      },
    });

    await this.communications.sendEmail({
      eventCode: 'ONBOARDING_EMAIL_VERIFICATION',
      recipient,
      subject: 'Your DijiPeople verification code',
      html: `<p>Your DijiPeople verification code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. If you did not request it, you can ignore this email — no account has been created and no payment has been taken.</p>`,
      text: `Your DijiPeople verification code is ${code}. It expires in 15 minutes. If you did not request it, ignore this email — no account has been created and no payment has been taken.`,
      entityType: 'SubscriptionOrder',
      entityId: order.id,
      /*
       * Keyed to the send time, not to the order: the whole point of a resend
       * is that it is a *new* delivery. An order-only key would make the second
       * code silently un-sendable.
       */
      idempotencyKey: `onboarding-verification:${order.id}:${expiresAt.getTime()}`,
    });

    // The code itself is never logged. It is a credential for fifteen minutes.
    this.logger.log(`Issued an owner verification code for order ${order.id}.`);

    return { issued: true, expiresAt };
  }

  /** Check a submitted code and, if it matches, record the proof. */
  async verifyCode(
    onboardingId: string,
    submitted: string,
  ): Promise<VerificationOutcome> {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        ownerEmailVerifiedAt: true,
        emailVerificationCodeHash: true,
        emailVerificationExpiresAt: true,
        emailVerificationAttempts: true,
      },
    });

    if (!order || !this.isLive(order.status, order.expiresAt)) {
      return {
        ok: false,
        code: 'ONBOARDING_SESSION_NOT_FOUND',
        message: 'This onboarding session is no longer active.',
      };
    }

    // Idempotent: submitting a code for an already-verified order succeeds
    // rather than failing, so a double-click cannot undo the verification.
    if (order.ownerEmailVerifiedAt) return { ok: true };

    if (!order.emailVerificationCodeHash || !order.emailVerificationExpiresAt) {
      return {
        ok: false,
        code: 'VERIFICATION_NOT_REQUESTED',
        message: 'Request a verification code first.',
      };
    }

    if (order.emailVerificationExpiresAt.getTime() <= Date.now()) {
      return {
        ok: false,
        code: 'VERIFICATION_EXPIRED',
        message: 'That code has expired. Request a new one.',
      };
    }

    if (order.emailVerificationAttempts >= MAX_ATTEMPTS) {
      return {
        ok: false,
        code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
        message: 'Too many incorrect codes. Request a new one.',
      };
    }

    if (!codesMatch(order.emailVerificationCodeHash, submitted)) {
      /*
       * The failed attempt is recorded before the caller is told, so a client
       * that abandons the connection still pays for the guess. Six digits is a
       * million values; five guesses per code is what keeps that a wall rather
       * than a speed bump.
       */
      await this.prisma.subscriptionOrder.update({
        where: { id: order.id },
        data: { emailVerificationAttempts: { increment: 1 } },
      });
      return {
        ok: false,
        code: 'VERIFICATION_CODE_INCORRECT',
        message: 'That code is not correct.',
      };
    }

    await this.prisma.subscriptionOrder.update({
      where: { id: order.id },
      data: {
        ownerEmailVerifiedAt: new Date(),
        // Consumed. Keeping a usable hash after it has done its job is a
        // credential left lying around for no reason.
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });

    return { ok: true };
  }

  /** A DRAFT or PENDING_PAYMENT order that has not aged out. */
  private isLive(status: SubscriptionOrderStatus, expiresAt: Date | null) {
    const open =
      status === SubscriptionOrderStatus.DRAFT ||
      status === SubscriptionOrderStatus.PENDING_PAYMENT;
    return open && (!expiresAt || expiresAt.getTime() > Date.now());
  }

  /** The gate itself, for the checkout path to call. */
  async assertVerified(onboardingId: string) {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: onboardingId },
      select: { ownerEmailVerifiedAt: true },
    });

    if (!order?.ownerEmailVerifiedAt) {
      throw new BadRequestException({
        code: 'OWNER_EMAIL_NOT_VERIFIED',
        message: 'Verify the workspace owner email before continuing.',
      });
    }
  }
}

/**
 * Six digits, from a CSPRNG.
 *
 * `randomInt` rather than `Math.random()`: this is a credential, and a
 * predictable one is not a credential. Padded so `000123` stays six characters
 * — a shorter code would leak that the number is small.
 */
function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Compare in constant time.
 *
 * The timing signal on a six-digit code is small but free to remove, and the
 * habit is what matters: the next thing compared this way might be longer.
 */
function codesMatch(storedHash: string, submitted: string) {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashCode(submitted.trim()), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
