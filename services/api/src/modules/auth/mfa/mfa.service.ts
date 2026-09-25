import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, SecurityPrivilege } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { toDataURL } from 'qrcode';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { ENTITY_KEYS } from '../../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { buildScopedAccessWhere } from '../../../common/security/rbac-query-scope';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { AuditService } from '../../audit/audit.service';
import { resolveLoginCredential } from '../../users/identity.service';
import { LoginLockoutService } from '../login-lockout.service';
import { PlatformLoginLockoutService } from '../platform-login-lockout.service';
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  recoveryCodeHashInput,
} from './recovery-codes';
import {
  buildOtpauthUri,
  formatManualEntryKey,
  generateTotpSecret,
  verifyTotp,
} from './totp';

/*
 * TOTP multi-factor authentication for both kinds of account (ADR-0019).
 *
 * One service for tenant users (`User`) and platform operators
 * (`PlatformUser`), because every rule is the same for both and a second copy
 * is how the two would drift: the seed is stored encrypted and never returned
 * after setup; setup stays pending until a code from the new seed verifies;
 * the last accepted time step is remembered so a code cannot be used twice;
 * recovery codes are stored as keyed hashes and each works once; and a wrong
 * code counts toward the same account lockout as a wrong password.
 *
 * MFA lives on the account that signs in, not on the cross-tenant `Identity`:
 * a tenant administrator resetting one person's MFA must never change how that
 * person signs in to a different tenant.
 *
 * Nothing here logs a seed, a code, a recovery code or the otpauth URI, and no
 * audit snapshot carries anything but booleans, counts and timestamps.
 */

export const MFA_ISSUER = 'DijiPeople';

export type MfaSubject =
  | { kind: 'tenant'; userId: string; tenantId: string }
  | { kind: 'platform'; platformUserId: string };

export type SecondFactorInput = {
  code?: string | null;
  recoveryCode?: string | null;
};

export type SecondFactorMethod = 'TOTP' | 'RECOVERY_CODE';

type MfaState = {
  id: string;
  email: string;
  accountLabel: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  mfaPendingSecretEncrypted: string | null;
  mfaEnabledAt: Date | null;
  mfaLastUsedStep: bigint | null;
  failedLoginAttempts: number;
};

type Db = PrismaService | Prisma.TransactionClient;

/** The compare-and-set conditions an MFA write may carry; valid on both models. */
type MfaStateCondition = {
  mfaEnabled?: boolean;
  mfaPendingSecretEncrypted?: string | null;
  OR?: Array<{ mfaLastUsedStep: null | { lt: bigint } }>;
};

type MfaStateWrite = {
  mfaEnabled?: boolean;
  mfaSecretEncrypted?: string | null;
  mfaPendingSecretEncrypted?: string | null;
  mfaEnabledAt?: Date | null;
  mfaLastUsedStep?: bigint | null;
};

const MFA_STATE_SELECT = {
  id: true,
  email: true,
  mfaEnabled: true,
  mfaSecretEncrypted: true,
  mfaPendingSecretEncrypted: true,
  mfaEnabledAt: true,
  mfaLastUsedStep: true,
  failedLoginAttempts: true,
} as const;

