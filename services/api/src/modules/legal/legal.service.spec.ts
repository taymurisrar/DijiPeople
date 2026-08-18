import {
  LegalDocumentType,
  LegalDocumentVersionStatus,
} from '@prisma/client';
import { LegalService } from './legal.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDouble = {
  legalDocument: { findMany: jest.Mock; findFirst: jest.Mock };
  legalDocumentVersion: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  legalDocumentAcknowledgement: { create: jest.Mock };
  $transaction: jest.Mock;
};

function makePrisma(): PrismaDouble {
  const prisma: PrismaDouble = {
    legalDocument: { findMany: jest.fn(), findFirst: jest.fn() },
    legalDocumentVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    legalDocumentAcknowledgement: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  // Run the callback against the same doubles, so a test can assert on what the
  // transaction body did.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma),
  );
  return prisma;
}

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver_1',
    version: 3,
    contentMarkdown: '# Privacy',
    effectiveFrom: new Date('2026-01-01'),
    publishedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('LegalService', () => {
  let prisma: PrismaDouble;
  let service: LegalService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new LegalService(prisma as unknown as PrismaService);
  });

  describe('resolvePublished', () => {
    it('returns null when nothing is published rather than inventing a document', async () => {
      prisma.legalDocument.findMany.mockResolvedValue([
        { id: 'doc_1', slug: 'privacy', type: LegalDocumentType.PRIVACY_POLICY, title: 'Privacy', marketId: null, versions: [] },
      ]);

      await expect(
        service.resolvePublished(LegalDocumentType.PRIVACY_POLICY, null),
      ).resolves.toBeNull();
    });

    it('prefers a market-specific document over the global one', async () => {
      prisma.legalDocument.findMany.mockResolvedValue([
        {
          id: 'doc_global',
          slug: 'privacy',
          type: LegalDocumentType.PRIVACY_POLICY,
          title: 'Privacy',
          marketId: null,
          versions: [versionRow({ id: 'ver_global', version: 9 })],
        },
        {
          id: 'doc_pk',
          slug: 'privacy-pk',
          type: LegalDocumentType.PRIVACY_POLICY,
          title: 'Privacy (PK)',
          marketId: 'market_pk',
          versions: [versionRow({ id: 'ver_pk', version: 1 })],
        },
      ]);

      const resolved = await service.resolvePublished(
        LegalDocumentType.PRIVACY_POLICY,
        'market_pk',
      );

      // The market document wins even though its version number is lower —
      // version numbers are per document and are not comparable across them.
      expect(resolved?.versionId).toBe('ver_pk');
      expect(resolved?.marketId).toBe('market_pk');
    });

    it('falls back to the global document when the market has none', async () => {
      prisma.legalDocument.findMany.mockResolvedValue([
        {
          id: 'doc_global',
          slug: 'privacy',
          type: LegalDocumentType.PRIVACY_POLICY,
          title: 'Privacy',
          marketId: null,
          versions: [versionRow({ id: 'ver_global' })],
        },
      ]);

      const resolved = await service.resolvePublished(
        LegalDocumentType.PRIVACY_POLICY,
        'market_pk',
      );

      expect(resolved?.versionId).toBe('ver_global');
    });

    it('only considers versions inside their effective window', async () => {
      prisma.legalDocument.findMany.mockResolvedValue([]);

      await service.resolvePublished(LegalDocumentType.TERMS_OF_SERVICE, null);

      const where =
        prisma.legalDocument.findMany.mock.calls[0][0].select.versions.where;
      expect(where.status).toBe(LegalDocumentVersionStatus.PUBLISHED);
      expect(where.effectiveFrom).toHaveProperty('lte');
      expect(where.OR).toEqual([
        { effectiveTo: null },
        { effectiveTo: { gt: expect.any(Date) } },
      ]);
    });
  });

  describe('updateDraft', () => {
    it('refuses to edit a published version', async () => {
      prisma.legalDocumentVersion.findUnique.mockResolvedValue({
        id: 'ver_1',
        version: 3,
        status: LegalDocumentVersionStatus.PUBLISHED,
      });

      await expect(
        service.updateDraft('ver_1', { contentMarkdown: 'rewritten' }),
      ).rejects.toMatchObject({ errorCode: 'LEGAL_VERSION_IMMUTABLE' });

      // The whole point: the evidence behind existing acknowledgements is not
      // editable, so no write may reach the database.
      expect(prisma.legalDocumentVersion.update).not.toHaveBeenCalled();
    });

    it('refuses to edit an archived version', async () => {
      prisma.legalDocumentVersion.findUnique.mockResolvedValue({
        id: 'ver_1',
        version: 2,
        status: LegalDocumentVersionStatus.ARCHIVED,
      });

      await expect(
        service.updateDraft('ver_1', { contentMarkdown: 'rewritten' }),
      ).rejects.toMatchObject({ errorCode: 'LEGAL_VERSION_IMMUTABLE' });
    });

    it('allows editing a draft', async () => {
      prisma.legalDocumentVersion.findUnique.mockResolvedValue({
        id: 'ver_1',
        version: 4,
        status: LegalDocumentVersionStatus.DRAFT,
      });

      await service.updateDraft('ver_1', { contentMarkdown: 'new text' });

      expect(prisma.legalDocumentVersion.update).toHaveBeenCalledWith({
        where: { id: 'ver_1' },
        data: { contentMarkdown: 'new text' },
      });
    });
  });

  describe('publish', () => {
    it('archives the version in force and publishes the draft in one transaction', async () => {
      prisma.legalDocumentVersion.findUnique.mockResolvedValue({
        id: 'ver_new',
        version: 4,
        status: LegalDocumentVersionStatus.DRAFT,
        legalDocumentId: 'doc_1',
      });

      await service.publish('ver_new', 'platform_user_1');

      const archive = prisma.legalDocumentVersion.updateMany.mock.calls[0][0];
      expect(archive.where).toMatchObject({
        legalDocumentId: 'doc_1',
        status: LegalDocumentVersionStatus.PUBLISHED,
        effectiveTo: null,
      });
      // Archived, never deleted — acknowledgements point at it.
      expect(archive.data.status).toBe(LegalDocumentVersionStatus.ARCHIVED);

      const publish = prisma.legalDocumentVersion.update.mock.calls[0][0];
      expect(publish.data.status).toBe(LegalDocumentVersionStatus.PUBLISHED);
      expect(publish.data.publishedByPlatformUser).toBe('platform_user_1');
      expect(publish.data.effectiveTo).toBeNull();

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses to publish something that is already published', async () => {
      prisma.legalDocumentVersion.findUnique.mockResolvedValue({
        id: 'ver_1',
        version: 3,
        status: LegalDocumentVersionStatus.PUBLISHED,
        legalDocumentId: 'doc_1',
      });

      await expect(
        service.publish('ver_1', 'platform_user_1'),
      ).rejects.toMatchObject({ errorCode: 'LEGAL_VERSION_NOT_DRAFT' });
    });
  });

  describe('createDraft', () => {
    it('numbers the draft after the highest existing version', async () => {
      prisma.legalDocumentVersion.findFirst.mockResolvedValue({ version: 7 });

      await service.createDraft('doc_1', '# text', 'clarified retention');

      expect(prisma.legalDocumentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 8,
            status: LegalDocumentVersionStatus.DRAFT,
          }),
        }),
      );
    });

    it('starts at version 1 for a document with no versions', async () => {
      prisma.legalDocumentVersion.findFirst.mockResolvedValue(null);

      await service.createDraft('doc_1', '# text');

      expect(prisma.legalDocumentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 1 }),
        }),
      );
    });
  });

  describe('acknowledge', () => {
    it('writes through a caller transaction when one is given', async () => {
      const tx = {
        legalDocumentAcknowledgement: { create: jest.fn().mockResolvedValue({}) },
      };

      await service.acknowledge(
        {
          legalDocumentVersionId: 'ver_1',
          source: 'landing:contact',
          leadId: 'lead_1',
          subjectEmail: 'Person@Example.com',
        },
        tx as never,
      );

      // Must land in the caller's transaction, so a lead and the consent that
      // justified it commit together or not at all.
      expect(tx.legalDocumentAcknowledgement.create).toHaveBeenCalled();
      expect(prisma.legalDocumentAcknowledgement.create).not.toHaveBeenCalled();

      const data = tx.legalDocumentAcknowledgement.create.mock.calls[0][0].data;
      expect(data.subjectEmail).toBe('person@example.com');
    });
  });
});
