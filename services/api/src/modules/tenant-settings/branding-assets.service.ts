import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { DocumentEntityType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UploadDocumentDto } from '../documents/dto/upload-document.dto';
import { DocumentsService } from '../documents/documents.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { TenantSettingsService } from './tenant-settings.service';

/**
 * Uploading a branding asset is two writes — create a document, then point a
 * setting at it — and for a while both the policy and the orchestration lived in
 * `apps/web/app/api/tenant-settings/branding-assets/route.ts`.
 *
 * Two problems with that. The MIME allowlist and the 3 MB limit were a policy
 * the API did not know about, so a caller that reached the API directly was
 * governed by nothing; and the two steps were not atomic, so a failed second
 * step left the document from the first behind for ever, with nothing
 * referencing it and nothing to find it by. BUG-0041 / ITEM-0050.
 *
 * Both halves live here now. The policy is enforced once, on the authority. The
 * orchestration is *compensating* rather than transactional — the two writes
 * cross a storage boundary that a database transaction cannot span — so a
 * failure after the upload archives the document it created before rethrowing.
 */

/** The file this endpoint received, as Multer hands it over. */
export type UploadedBrandingFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const MEGABYTE = 1024 * 1024;

/**
 * 3 MB. Branding assets are logos and favicons displayed at a few hundred
 * pixels; anything larger is a mistake, and this is a smaller limit than the
 * tenant's general document upload allowance deliberately.
 */
export const MAX_BRANDING_ASSET_BYTES = 3 * MEGABYTE;

const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
] as const;

/** Favicons additionally accept the two `.ico` MIME spellings browsers send. */
const FAVICON_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

/**
 * The branding settings that hold an uploaded asset, and the sibling setting
 * that remembers which document backs each one — so a later change can find and
 * retire the previous file instead of orphaning it.
 */
export const BRANDING_ASSET_SETTINGS: Readonly<
  Record<
    string,
    { readonly documentIdKey: string; readonly allowedMimeTypes: readonly string[] }
  >
> = Object.freeze({
  logoUrl: { documentIdKey: 'logoDocumentId', allowedMimeTypes: IMAGE_MIME_TYPES },
  squareLogoUrl: {
    documentIdKey: 'squareLogoDocumentId',
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  faviconUrl: {
    documentIdKey: 'faviconDocumentId',
    allowedMimeTypes: FAVICON_MIME_TYPES,
  },
  emailHeaderLogoUrl: {
    documentIdKey: 'emailHeaderLogoDocumentId',
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  loginBannerImageUrl: {
    documentIdKey: 'loginBannerImageDocumentId',
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
});

export type BrandingAssetUploadResult = {
  documentId: string;
  settingKey: string;
  value: string;
  viewPath: string;
  downloadPath: string;
};

@Injectable()
export class BrandingAssetsService {
  private readonly logger = new Logger(BrandingAssetsService.name);

  constructor(
    // `forwardRef` because DocumentsModule already imports TenantSettingsModule
    // for the document-settings resolver. The cycle is real and deliberate: both
    // modules genuinely need something from the other.
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  async uploadBrandingAsset(
    currentUser: AuthenticatedUser,
    settingKey: string,
    file: UploadedBrandingFile | undefined,
  ): Promise<BrandingAssetUploadResult> {
    const normalizedKey = (settingKey ?? '').trim();
    const policy = BRANDING_ASSET_SETTINGS[normalizedKey];

    if (!policy) {
      throw new BadRequestException(
        'Invalid branding setting key for file upload.',
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('A branding asset file is required.');
    }

    const mimeType = (file.mimetype ?? '').toLowerCase();
    if (!policy.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        normalizedKey === 'faviconUrl'
          ? 'Favicon supports PNG, JPG, WEBP, SVG, and ICO files.'
          : 'Only PNG, JPG, WEBP, or SVG branding files are allowed.',
      );
    }

    if (file.size > MAX_BRANDING_ASSET_BYTES) {
      throw new BadRequestException(
        `Branding asset exceeds the ${MAX_BRANDING_ASSET_BYTES / MEGABYTE} MB upload limit.`,
      );
    }

    const uploadDto = new UploadDocumentDto();
    uploadDto.entityType = DocumentEntityType.TENANT;
    uploadDto.entityId = currentUser.tenantId;
    uploadDto.title = `Branding asset: ${normalizedKey}`;
    uploadDto.description = `Tenant branding asset uploaded for ${normalizedKey}.`;

    const document = await this.documentsService.upload(
      currentUser,
      uploadDto,
      file,
    );

    const documentId = String((document as { id?: unknown })?.id ?? '');
    if (!documentId) {
      throw new BadRequestException(
        'Branding asset upload could not be registered. Please retry.',
      );
    }

    const viewPath =
      String((document as { viewPath?: unknown })?.viewPath ?? '') ||
      `/api/documents/${documentId}/view`;
    const downloadPath =
      String((document as { downloadPath?: unknown })?.downloadPath ?? '') ||
      `/api/documents/${documentId}/download`;

    try {
      const settingsDto = new UpdateTenantSettingsDto();
      settingsDto.updates = [
        { category: 'branding', key: normalizedKey, value: viewPath },
        { category: 'branding', key: policy.documentIdKey, value: documentId },
      ];

      await this.tenantSettingsService.updateTenantSettingsCategory(
        currentUser,
        'branding',
        settingsDto,
      );
    } catch (error) {
      // Compensate. The document exists and nothing now points at it, so it
      // would be invisible in every branding screen and unreachable from the
      // documents list for a tenant that does not know its id. Archiving is a
      // best-effort second call: if it fails too, say so in the log and still
      // surface the original failure, which is the one the caller can act on.
      await this.archiveOrphanedAsset(currentUser, documentId);
      throw error;
    }

    return {
      documentId,
      settingKey: normalizedKey,
      value: viewPath,
      viewPath,
      downloadPath,
    };
  }

  private async archiveOrphanedAsset(
    currentUser: AuthenticatedUser,
    documentId: string,
  ) {
    try {
      await this.documentsService.archive(currentUser, documentId);
    } catch (archiveError) {
      this.logger.error(
        `Branding asset ${documentId} was uploaded but the settings write failed, ` +
          `and the compensating archive failed too. The document is orphaned: ` +
          `${archiveError instanceof Error ? archiveError.message : String(archiveError)}`,
      );
    }
  }
}
