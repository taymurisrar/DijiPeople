import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { IntegrationGatewayStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Gateway machine identity: pairing codes and service credentials.
 *
 * Two separate secrets with different jobs:
 *
 *   Pairing code — short-lived, single-use, human-transportable. Proves an
 *                  operator was authorised to install this gateway. It is never
 *                  an authentication credential.
 *   Credential   — long-lived, machine-only, high entropy. Issued once, at
 *                  successful pairing, and used for every subsequent request.
 *
 * Neither is recoverable from the database: only SHA-256 hashes are stored, and
 * plaintext is returned exactly once at the moment of creation. No user password
 * participates anywhere in this path.
 */

const PAIRING_CODE_BYTES = 8; // ~13 chars base32-ish, readable over a phone
const CREDENTIAL_BYTES = 32; // 256 bits
const PAIRING_TTL_MINUTES = 30;
const CREDENTIAL_PREFIX = 'dpgw_';

/** Excludes I, L, O, U and 0/1 so a human can read a code aloud unambiguously. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface IssuedPairingCode {
  pairingCodeId: string;
  /** Returned once. Never persisted, never logged, never returned again. */
  plaintext: string;
  codeHint: string;
  expiresAt: Date;
}

export interface IssuedCredential {
  credentialId: string;
  /** Returned once. Never persisted, never logged, never returned again. */
  plaintext: string;
  tokenPrefix: string;
}

