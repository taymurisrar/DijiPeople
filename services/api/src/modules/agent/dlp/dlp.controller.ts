import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ENTITY_KEYS } from '../../../common/constants/rbac-matrix';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { DlpService } from './dlp.service';
import {
  ClipboardCaptureBatchDto,
  DlpAlertQueryDto,
  ScreenCaptureBatchDto,
  UpsertDlpRuleDto,
} from '../dto/dlp-capture.dto';

/**
 * DLP capture ingest, tenant rule configuration and investigator review
 * (TASK-0020). Three authorization postures live here on purpose:
 *
 *   - **Ingest** (`clipboard-events`, `screenshot-events`) is called by the
 *     desktop agent and carries the same `attendance.create` posture as the
 *     heartbeat route — the agent session already holds it. The service enforces
 *     the tenant capture flags again on write; owning this permission does not
 *     mean the tenant enabled capture.
 *   - **Rule config** is `agent.settings` — configuring what the agent watches
 *     is an administrator's job.
 *   - **Review** of captured content is the new `dlp.review` permission, held by
 *     no role by default (elevated admins reach it via bypass; a tenant assigns
 *     a dedicated investigations role). Reading content is a different authority
 *     from configuring the agent, and every read is audited in the service.
 *
 * NOTE: screenshot ingest carries base64 image bytes; `main.ts` gives
 * `/agent/dlp/screenshot-events` a 25 MB JSON body limit (TASK-0023), matched to
 * the DTO's per-image cap × batch size, so a legitimate batch is accepted and an
 * oversized body is refused.
 */
@Controller('agent/dlp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DlpController {
  constructor(private readonly dlp: DlpService) {}

  // ------------------------------------------------------- ingest (agent)

  @Post('clipboard-events')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  ingestClipboard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClipboardCaptureBatchDto,
  ) {
    return this.dlp.ingestClipboardEvents(user, dto);
  }

  @Post('screenshot-events')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  ingestScreenshots(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScreenCaptureBatchDto,
  ) {
    return this.dlp.ingestScreenshotEvents(user, dto);
  }

  // --------------------------------------------------- rule config (admin)

  @Get('rules')
  @Permissions('agent.settings.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.dlp.listRules(user);
  }

  @Post('rules')
  @Permissions('agent.settings.manage')
  @RequirePermission(ENTITY_KEYS.AGENT, 'manage')
  upsertRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertDlpRuleDto,
  ) {
    return this.dlp.upsertRule(user, dto);
  }

  @Delete('rules/:id')
  @Permissions('agent.settings.manage')
  @RequirePermission(ENTITY_KEYS.AGENT, 'manage')
  deleteRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dlp.deleteRule(user, id);
  }

  // ---------------------------------------------------- review (dlp.review)

  @Get('alerts')
  @Permissions('dlp.review')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  listAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DlpAlertQueryDto,
  ) {
    return this.dlp.listAlerts(user, query);
  }

  @Get('clipboard-events')
  @Permissions('dlp.review')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  listClipboardCaptures(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DlpAlertQueryDto,
  ) {
    return this.dlp.listClipboardCaptures(user, query);
  }

  @Get('clipboard-events/:id/content')
  @Permissions('dlp.review')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  readClipboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dlp.readClipboardContent(user, id);
  }

  @Get('screenshots/:id')
  @Permissions('dlp.review')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  async readScreenshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { buffer } = await this.dlp.readScreenshot(user, id);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'no-store');
    return buffer;
  }
}
