import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import { GatewayCredentialService } from './gateway-credential.service';

/**
 * Security tests for gateway machine identity.
 *
 * These assert the properties that matter if a code or credential leaks:
 * single use, expiry, revocation, no plaintext at rest, no cross-tenant reach,
 * and that concurrent redemption of one code yields exactly one credential.
 */
describe('GatewayCredentialService', () => {
  const TENANT = 'tenant-a';
  const GATEWAY = 'gateway-1';

  const sha256 = (value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex');

  let prisma: {
    integrationGateway: { findFirst: jest.Mock; update: jest.Mock };
    integrationGatewayPairingCode: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    integrationGatewayCredential: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: GatewayCredentialService;

  beforeEach(() => {
    prisma = {
      integrationGateway: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: GATEWAY, revokedAt: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      integrationGatewayPairingCode: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeHint: 'ABCD',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      integrationGatewayCredential: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'cred-1', tokenPrefix: 'dpgw_abcdefg' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // Runs the callback against the same mocks, so transactional logic is
      // exercised rather than stubbed away.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        typeof callback === 'function' ? callback(prisma) : undefined,
      ),
    };

    service = new GatewayCredentialService(prisma as unknown as PrismaService);
  });

  describe('pairing code issuance', () => {
    it('never persists the plaintext, only its hash', async () => {
      const issued = await service.issuePairingCode({
        tenantId: TENANT,
        gatewayId: GATEWAY,
      });

      const [call] = prisma.integrationGatewayPairingCode.create.mock.calls;
      expect(call[0].data.codeHash).toBe(sha256(issued.plaintext));
      // The plaintext must appear nowhere in what was written.
      expect(JSON.stringify(call[0].data)).not.toContain(issued.plaintext);
    });

    it('stores only a short non-secret hint', async () => {
      const issued = await service.issuePairingCode({
        tenantId: TENANT,
        gatewayId: GATEWAY,
      });

      const [call] = prisma.integrationGatewayPairingCode.create.mock.calls;
      expect(call[0].data.codeHint).toHaveLength(4);
      expect(issued.plaintext.length).toBeGreaterThan(
        call[0].data.codeHint.length,
      );
    });

    it('revokes any outstanding code so only one is ever live', async () => {
      await service.issuePairingCode({ tenantId: TENANT, gatewayId: GATEWAY });

      expect(
        prisma.integrationGatewayPairingCode.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gatewayId: GATEWAY,
            consumedAt: null,
            revokedAt: null,
          }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('generates unguessable, non-repeating codes', async () => {
      const codes = new Set<string>();
      for (let index = 0; index < 25; index += 1) {
        const issued = await service.issuePairingCode({
          tenantId: TENANT,
          gatewayId: GATEWAY,
        });
        codes.add(issued.plaintext);
      }
      expect(codes.size).toBe(25);
    });

    it('refuses to issue for a gateway in another tenant', async () => {
      prisma.integrationGateway.findFirst.mockResolvedValue(null);

      await expect(
        service.issuePairingCode({ tenantId: 'tenant-b', gatewayId: GATEWAY }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to issue for a revoked gateway', async () => {
      prisma.integrationGateway.findFirst.mockResolvedValue({
        id: GATEWAY,
        revokedAt: new Date(),
      });

      await expect(
        service.issuePairingCode({ tenantId: TENANT, gatewayId: GATEWAY }),
      ).rejects.toThrow(/revoked/i);
    });
  });

  describe('pairing code redemption', () => {
    const liveCode = (overrides: Record<string, unknown> = {}) => ({
      id: 'code-1',
      tenantId: TENANT,
      gatewayId: GATEWAY,
      codeHash: sha256('ABCD-EFGH'),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
      attemptCount: 0,
      maxAttempts: 10,
      ...overrides,
    });

    it('issues a credential whose plaintext is never stored', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode(),
      );
      prisma.integrationGatewayPairingCode.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.redeemPairingCode({
        plaintext: 'ABCD-EFGH',
      });

      expect(result.credential.plaintext).toMatch(/^dpgw_/);
      const [call] = prisma.integrationGatewayCredential.create.mock.calls;
      expect(call[0].data.secretHash).toBe(sha256(result.credential.plaintext));
      expect(JSON.stringify(call[0].data)).not.toContain(
        result.credential.plaintext,
      );
    });

    it('derives tenant from the stored code, not from the caller', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode(),
      );
      prisma.integrationGatewayPairingCode.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.redeemPairingCode({
        plaintext: 'ABCD-EFGH',
      });

      expect(result.tenantId).toBe(TENANT);
      const [call] = prisma.integrationGatewayCredential.create.mock.calls;
      expect(call[0].data.tenantId).toBe(TENANT);
    });

    it('rejects an expired code', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.integrationGatewayCredential.create).not.toHaveBeenCalled();
    });

    it('rejects an already-consumed code', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode({ consumedAt: new Date() }),
      );

      await expect(
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.integrationGatewayCredential.create).not.toHaveBeenCalled();
    });

    it('rejects a revoked code', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode({ revokedAt: new Date() }),
      );

      await expect(
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unknown code', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(null);

      await expect(
        service.redeemPairingCode({ plaintext: 'ZZZZ-ZZZZ' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('gives the same message for unknown, expired and consumed codes', async () => {
      const messages: string[] = [];

      for (const state of [
        null,
        liveCode({ expiresAt: new Date(Date.now() - 1) }),
        liveCode({ consumedAt: new Date() }),
      ]) {
        prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(state);
        await service
          .redeemPairingCode({ plaintext: 'ABCD-EFGH' })
          .catch((error: Error) => messages.push(error.message));
      }

      // A different message per case would reveal which codes exist.
      expect(new Set(messages).size).toBe(1);
    });

    it('burns a code after too many failed attempts', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode({ attemptCount: 10, maxAttempts: 10 }),
      );

      await expect(
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.integrationGatewayCredential.create).not.toHaveBeenCalled();
    });

    it('counts a failed attempt', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode({ consumedAt: new Date() }),
      );

      await service
        .redeemPairingCode({ plaintext: 'ABCD-EFGH' })
        .catch(() => undefined);

      expect(prisma.integrationGatewayPairingCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attemptCount: { increment: 1 } }),
        }),
      );
    });

    it('lets only one of two concurrent redemptions succeed', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode(),
      );

      // The atomic claim matches for the first caller and misses for the second,
      // which is exactly what the conditional UPDATE guarantees in Postgres.
      prisma.integrationGatewayPairingCode.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const [first, second] = await Promise.allSettled([
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ]);

      const fulfilled = [first, second].filter(
        (outcome) => outcome.status === 'fulfilled',
      );
      expect(fulfilled).toHaveLength(1);
      expect(prisma.integrationGatewayCredential.create).toHaveBeenCalledTimes(
        1,
      );
    });

    it('refuses to pair a gateway revoked between issue and redemption', async () => {
      prisma.integrationGatewayPairingCode.findFirst.mockResolvedValue(
        liveCode(),
      );
      prisma.integrationGatewayPairingCode.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.integrationGateway.findFirst.mockResolvedValue({
        id: GATEWAY,
        revokedAt: new Date(),
      });

      await expect(
        service.redeemPairingCode({ plaintext: 'ABCD-EFGH' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('credential resolution', () => {
    const storedCredential = (overrides: Record<string, unknown> = {}) => ({
      id: 'cred-1',
      tenantId: TENANT,
      gatewayId: GATEWAY,
      secretHash: sha256('dpgw_secret'),
      revokedAt: null,
      expiresAt: null,
      gateway: { name: 'HQ Gateway', status: 'ONLINE', revokedAt: null },
      ...overrides,
    });

    it('resolves a valid credential to its tenant and gateway', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(
        storedCredential(),
      );

      const identity = await service.resolveCredential('dpgw_secret');

      expect(identity).toEqual(
        expect.objectContaining({ tenantId: TENANT, gatewayId: GATEWAY }),
      );
    });

    it('rejects a revoked credential', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(
        storedCredential({ revokedAt: new Date() }),
      );

      expect(await service.resolveCredential('dpgw_secret')).toBeNull();
    });

    it('rejects a credential whose gateway was revoked', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(
        storedCredential({
          gateway: { name: 'HQ', status: 'REVOKED', revokedAt: new Date() },
        }),
      );

      expect(await service.resolveCredential('dpgw_secret')).toBeNull();
    });

    it('rejects an expired credential', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(
        storedCredential({ expiresAt: new Date(Date.now() - 1000) }),
      );

      expect(await service.resolveCredential('dpgw_secret')).toBeNull();
    });

    it('rejects an unknown credential', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(null);
      expect(await service.resolveCredential('dpgw_nope')).toBeNull();
    });

    it('rejects anything without the credential prefix without hitting the database', async () => {
      expect(await service.resolveCredential('some-user-jwt')).toBeNull();
      expect(await service.resolveCredential('')).toBeNull();
      expect(
        prisma.integrationGatewayCredential.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('looks the credential up by hash, never by plaintext', async () => {
      prisma.integrationGatewayCredential.findUnique.mockResolvedValue(
        storedCredential(),
      );

      await service.resolveCredential('dpgw_secret');

      const [call] = prisma.integrationGatewayCredential.findUnique.mock.calls;
      expect(call[0].where.secretHash).toBe(sha256('dpgw_secret'));
    });
  });

  describe('revocation', () => {
    it('revokes credentials and outstanding pairing codes together', async () => {
      await service.revokeGateway({ tenantId: TENANT, gatewayId: GATEWAY });

      expect(
        prisma.integrationGatewayCredential.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT, revokedAt: null }),
        }),
      );
      // Otherwise a code issued before revocation could re-pair the gateway.
      expect(
        prisma.integrationGatewayPairingCode.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ consumedAt: null }),
        }),
      );
      expect(prisma.integrationGateway.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
    });

    it('refuses to revoke a gateway in another tenant', async () => {
      prisma.integrationGateway.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeGateway({ tenantId: 'tenant-b', gatewayId: GATEWAY }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('rotation', () => {
    it('issues an additional credential without revoking the current one', async () => {
      const rotated = await service.rotateCredential({
        tenantId: TENANT,
        gatewayId: GATEWAY,
      });

      expect(rotated.plaintext).toMatch(/^dpgw_/);
      expect(
        prisma.integrationGatewayCredential.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('refuses rotation for a gateway in another tenant', async () => {
      prisma.integrationGateway.findFirst.mockResolvedValue(null);

      await expect(
        service.rotateCredential({ tenantId: 'tenant-b', gatewayId: GATEWAY }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