/** Every MFA column back to "never enrolled". */
const MFA_CLEARED = {
  mfaEnabled: false,
  mfaSecretEncrypted: null,
  mfaPendingSecretEncrypted: null,
  mfaEnabledAt: null,
  mfaLastUsedStep: null,
} as const;

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly auditService: AuditService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly platformLoginLockoutService: PlatformLoginLockoutService,
  ) {}

  /** Enrolment state for the account's own security screen. Never the seed. */
  async getStatus(subject: MfaSubject) {
    const state = await this.loadState(subject);
    const recoveryCodesRemaining = state.mfaEnabled
      ? await this.countUnusedRecoveryCodes(subject)
      : 0;

    return {
      enabled: state.mfaEnabled,
      enabledAt: state.mfaEnabledAt,
      pendingSetup:
        !state.mfaEnabled && Boolean(state.mfaPendingSecretEncrypted),
      recoveryCodesRemaining,
      methods: ['TOTP'] as const,
    };
  }

  /**
   * Begins enrolment: a new seed, stored encrypted as *pending*.
   *
   * MFA is not on until `confirmSetup` verifies a code from this seed, so an
   * abandoned setup — a closed tab, a phone that never scanned — leaves sign-in
   * exactly as it was. Starting again replaces the pending seed, which makes
   * the previous QR code useless rather than a second valid enrolment.
   */
  async startSetup(subject: MfaSubject) {
    this.assertEncryptionAvailable();
    const state = await this.loadState(subject);

    if (state.mfaEnabled) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message:
          'Two-factor authentication is already on for this account. Turn it off first to enrol a new authenticator.',
      });
    }

    const secret = generateTotpSecret();
    await this.writeState(
      subject,
      {},
      {
        mfaPendingSecretEncrypted: this.encryption.encrypt(secret),
      },
    );

    const otpauthUri = buildOtpauthUri({
      issuer: MFA_ISSUER,
      accountLabel: state.accountLabel,
      secretBase32: secret,
    });

    return {
      issuer: MFA_ISSUER,
      accountLabel: state.accountLabel,
      manualEntryKey: formatManualEntryKey(secret),
      otpauthUri,
      qrCodeDataUrl: await toDataURL(otpauthUri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
      }),
    };
  }

  /**
   * Completes enrolment with a code from the pending seed and returns the
   * recovery codes — the only time they are ever readable.
   *
   * The confirming code's time step is recorded as the last one used, so the
   * code typed here cannot also be replayed to complete a sign-in.
   */
  async confirmSetup(
    subject: MfaSubject,
    code: string,
    actor: { actorId: string },
  ) {
    this.assertEncryptionAvailable();
    const state = await this.loadState(subject);

    if (state.mfaEnabled) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'Two-factor authentication is already on for this account.',
      });
    }

    if (!state.mfaPendingSecretEncrypted) {
      throw new BadRequestException({
        code: 'MFA_SETUP_NOT_STARTED',
        message: 'Start two-factor setup again to get a new QR code.',
      });
    }

    const pendingSecret = this.encryption.decrypt(
      state.mfaPendingSecretEncrypted,
    );
    const verification = verifyTotp(pendingSecret, code);

    if (!verification.valid) {
      throw new BadRequestException({
        code: 'MFA_CODE_INVALID',
        message:
          'That code does not match. Enter the current 6-digit code from your authenticator app.',
      });
    }

    const recoveryCodes = generateRecoveryCodes();
    const enabledAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      /*
       * Conditional on the pending seed still being the one just verified: a
       * setup restarted in another tab between the read and this write must
       * not be enabled with a seed the person no longer has in their app.
       */
      const updated = await this.writeState(
        subject,
        {
          mfaEnabled: false,
          mfaPendingSecretEncrypted: state.mfaPendingSecretEncrypted,
        },
        {
          mfaEnabled: true,
          mfaSecretEncrypted: state.mfaPendingSecretEncrypted,
          mfaPendingSecretEncrypted: null,
          mfaEnabledAt: enabledAt,
          mfaLastUsedStep: BigInt(verification.step),
        },
        tx,
      );

      if (updated === 0) {
        throw new ConflictException({
          code: 'MFA_SETUP_SUPERSEDED',
          message:
            'Two-factor setup was restarted elsewhere. Start setup again to get a new QR code.',
        });
      }

      await this.replaceRecoveryCodes(subject, recoveryCodes, tx);
      await this.audit(
        subject,
        {
          actorId: actor.actorId,
          action: AUDIT_ACTIONS.AUTH_MFA_ENABLED,
          beforeSnapshot: { mfaEnabled: false },
          afterSnapshot: {
            mfaEnabled: true,
            mfaEnabledAt: enabledAt.toISOString(),
            recoveryCodesIssued: recoveryCodes.length,
          },
        },
        tx,
      );
    });

    return { enabled: true, enabledAt, recoveryCodes };
  }

  /**
   * Checks a TOTP or a recovery code and, if it is good, spends it.
   *
   * A TOTP is spent by advancing `mfaLastUsedStep` with a write conditional on
   * the previous value: two requests presenting the same code race on that
   * one row, exactly one of them updates it, and the other is refused as a
   * replay. A recovery code is spent the same way, with `usedAt: null` in the
   * filter. Returns the method that passed, or `null` — the caller decides what
   * a failure costs, because at sign-in it is a lockout strike and during setup
   * it is not.
   */
  async verifySecondFactor(
    subject: MfaSubject,
    input: SecondFactorInput,
    options: { allowRecoveryCode?: boolean } = {},
  ): Promise<SecondFactorMethod | null> {
    const state = await this.loadState(subject);
    if (!state.mfaEnabled || !state.mfaSecretEncrypted) return null;

    if (input.code) {
      const verification = verifyTotp(
        this.encryption.decrypt(state.mfaSecretEncrypted),
        input.code,
        { lastUsedStep: state.mfaLastUsedStep },
      );
      if (!verification.valid) return null;

      const step = BigInt(verification.step);
      const claimed = await this.writeState(
        subject,
        {
          mfaEnabled: true,
          OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }],
        },
        { mfaLastUsedStep: step },
      );
      return claimed === 1 ? 'TOTP' : null;
    }

    if (input.recoveryCode && options.allowRecoveryCode !== false) {
      const normalized = normalizeRecoveryCode(input.recoveryCode);
      if (!normalized) return null;
      const consumed = await this.consumeRecoveryCode(subject, normalized);
      if (!consumed) return null;

      await this.audit(subject, {
        actorId: state.id,
        action: AUDIT_ACTIONS.AUTH_MFA_RECOVERY_CODE_USED,
        afterSnapshot: {
          recoveryCodesRemaining: await this.countUnusedRecoveryCodes(subject),
        },
      });
      return 'RECOVERY_CODE';
    }

    return null;
  }

  /**
   * A new set of recovery codes; every earlier code stops working. Requires a
   * current TOTP rather than a recovery code, so a person holding one leaked
   * code cannot turn it into ten.
   */
  async regenerateRecoveryCodes(subject: MfaSubject, code: string) {
    await this.requireFactor(subject, { code }, { allowRecoveryCode: false });

    const recoveryCodes = generateRecoveryCodes();
    const actorId = this.subjectId(subject);

    await this.prisma.$transaction(async (tx) => {
      await this.replaceRecoveryCodes(subject, recoveryCodes, tx);
      await this.audit(
        subject,
        {
          actorId,
          action: AUDIT_ACTIONS.AUTH_MFA_RECOVERY_CODES_REGENERATED,
          afterSnapshot: { recoveryCodesIssued: recoveryCodes.length },
        },
        tx,
      );
    });

    return { recoveryCodes };
  }

  /**
   * Turns MFA off. Requires the current password **and** a current TOTP or a
   * recovery code: an unattended signed-in browser is exactly the situation MFA
   * exists for, and it must not be one click away from removing it.
   */
  async disable(
    subject: MfaSubject,
    input: SecondFactorInput & { password: string },
  ) {
    const state = await this.loadState(subject);
    if (!state.mfaEnabled) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'Two-factor authentication is not on for this account.',
      });
    }

    if (!(await this.passwordMatches(subject, input.password))) {
      await this.registerFactorFailure(subject);
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Your current password is not correct.',
      });
    }

    await this.requireFactor(subject, input);

    const actorId = this.subjectId(subject);
    await this.prisma.$transaction(async (tx) => {
      await this.writeState(subject, {}, { ...MFA_CLEARED }, tx);
      await this.deleteRecoveryCodes(subject, tx);
      await this.audit(
        subject,
        {
          actorId,
          action: AUDIT_ACTIONS.AUTH_MFA_DISABLED,
          beforeSnapshot: {
            mfaEnabled: true,
            mfaEnabledAt: state.mfaEnabledAt?.toISOString() ?? null,
          },
          afterSnapshot: { mfaEnabled: false },
        },
        tx,
      );
    });

    return { enabled: false };
  }

  /**
   * A tenant administrator clears another user's MFA (`users.update` +
   * USERS:write, checked by the controller).
   *
   * The target is loaded by `{ id, tenantId }` from the administrator's own
   * token **and** the administrator's row-level USERS write scope, so neither
   * another tenant's account nor one outside the administrator's business-unit
   * scope can be reached — both look like "not found". The administrator never
   * sees or chooses a credential: the seed and recovery codes are deleted, and
   * every session the person holds is revoked so the reset cannot leave a
   * session that was established by whoever took the old device.
   */
  async adminResetTenantUser(actor: AuthenticatedUser, targetUserId: string) {
    if (actor.platform || !actor.tenantId || actor.tenantId === 'platform') {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Tenant access context is required.',
      });
    }

    if (targetUserId === actor.userId) {
      throw new BadRequestException({
        code: 'MFA_RESET_SELF',
        message:
          'You cannot reset your own two-factor authentication here. Turn it off from your profile instead.',
      });
    }

    const scopeWhere = buildScopedAccessWhere<Prisma.UserWhereInput>(
      actor,
      ENTITY_KEYS.USERS,
      SecurityPrivilege.WRITE,
      { organizationIdField: null, userIdField: 'id' },
    );
    const target = await this.prisma.user.findFirst({
      where: {
        AND: [{ id: targetUserId, tenantId: actor.tenantId }, scopeWhere],
      },
      select: {
        id: true,
        tenantId: true,
        mfaEnabled: true,
        mfaEnabledAt: true,
      },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User was not found for this tenant.',
      });
    }

    const subject: MfaSubject = {
      kind: 'tenant',
      userId: target.id,
      tenantId: target.tenantId,
    };

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await this.writeState(subject, {}, { ...MFA_CLEARED }, tx);
      await this.deleteRecoveryCodes(subject, tx);
      const revoked = await tx.refreshToken.updateMany({
        where: {
          userId: target.id,
          tenantId: target.tenantId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        subject,
        {
          actorId: actor.userId,
          action: AUDIT_ACTIONS.AUTH_MFA_RESET,
          beforeSnapshot: {
            targetUserId: target.id,
            mfaEnabled: target.mfaEnabled,
            mfaEnabledAt: target.mfaEnabledAt?.toISOString() ?? null,
          },
          afterSnapshot: {
            targetUserId: target.id,
            mfaEnabled: false,
            revokedSessions: revoked.count,
          },
        },
        tx,
      );
      return revoked.count;
    });

    return { userId: target.id, mfaEnabled: false, revokedSessions };
  }

  /**
   * A platform operator clears another operator's MFA. Authorization — the
   * manage-platform-users check — is the caller's (`PlatformUsersService`),
   * which is the one place that decision lives.
   */
  async adminResetPlatformUser(actorPlatformUserId: string, targetId: string) {
    if (actorPlatformUserId === targetId) {
      throw new BadRequestException({
        code: 'MFA_RESET_SELF',
        message:
          'You cannot reset your own two-factor authentication here. Turn it off from your Security page instead.',
      });
    }

    const target = await this.prisma.platformUser.findUnique({
      where: { id: targetId },
      select: { id: true, mfaEnabled: true, mfaEnabledAt: true },
    });

    if (!target) {
      throw new NotFoundException('Platform user was not found.');
    }

    const subject: MfaSubject = { kind: 'platform', platformUserId: target.id };

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await this.writeState(subject, {}, { ...MFA_CLEARED }, tx);
      await this.deleteRecoveryCodes(subject, tx);
      const revoked = await tx.platformRefreshToken.updateMany({
        where: { platformUserId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        subject,
        {
          actorId: actorPlatformUserId,
          action: AUDIT_ACTIONS.AUTH_MFA_RESET,
          beforeSnapshot: {
            targetPlatformUserId: target.id,
            mfaEnabled: target.mfaEnabled,
            mfaEnabledAt: target.mfaEnabledAt?.toISOString() ?? null,
          },
          afterSnapshot: {
            targetPlatformUserId: target.id,
            mfaEnabled: false,
            revokedSessions: revoked.count,
          },
        },
        tx,
      );
      return revoked.count;
    });

    return { userId: target.id, mfaEnabled: false, revokedSessions };
  }

  /**
   * Records a wrong code (or a wrong password on an MFA screen) against the
   * account lockout. Never throws — the lockout services already guarantee
   * that, and a bookkeeping failure must not change the response.
   */
  async registerFactorFailure(subject: MfaSubject) {
    if (subject.kind === 'platform') {
      await this.platformLoginLockoutService.registerFailure({
        id: subject.platformUserId,
      });
      return;
    }

    const user = await this.prisma.user
      .findFirst({
        where: { id: subject.userId, tenantId: subject.tenantId },
        select: { id: true, tenantId: true, failedLoginAttempts: true },
      })
      .catch(() => null);
    if (user) {
      await this.loginLockoutService.registerFailure(user);
    }
  }

  /** Throws the standard "code not accepted" refusal after counting it. */
  private async requireFactor(
    subject: MfaSubject,
    input: SecondFactorInput,
    options: { allowRecoveryCode?: boolean } = {},
  ) {
    const method = await this.verifySecondFactor(subject, input, options);
    if (method) return method;

    await this.registerFactorFailure(subject);
    throw new BadRequestException({
      code: 'MFA_CODE_INVALID',
      message:
        options.allowRecoveryCode === false
          ? 'That code is not valid. Enter the current 6-digit code from your authenticator app.'
          : 'That code is not valid. Enter the current 6-digit code or one of your unused recovery codes.',
    });
  }

  private async passwordMatches(subject: MfaSubject, password: string) {
    if (!password) return false;

    if (subject.kind === 'platform') {
      const user = await this.prisma.platformUser.findUnique({
        where: { id: subject.platformUserId },
        select: { passwordHash: true },
      });
      return user ? bcrypt.compare(password, user.passwordHash) : false;
    }

    // The same identity-aware lookup sign-in uses, so the password that signs
    // this person in is the password that turns MFA off.
    const credential = await resolveLoginCredential(
      this.prisma,
      subject.userId,
    );
    return credential
      ? bcrypt.compare(password, credential.passwordHash)
      : false;
  }

  private assertEncryptionAvailable() {
    if (!this.encryption.isEnabled) {
      /*
       * `encrypt` silently returns plaintext when no key is configured. For an
       * integration credential that was judged an acceptable development
       * fallback; for an MFA seed it is not — a database read would be a
       * second factor. Refuse instead.
       */
      throw new ServiceUnavailableException({
        code: 'MFA_ENCRYPTION_UNAVAILABLE',
        message:
          'Two-factor authentication cannot be set up until the server encryption key (SECRET_ENCRYPTION_KEY) is configured.',
      });
    }
  }

  private subjectId(subject: MfaSubject) {
    return subject.kind === 'tenant' ? subject.userId : subject.platformUserId;
  }

  private async loadState(subject: MfaSubject, db: Db = this.prisma) {
    if (subject.kind === 'platform') {
      const user = await db.platformUser.findUnique({
        where: { id: subject.platformUserId },
        select: MFA_STATE_SELECT,
      });
      if (!user) throw this.accountNotFound();
      return { ...user, accountLabel: user.email } satisfies MfaState;
    }

    const user = await db.user.findFirst({
      where: { id: subject.userId, tenantId: subject.tenantId },
      select: {
        ...MFA_STATE_SELECT,
        tenant: { select: { name: true, displayName: true } },
      },
    });
    if (!user) throw this.accountNotFound();

    const tenantName = user.tenant.displayName || user.tenant.name;
    const { tenant: _tenant, ...state } = user;
    void _tenant;
    return {
      ...state,
      // Two workspaces, two entries in the app, told apart by name.
      accountLabel: tenantName ? `${user.email} (${tenantName})` : user.email,
    } satisfies MfaState;
  }

  /**
   * One conditional write against the subject's own row, returning how many
   * rows matched. `updateMany` so that `extraWhere` can carry the
   * compare-and-set conditions replay prevention depends on.
   */
  private async writeState(
    subject: MfaSubject,
    extraWhere: MfaStateCondition,
    data: MfaStateWrite,
    db: Db = this.prisma,
  ) {
    const result =
      subject.kind === 'platform'
        ? await db.platformUser.updateMany({
            where: { ...extraWhere, id: subject.platformUserId },
            data,
          })
        : await db.user.updateMany({
            where: {
              ...extraWhere,
              id: subject.userId,
              tenantId: subject.tenantId,
            },
            data,
          });
    return result.count;
  }

  private hashRecoveryCode(subject: MfaSubject, normalizedCode: string) {
    return this.encryption.hmac(
      recoveryCodeHashInput(this.subjectId(subject), normalizedCode),
    );
  }

  private async replaceRecoveryCodes(
    subject: MfaSubject,
    codes: string[],
    db: Db,
  ) {
    await this.deleteRecoveryCodes(subject, db);
    const hashes = codes.map((code) =>
      this.hashRecoveryCode(subject, normalizeRecoveryCode(code) as string),
    );

    if (subject.kind === 'platform') {
      await db.platformUserMfaRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({
          platformUserId: subject.platformUserId,
          codeHash,
        })),
      });
      return;
    }

    await db.userMfaRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({
        tenantId: subject.tenantId,
        userId: subject.userId,
        codeHash,
      })),
    });
  }

  private async deleteRecoveryCodes(subject: MfaSubject, db: Db) {
    if (subject.kind === 'platform') {
      await db.platformUserMfaRecoveryCode.deleteMany({
        where: { platformUserId: subject.platformUserId },
      });
      return;
    }
    await db.userMfaRecoveryCode.deleteMany({
      where: { tenantId: subject.tenantId, userId: subject.userId },
    });
  }

  private async consumeRecoveryCode(
    subject: MfaSubject,
    normalizedCode: string,
  ) {
    const codeHash = this.hashRecoveryCode(subject, normalizedCode);
    const now = new Date();

    const result =
      subject.kind === 'platform'
        ? await this.prisma.platformUserMfaRecoveryCode.updateMany({
            where: {
              codeHash,
              platformUserId: subject.platformUserId,
              usedAt: null,
            },
            data: { usedAt: now },
          })
        : await this.prisma.userMfaRecoveryCode.updateMany({
            where: {
              codeHash,
              tenantId: subject.tenantId,
              userId: subject.userId,
              usedAt: null,
            },
            data: { usedAt: now },
          });

    return result.count === 1;
  }

  private async countUnusedRecoveryCodes(subject: MfaSubject) {
    return subject.kind === 'platform'
      ? this.prisma.platformUserMfaRecoveryCode.count({
          where: { platformUserId: subject.platformUserId, usedAt: null },
        })
      : this.prisma.userMfaRecoveryCode.count({
          where: {
            tenantId: subject.tenantId,
            userId: subject.userId,
            usedAt: null,
          },
        });
  }

  private async audit(
    subject: MfaSubject,
    input: {
      actorId: string;
      action: string;
      beforeSnapshot?: Record<string, unknown>;
      afterSnapshot?: Record<string, unknown>;
    },
    db?: Prisma.TransactionClient,
  ) {
    const payload = {
      tenantId: subject.kind === 'tenant' ? subject.tenantId : 'platform',
      actorUserId: input.actorId,
      action: input.action,
      entityType: subject.kind === 'tenant' ? 'User' : 'PlatformUser',
      entityId: this.subjectId(subject),
      sourceModule: 'auth',
      beforeSnapshot: input.beforeSnapshot,
      afterSnapshot: input.afterSnapshot,
    };

    try {
      await this.auditService.log(payload, db);
    } catch (error) {
      /*
       * Inside a transaction the failure must propagate — an MFA change whose
       * audit row could not be written should roll back rather than happen
       * silently. Outside one (the recovery-code-used event), the sign-in it
       * belongs to has already been decided and is not undone by a log write.
       */
      if (db) throw error;
      this.logger.warn(
        JSON.stringify({
          event: 'auth.mfa.audit.failed',
          action: input.action,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private accountNotFound() {
    return new NotFoundException({
      code: 'ACCOUNT_NOT_FOUND',
      message: 'This account could not be found.',
    });
  }
}