export interface ResolvedGatewayIdentity {
  tenantId: string;
  gatewayId: string;
  credentialId: string;
  gatewayName: string;
  status: IntegrationGatewayStatus;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time compare so a hash comparison cannot be timed. */
function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class GatewayCredentialService {
  private readonly logger = new Logger(GatewayCredentialService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateReadableCode(): string {
    const bytes = randomBytes(PAIRING_CODE_BYTES);
    let code = '';
    for (const byte of bytes) {
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
    // Grouped for legibility when read out or typed in.
    return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
  }

  /**
   * Issues a pairing code for a gateway.
   *
   * Any outstanding unconsumed code for the gateway is revoked first, so at most
   * one code is live at a time and a forgotten code cannot be redeemed later.
   */
  async issuePairingCode(input: {
    tenantId: string;
    gatewayId: string;
    actorUserId?: string | null;
    ttlMinutes?: number;
  }): Promise<IssuedPairingCode> {
    const gateway = await this.prisma.integrationGateway.findFirst({
      where: { id: input.gatewayId, tenantId: input.tenantId },
      select: { id: true, revokedAt: true },
    });

    if (!gateway) {
      throw new ForbiddenException('Gateway not found.');
    }
    if (gateway.revokedAt) {
      throw new ForbiddenException(
        'This gateway has been revoked and cannot be paired.',
      );
    }

    const plaintext = this.generateReadableCode();
    const expiresAt = new Date(
      Date.now() + (input.ttlMinutes ?? PAIRING_TTL_MINUTES) * 60_000,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.integrationGatewayPairingCode.updateMany({
        where: {
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      return tx.integrationGatewayPairingCode.create({
        data: {
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
          codeHash: sha256(plaintext),
          // First group only. Enough to tell two codes apart, not enough to
          // narrow a brute force meaningfully.
          codeHint: plaintext.slice(0, 4),
          expiresAt,
          createdById: input.actorUserId ?? null,
        },
        select: { id: true, codeHint: true, expiresAt: true },
      });
    });

    return {
      pairingCodeId: created.id,
      plaintext,
      codeHint: created.codeHint,
      expiresAt: created.expiresAt,
    };
  }

  /**
   * Redeems a pairing code and issues a credential.
   *
   * Consumption is a conditional UPDATE inside a transaction: the row is claimed
   * with `consumedAt IS NULL` in the WHERE clause, so if two installers redeem
   * the same code simultaneously exactly one update matches and the other sees
   * zero rows affected. A read-then-write would let both through.
   */
  async redeemPairingCode(input: {
    plaintext: string;
    gatewayVersion?: string | null;
    platform?: string | null;
    architecture?: string | null;
    capabilities?: Prisma.InputJsonValue | null;
    ipAddress?: string | null;
  }): Promise<{
    gatewayId: string;
    tenantId: string;
    credential: IssuedCredential;
  }> {
    const submitted = input.plaintext.trim().toUpperCase();
    const codeHash = sha256(submitted);

    const record = await this.prisma.integrationGatewayPairingCode.findFirst({
      where: { codeHash },
      select: {
        id: true,
        tenantId: true,
        gatewayId: true,
        codeHash: true,
        expiresAt: true,
        consumedAt: true,
        revokedAt: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });

    // Same error for unknown, expired, consumed and revoked. A distinct message
    // per case would tell an attacker which codes exist.
    const rejection = new ForbiddenException(
      'The pairing code is invalid, expired, or has already been used.',
    );

    if (!record || !hashesMatch(record.codeHash, codeHash)) {
      throw rejection;
    }

    if (record.attemptCount >= record.maxAttempts) {
      throw rejection;
    }

    if (
      record.revokedAt ||
      record.consumedAt ||
      record.expiresAt <= new Date()
    ) {
      await this.recordFailedAttempt(record.id);
      throw rejection;
    }

    const plaintextCredential = `${CREDENTIAL_PREFIX}${randomBytes(
      CREDENTIAL_BYTES,
    ).toString('base64url')}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Atomic claim. Only one concurrent caller can match this predicate.
        const claimed = await tx.integrationGatewayPairingCode.updateMany({
          where: {
            id: record.id,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            consumedAt: new Date(),
            consumedIp: input.ipAddress ?? null,
            lastAttemptAt: new Date(),
          },
        });

        if (claimed.count !== 1) {
          throw rejection;
        }

        const gateway = await tx.integrationGateway.findFirst({
          where: { id: record.gatewayId, tenantId: record.tenantId },
          select: { id: true, revokedAt: true },
        });

        if (!gateway || gateway.revokedAt) {
          throw rejection;
        }

        const credential = await tx.integrationGatewayCredential.create({
          data: {
            tenantId: record.tenantId,
            gatewayId: record.gatewayId,
            secretHash: sha256(plaintextCredential),
            tokenPrefix: plaintextCredential.slice(0, 12),
            label: 'Issued at pairing',
          },
          select: { id: true, tokenPrefix: true },
        });

        await tx.integrationGateway.update({
          where: { id: record.gatewayId },
          data: {
            status: IntegrationGatewayStatus.ONLINE,
            registeredAt: new Date(),
            lastHeartbeatAt: new Date(),
            lastIpAddress: input.ipAddress ?? null,
            version: input.gatewayVersion ?? null,
            platform: input.platform ?? null,
            architecture: input.architecture ?? null,
            ...(input.capabilities !== undefined && input.capabilities !== null
              ? { capabilities: input.capabilities }
              : {}),
          },
        });

        return {
          gatewayId: record.gatewayId,
          tenantId: record.tenantId,
          credential: {
            credentialId: credential.id,
            plaintext: plaintextCredential,
            tokenPrefix: credential.tokenPrefix,
          },
        };
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.recordFailedAttempt(record.id);
      }
      throw error;
    }
  }

  private async recordFailedAttempt(pairingCodeId: string): Promise<void> {
    try {
      await this.prisma.integrationGatewayPairingCode.update({
        where: { id: pairingCodeId },
        data: {
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    } catch {
      // Never let attempt bookkeeping mask the authentication failure.
    }
  }

  /**
   * Resolves a presented credential to a gateway identity.
   *
   * Tenant and gateway come from the stored record, never from the request, so a
   * caller cannot name a tenant it does not belong to.
   */
  async resolveCredential(
    presented: string,
    ipAddress?: string | null,
  ): Promise<ResolvedGatewayIdentity | null> {
    if (!presented || !presented.startsWith(CREDENTIAL_PREFIX)) {
      return null;
    }

    const record = await this.prisma.integrationGatewayCredential.findUnique({
      where: { secretHash: sha256(presented) },
      select: {
        id: true,
        tenantId: true,
        gatewayId: true,
        secretHash: true,
        revokedAt: true,
        expiresAt: true,
        gateway: { select: { name: true, status: true, revokedAt: true } },
      },
    });

    if (!record || !hashesMatch(record.secretHash, sha256(presented))) {
      return null;
    }

    // Revoking either the credential or the gateway itself cuts access.
    if (record.revokedAt || record.gateway.revokedAt) return null;
    if (record.expiresAt && record.expiresAt <= new Date()) return null;
    if (record.gateway.status === IntegrationGatewayStatus.REVOKED) return null;

    // Best-effort usage stamp; must not fail the request.
    void this.prisma.integrationGatewayCredential
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date(), lastIpAddress: ipAddress ?? null },
      })
      .catch(() => undefined);

    return {
      tenantId: record.tenantId,
      gatewayId: record.gatewayId,
      credentialId: record.id,
      gatewayName: record.gateway.name,
      status: record.gateway.status,
    };
  }

  /** Revokes every credential for a gateway and marks the gateway revoked. */
  async revokeGateway(input: {
    tenantId: string;
    gatewayId: string;
    reason?: string | null;
    actorUserId?: string | null;
  }): Promise<{ revokedCredentials: number }> {
    return this.prisma.$transaction(async (tx) => {
      const gateway = await tx.integrationGateway.findFirst({
        where: { id: input.gatewayId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!gateway) {
        throw new ForbiddenException('Gateway not found.');
      }

      const now = new Date();

      const credentials = await tx.integrationGatewayCredential.updateMany({
        where: {
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: input.reason ?? 'Gateway revoked',
        },
      });

      // Outstanding pairing codes die with the gateway, so a revoked gateway
      // cannot be re-paired using a code issued before the revocation.
      await tx.integrationGatewayPairingCode.updateMany({
        where: {
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      await tx.integrationGateway.update({
        where: { id: input.gatewayId },
        data: {
          status: IntegrationGatewayStatus.REVOKED,
          revokedAt: now,
          revokedReason: input.reason ?? null,
          updatedById: input.actorUserId ?? null,
        },
      });

      return { revokedCredentials: credentials.count };
    });
  }

  /**
   * Issues an additional credential for rotation.
   *
   * The existing credential keeps working so the gateway can be switched over
   * without downtime. `retireExistingAfterMinutes` bounds that overlap: passing
   * it stamps `expiresAt` on the currently-active credentials so the old secret
   * cannot stay valid forever if someone forgets to retire it. Passing nothing
   * keeps the old credential open-ended, which is the right default when the
   * switchover window is not known in advance.
   */
  async rotateCredential(input: {
    tenantId: string;
    gatewayId: string;
    label?: string | null;
    actorUserId?: string | null;
    /** Optional bounded overlap for the credentials being replaced. */
    retireExistingAfterMinutes?: number | null;
  }): Promise<
    IssuedCredential & {
      retiredExisting: number;
      existingRetireAt: Date | null;
    }
  > {
    const gateway = await this.prisma.integrationGateway.findFirst({
      where: { id: input.gatewayId, tenantId: input.tenantId, revokedAt: null },
      select: { id: true },
    });
    if (!gateway) {
      throw new ForbiddenException('Gateway not found.');
    }

    const plaintext = `${CREDENTIAL_PREFIX}${randomBytes(
      CREDENTIAL_BYTES,
    ).toString('base64url')}`;

    const existingRetireAt =
      input.retireExistingAfterMinutes && input.retireExistingAfterMinutes > 0
        ? new Date(Date.now() + input.retireExistingAfterMinutes * 60_000)
        : null;

    return this.prisma.$transaction(async (tx) => {
      let retiredExisting = 0;

      if (existingRetireAt) {
        // Only credentials with no expiry are stamped; one that already has a
        // shorter deadline keeps it rather than being extended.
        const retired = await tx.integrationGatewayCredential.updateMany({
          where: {
            tenantId: input.tenantId,
            gatewayId: input.gatewayId,
            revokedAt: null,
            expiresAt: null,
          },
          data: { expiresAt: existingRetireAt },
        });
        retiredExisting = retired.count;
      }

      const credential = await tx.integrationGatewayCredential.create({
        data: {
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
          secretHash: sha256(plaintext),
          tokenPrefix: plaintext.slice(0, 12),
          label: input.label ?? 'Rotated credential',
          createdById: input.actorUserId ?? null,
        },
        select: { id: true, tokenPrefix: true },
      });

      return {
        credentialId: credential.id,
        plaintext,
        tokenPrefix: credential.tokenPrefix,
        retiredExisting,
        existingRetireAt,
      };
    });
  }

  /**
   * Retires one credential without touching the gateway or its siblings.
   *
   * This is what completes a rotation: once the gateway is confirmed to be using
   * the new secret, the old one is retired individually. Revoking the whole
   * gateway to achieve this would cut off the live credential too.
   */
  async retireCredential(input: {
    tenantId: string;
    gatewayId: string;
    credentialId: string;
    reason?: string | null;
    actorUserId?: string | null;
  }): Promise<{ credentialId: string; tokenPrefix: string; retiredAt: Date }> {
    const credential = await this.prisma.integrationGatewayCredential.findFirst(
      {
        where: {
          id: input.credentialId,
          tenantId: input.tenantId,
          gatewayId: input.gatewayId,
        },
        select: { id: true, tokenPrefix: true, revokedAt: true },
      },
    );

    if (!credential) {
      // Same response for missing and other-tenant, so an id cannot be probed.
      throw new ForbiddenException('Gateway credential not found.');
    }

    if (credential.revokedAt) {
      return {
        credentialId: credential.id,
        tokenPrefix: credential.tokenPrefix,
        retiredAt: credential.revokedAt,
      };
    }

    // Refuse to leave a paired gateway with no way in. Retiring the last
    // credential would silently break ingestion until someone noticed.
    const remaining = await this.prisma.integrationGatewayCredential.count({
      where: {
        tenantId: input.tenantId,
        gatewayId: input.gatewayId,
        revokedAt: null,
        id: { not: credential.id },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (remaining === 0) {
      throw new ForbiddenException(
        'This is the gateway’s only usable credential. Rotate first, then retire this one.',
      );
    }

    const retiredAt = new Date();
    await this.prisma.integrationGatewayCredential.update({
      where: { id: credential.id },
      data: {
        revokedAt: retiredAt,
        revokedReason: input.reason ?? 'Retired after rotation',
      },
    });

    return {
      credentialId: credential.id,
      tokenPrefix: credential.tokenPrefix,
      retiredAt,
    };
  }

  /** Credential metadata for the admin UI. Never a secret or a hash. */
  async listCredentials(tenantId: string, gatewayId: string) {
    const rows = await this.prisma.integrationGatewayCredential.findMany({
      where: { tenantId, gatewayId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenPrefix: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });

    const now = new Date();
    return rows.map((row) => ({
      ...row,
      status: row.revokedAt
        ? 'REVOKED'
        : row.expiresAt && row.expiresAt <= now
          ? 'EXPIRED'
          : row.expiresAt
            ? 'RETIRING'
            : 'ACTIVE',
    }));
  }
}
