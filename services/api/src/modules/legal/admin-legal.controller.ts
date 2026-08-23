import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppError } from '../../common/errors/app-error';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { LegalService } from './legal.service';

/**
 * Authoring legal documents from Platform Admin.
 *
 * ## Why this controller exists
 *
 * Until now the only way to change a word of the Terms of Service was to edit
 * `prisma/seed-legal.ts` — ten documents held as TypeScript template literals —
 * and ship a deploy. That is the wrong shape twice over: the person holding
 * lawyer-approved copy is rarely the person who can run a deploy, and prose
 * inside source is prose nobody will keep current.
 *
 * The service layer already did all of this (`createDraft`, `updateDraft`,
 * `publish`). Only the door was missing.
 *
 * ## What it deliberately does not allow
 *
 * **A published version cannot be edited.** `updateDraft` refuses anything that
 * is not a DRAFT, and this controller adds no way around it. A published
 * version is the evidence behind every acknowledgement that names it, so
 * editing one retroactively rewrites what people are recorded as having agreed
 * to. A correction is a new draft, published as a new version — which is what
 * `POST :documentId/drafts` is for.
 *
 * **Publication still runs both content gates.** `LegalService.publish` refuses
 * text with unfilled placeholders or text that declares itself an unreviewed
 * draft. That guard exists because ten such documents were once published to
 * production, and nothing here weakens it — `publishBlockers` simply reports
 * the same answer *before* the operator clicks, instead of after.
 */

class UpdateLegalDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  contentMarkdown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

class CreateLegalDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  contentMarkdown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

class PublishLegalVersionDto {
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)
@Controller('super-admin/legal')
export class AdminLegalController {
  constructor(private readonly legal: LegalService) {}

  /** Every document, its draft and its published version. */
  @Get('documents')
  listDocuments() {
    return this.legal.listAllForAdministration();
  }

  /** One version's full text, plus why it cannot be published if it cannot. */
  @Get('versions/:versionId')
  getVersion(@Param('versionId', new ParseUUIDPipe()) versionId: string) {
    return this.legal.getVersionForAdministration(versionId);
  }

  /**
   * Edit a draft's text.
   *
   * Refused for anything already published — see the class comment. The service
   * raises `LEGAL_VERSION_IMMUTABLE`, which the error catalog renders with the
   * reason rather than a bare 400.
   */
  @Patch('versions/:versionId')
  async updateDraft(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: UpdateLegalDraftDto,
  ) {
    await this.legal.updateDraft(versionId, {
      contentMarkdown: dto.contentMarkdown,
      changeSummary: dto.changeSummary,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : undefined,
    });

    // Return the blockers with the save, so the editor can show whether this
    // text is publishable without a second round trip.
    return this.legal.getVersionForAdministration(versionId);
  }

  /**
   * Start a new draft for a document — the way a published document is
   * corrected, since the published one is immutable.
   */
  @Post('documents/:documentId/drafts')
  createDraft(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: CreateLegalDraftDto,
  ) {
    return this.legal.createDraft(
      documentId,
      dto.contentMarkdown,
      dto.changeSummary,
    );
  }

  /**
   * Publish a draft, attributed to the operator who clicked.
   *
   * The attribution is not decoration: `publish` records who published each
   * version, and "who put these terms in force" is the first question asked
   * when a customer disputes them.
   */
  @Post('versions/:versionId/publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: PublishLegalVersionDto,
  ) {
    const platformUserId = user.platform?.id;
    if (!platformUserId) {
      throw new AppError('ACCESS_DENIED', {
        message: 'Only a platform user can publish a legal document.',
      });
    }

    return this.legal.publish(
      versionId,
      platformUserId,
      dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
    );
  }
}
