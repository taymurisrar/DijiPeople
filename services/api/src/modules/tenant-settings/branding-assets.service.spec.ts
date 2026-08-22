import { BadRequestException } from '@nestjs/common';
import { DocumentEntityType } from '@prisma/client';
import {
  BrandingAssetsService,
  MAX_BRANDING_ASSET_BYTES,
  type UploadedBrandingFile,
} from './branding-assets.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { DocumentsService } from '../documents/documents.service';
import type { TenantSettingsService } from './tenant-settings.service';

/**
 * REG-218 — BUG-0041 / ITEM-0050.
 *
 * The MIME allowlist and the 3 MB limit used to live in a web route handler, so
 * the API — the authority — enforced neither, and the two-step upload was not
 * atomic: when the settings write failed, the document created by the first
 * step stayed behind for ever, referenced by nothing and findable by nothing.
 *
 * Two invariants: **policy is enforced here**, and **a failed second step
 * leaves no orphan**.
 */
describe('BrandingAssetsService', () => {
  const USER = {
    userId: 'user-1',
    tenantId: 'tenant-1',
  } as unknown as AuthenticatedUser;

  const DOCUMENT_ID = 'doc-1';

  function pngFile(overrides: Partial<UploadedBrandingFile> = {}): UploadedBrandingFile {
    return {
      buffer: Buffer.from('fake-png'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
      ...overrides,
    };
  }

  function build(overrides: {
    upload?: jest.Mock;
    archive?: jest.Mock;
    updateSettings?: jest.Mock;
  } = {}) {
    const upload =
      overrides.upload ??
      jest.fn().mockResolvedValue({
        id: DOCUMENT_ID,
        viewPath: `/api/documents/${DOCUMENT_ID}/view`,
        downloadPath: `/api/documents/${DOCUMENT_ID}/download`,
      });
    const archive = overrides.archive ?? jest.fn().mockResolvedValue(undefined);
    const updateSettings =
      overrides.updateSettings ?? jest.fn().mockResolvedValue({ updated: 2 });

    const documents = { upload, archive } as unknown as DocumentsService;
    const settings = {
      updateTenantSettingsCategory: updateSettings,
    } as unknown as TenantSettingsService;

    return {
      service: new BrandingAssetsService(documents, settings),
      upload,
      archive,
      updateSettings,
    };
  }

  describe('policy', () => {
    it('rejects a setting key that is not a branding asset', async () => {
      const { service, upload } = build();
      await expect(
        service.uploadBrandingAsset(USER, 'primaryColor', pngFile()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload).not.toHaveBeenCalled();
    });

    it('rejects a missing file', async () => {
      const { service, upload } = build();
      await expect(
        service.uploadBrandingAsset(USER, 'logoUrl', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type', async () => {
      const { service, upload } = build();
      await expect(
        service.uploadBrandingAsset(
          USER,
          'logoUrl',
          pngFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload).not.toHaveBeenCalled();
    });

    it('rejects an .ico logo but accepts an .ico favicon', async () => {
      const { service } = build();
      await expect(
        service.uploadBrandingAsset(
          USER,
          'logoUrl',
          pngFile({ mimetype: 'image/x-icon' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.uploadBrandingAsset(
          USER,
          'faviconUrl',
          pngFile({ mimetype: 'image/x-icon' }),
        ),
      ).resolves.toMatchObject({ settingKey: 'faviconUrl' });
    });

    it('rejects a file over the 3 MB limit', async () => {
      const { service, upload } = build();
      await expect(
        service.uploadBrandingAsset(
          USER,
          'logoUrl',
          pngFile({ size: MAX_BRANDING_ASSET_BYTES + 1 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the limit', async () => {
      const { service } = build();
      await expect(
        service.uploadBrandingAsset(
          USER,
          'logoUrl',
          pngFile({ size: MAX_BRANDING_ASSET_BYTES }),
        ),
      ).resolves.toMatchObject({ documentId: DOCUMENT_ID });
    });

    it('compares MIME case-insensitively', async () => {
      const { service } = build();
      await expect(
        service.uploadBrandingAsset(
          USER,
          'logoUrl',
          pngFile({ mimetype: 'IMAGE/PNG' }),
        ),
      ).resolves.toMatchObject({ documentId: DOCUMENT_ID });
    });
  });

  describe('the happy path', () => {
    it('files the document against the tenant, not against a client-supplied id', async () => {
      const { service, upload } = build();
      await service.uploadBrandingAsset(USER, 'logoUrl', pngFile());

      expect(upload).toHaveBeenCalledTimes(1);
      const dto = upload.mock.calls[0][1];
      expect(dto.entityType).toBe(DocumentEntityType.TENANT);
      expect(dto.entityId).toBe(USER.tenantId);
    });

    it('writes both the asset url and the document id that backs it', async () => {
      const { service, updateSettings } = build();
      await service.uploadBrandingAsset(USER, 'logoUrl', pngFile());

      const [, category, dto] = updateSettings.mock.calls[0];
      expect(category).toBe('branding');
      expect(dto.updates).toEqual([
        {
          category: 'branding',
          key: 'logoUrl',
          value: `/api/documents/${DOCUMENT_ID}/view`,
        },
        { category: 'branding', key: 'logoDocumentId', value: DOCUMENT_ID },
      ]);
    });

    it('falls back to the conventional paths when the upload omits them', async () => {
      const { service } = build({
        upload: jest.fn().mockResolvedValue({ id: DOCUMENT_ID }),
      });
      await expect(
        service.uploadBrandingAsset(USER, 'faviconUrl', pngFile()),
      ).resolves.toMatchObject({
        viewPath: `/api/documents/${DOCUMENT_ID}/view`,
        downloadPath: `/api/documents/${DOCUMENT_ID}/download`,
      });
    });

    it('archives nothing when both steps succeed', async () => {
      const { service, archive } = build();
      await service.uploadBrandingAsset(USER, 'logoUrl', pngFile());
      expect(archive).not.toHaveBeenCalled();
    });
  });

  describe('when the settings write fails', () => {
    it('archives the document it created', async () => {
      const { service, archive } = build({
        updateSettings: jest.fn().mockRejectedValue(new Error('settings write failed')),
      });

      await expect(
        service.uploadBrandingAsset(USER, 'logoUrl', pngFile()),
      ).rejects.toThrow('settings write failed');

      expect(archive).toHaveBeenCalledWith(USER, DOCUMENT_ID);
    });

    it('still surfaces the original failure when the compensating archive also fails', async () => {
      // The caller can act on "settings write failed". They can do nothing with
      // "archive failed", which belongs in the log.
      const { service } = build({
        updateSettings: jest.fn().mockRejectedValue(new Error('settings write failed')),
        archive: jest.fn().mockRejectedValue(new Error('archive failed')),
      });

      await expect(
        service.uploadBrandingAsset(USER, 'logoUrl', pngFile()),
      ).rejects.toThrow('settings write failed');
    });
  });
});
