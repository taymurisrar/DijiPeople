import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationPlatform } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RequirePermission } from '../../common/decorators/require-permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppReleaseService } from './app-release.service';
import { UpdateFeedService } from './update-feed.service';

/**
 * The electron-updater feed the desktop agent checks (BUG-0034).
 *
 * WHY IT IS AUTHENTICATED. `electron-updater`'s generic provider resolves the
 * artefact URL *relative to the feed URL*, so the feed and the download share
 * one base path and one auth posture. `app-releases/:id/download` is gated
 * behind `appDownloads.read` deliberately, and serving this pair publicly would
 * have made the agent installer downloadable by anyone — an exposure change to a
 * considered design, not an oversight to correct. So both routes here keep that
 * gate, and the agent supplies its session through `autoUpdater.requestHeaders`.
 *
 * The cost is that an agent which cannot sign in cannot auto-update. That is
 * acceptable rather than ideal: the agent's entire function needs a session, so
 * one that cannot obtain a token is not tracking anything either, and its
 * remedy is a reinstall rather than a background update.
 *
 * Registered as its own controller because the paths are literal and must be
 * matched before `AppReleaseController`'s `:id` route sees them.
 */
@Controller('app-releases/feed')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UpdateFeedController {
  constructor(
    private readonly feed: UpdateFeedService,
    private readonly releases: AppReleaseService,
  ) {}

  /**
   * `GET /api/app-releases/feed/:appKey/latest.yml`
   *
   * The filename is fixed by electron-updater, which appends `/latest.yml` to
   * the configured feed URL. `DIJIPEOPLE_AGENT_UPDATE_URL` therefore points at
   * `/api/app-releases/feed/<appKey>`.
   */
  @Get(':appKey/latest.yml')
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  @Header('Content-Type', 'text/yaml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async latestYml(@Param('appKey') appKey: string): Promise<string> {
    const body = await this.feed.latestYml(
      appKey,
      ApplicationPlatform.WINDOWS,
    );

    if (!body) {
      /*
       * electron-updater reads a 404 as "no update available" rather than an
       * error, which is the correct answer when nothing publishable exists.
       * The difference from before this fix is that the agent now logs the
       * reason, so a permanently empty feed is visible instead of looking like
       * a network blip.
       */
      throw new NotFoundException('No published release is available.');
    }

    return body;
  }

  /**
   * `GET /api/app-releases/feed/:appKey/:fileName`
   *
   * The artefact, at the path electron-updater derives from the feed. It streams
   * through `AppReleaseService` so the same visibility and permission checks
   * apply to the bytes as to the metadata — this is the existing download path
   * reached by filename instead of id, not a second one.
   */
  @Get(':appKey/:fileName')
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  async artifact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appKey') appKey: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const release = await this.feed.findPublishableByFileName(appKey, fileName);

    if (!release) {
      throw new NotFoundException('No published release is available.');
    }

    const result = await this.releases.download(
      AppReleaseService.toViewer(user),
      release.id,
    );

    if (result.kind === 'redirect') {
      response.redirect(302, result.url);
      return undefined;
    }

    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    /*
     * electron-updater verifies against the sha512 from the feed, not this
     * header — it is carried for parity with the existing download route so a
     * human fetching the same URL gets the same evidence.
     */
    if (result.checksumSha256) {
      response.setHeader('X-Checksum-Sha256', result.checksumSha256);
    }
    return result.file;
  }
}
