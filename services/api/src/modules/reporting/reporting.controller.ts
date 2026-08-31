import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ENTITY_KEYS,
  MISC_PERMISSION_KEYS,
} from '../../common/constants/rbac-matrix';
import { PERMISSION_KEYS } from '../../common/constants/permissions';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AnalyticsQueryDto,
  AnalyticsRecordsDto,
  RunReportDto,
} from './dto/analytics-query.dto';
import {
  CreateReportDefinitionDto,
  CreateSavedViewDto,
  FavoriteDto,
  UpdateReportDefinitionDto,
  UpdateSavedViewDto,
} from './dto/report-definition.dto';
import {
  CreateReportExportDto,
  CreateReportScheduleDto,
  UpdateReportScheduleDto,
} from './dto/schedule.dto';
import { AnalyticsService } from './execution/analytics.service';
import { ReportExecutionService } from './execution/report-execution.service';
import { ReportDefinitionService } from './execution/report-definition.service';
import { ReportFavoriteService } from './execution/favorite.service';
import { SavedViewService } from './execution/saved-view.service';
import { builderFields } from './execution/report-definition.validator';
import { ReportArtifactService } from './export/report-artifact.service';
import { ReportExportOrchestrator } from './export/report-export.orchestrator';
import { ReportScheduleService } from './schedule/report-schedule.service';

/**
 * The Reports & Analytics API.
 *
 * Two authorization layers apply to every handler and they answer different
 * questions. `reports.read` / `ENTITY_KEYS.REPORTS` decide whether the caller
 * may use the reporting workspace at all. Which *rows* come back is decided
 * separately, inside the engine, by the RBAC entity that owns the data —
 * `employees` for workforce, `attendance` for attendance, and so on. That
 * composition is what stops the reporting surface from becoming a way around a
 * scope the rest of the product enforces.
 *
 * Route order is load-bearing: every static path is declared before any
 * parameterised one, or the static route is shadowed and silently dead. This
 * repository has shipped that defect before (BUG-2461) and
 * `route-shadowing.invariant.spec.ts` now fails on it.
 */
@Controller('reporting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportingController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly execution: ReportExecutionService,
    private readonly definitions: ReportDefinitionService,
    private readonly savedViews: SavedViewService,
    private readonly favorites: ReportFavoriteService,
    private readonly exportOrchestrator: ReportExportOrchestrator,
    private readonly artifacts: ReportArtifactService,
    private readonly schedules: ReportScheduleService,
  ) {}

  // ── catalog ──────────────────────────────────────────────────────────────

  @Get('catalog')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.catalog(user);
  }

  @Get('builder-fields')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getBuilderFields(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sourceKey') sourceKey: string,
  ) {
    return builderFields(user, sourceKey);
  }

  // ── analytics ────────────────────────────────────────────────────────────

  @Post('analytics/query')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  runAnalyticsQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyticsQueryDto,
  ) {
    return this.analytics.query(user, dto);
  }

  @Post('analytics/records')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  runAnalyticsRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyticsRecordsDto,
  ) {
    return this.analytics.records(user, dto);
  }

  // ── report library ───────────────────────────────────────────────────────

  @Get('reports')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getLibrary(@CurrentUser() user: AuthenticatedUser) {
    return this.execution.library(user);
  }

  @Post('reports/execute')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  async executeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RunReportDto,
  ) {
    const result = await this.execution.run(user, dto.targetKey, dto);
    if (dto.recordView !== false) {
      // Fire-and-forget: recording that a report was opened must never be able
      // to fail the report itself.
      void this.favorites.touchRecent(user, dto.targetKey);
    }
    return result;
  }

  @Post('reports')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDefinitionDto,
  ) {
    return this.definitions.create(user, dto);
  }

  // ── saved views ──────────────────────────────────────────────────────────

  @Get('saved-views')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listSavedViews(
    @CurrentUser() user: AuthenticatedUser,
    @Query('surfaceKey') surfaceKey: string,
  ) {
    return this.savedViews.list(user, surfaceKey);
  }

  @Post('saved-views')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  createSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.savedViews.create(user, dto);
  }

  @Patch('saved-views/:savedViewId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  updateSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('savedViewId') savedViewId: string,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.savedViews.update(user, savedViewId, dto);
  }

  @Delete('saved-views/:savedViewId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  removeSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('savedViewId') savedViewId: string,
  ) {
    return this.savedViews.remove(user, savedViewId);
  }

  // ── favourites and recents ───────────────────────────────────────────────

  @Get('favorites')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.listFavorites(user);
  }

  @Post('favorites')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  addFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FavoriteDto,
  ) {
    return this.favorites.addFavorite(user, dto.targetKey);
  }

  @Delete('favorites')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  removeFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Query('targetKey') targetKey: string,
  ) {
    return this.favorites.removeFavorite(user, targetKey);
  }

  @Get('recents')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listRecents(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.listRecent(user);
  }

  // ── exports ──────────────────────────────────────────────────────────────

  @Post('exports')
  @Permissions(MISC_PERMISSION_KEYS.REPORTS_EXPORT)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'export')
  createExport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportExportDto,
  ) {
    return this.exportOrchestrator.export(user, dto.targetKey, dto.format, {
      preset: dto.preset,
      from: dto.from,
      to: dto.to,
      filters: dto.filters,
    });
  }

  @Get('exports')
  @Permissions(MISC_PERMISSION_KEYS.REPORTS_EXPORT)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'export')
  listExports(@CurrentUser() user: AuthenticatedUser) {
    return this.artifacts.listRuns(user.tenantId, {
      requestedByUserId: user.userId,
    });
  }

  // ── schedules ────────────────────────────────────────────────────────────

  @Get('schedules')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listSchedules(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.list(user);
  }

  @Post('schedules')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportScheduleDto,
  ) {
    return this.schedules.create(user, dto);
  }

  /**
   * Whether a schedule created here would actually send anybody an email.
   *
   * Declared with the other static `schedules` routes and above every
   * parameterised one, or `schedules/:scheduleId` shadows it and it is silently
   * dead — the route-order invariant in this file's header, and BUG-2461.
   *
   * Gated on `REPORTS_WRITE` to match `createSchedule` rather than on the
   * notification-admin permission that guards
   * `GET /notifications/email-providers`: the person who needs this answer is
   * the person about to create a schedule, and they will not hold the admin
   * key. It exposes one boolean and a provider type name, no configuration and
   * no credentials.
   */
  @Get('schedules/delivery-capability')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getScheduleDeliveryCapability(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.deliveryCapability(user);
  }

  // ── parameterised export and schedule routes ─────────────────────────────

  @Get('exports/:runId')
  @Permissions(MISC_PERMISSION_KEYS.REPORTS_EXPORT)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'export')
  getExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    return this.artifacts.getRun(user.tenantId, runId);
  }

  @Get('exports/:runId/download')
  @Permissions(MISC_PERMISSION_KEYS.REPORTS_EXPORT)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'export')
  async downloadExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const artifact = await this.artifacts.openArtifact(user.tenantId, runId);
    response.setHeader(
      'Content-Type',
      artifact.contentType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      // The filename is built by ReportExportService, which already strips
      // quotes, backslashes, separators and control characters. Stripping again
      // here is cheap and keeps the header safe if that ever changes.
      `attachment; filename="${(artifact.fileName ?? 'report').replace(/["\\\r\n]/g, '')}"`,
    );
    return new StreamableFile(artifact.stream);
  }

  @Patch('schedules/:scheduleId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateReportScheduleDto,
  ) {
    return this.schedules.update(user, scheduleId, dto);
  }

  @Delete('schedules/:scheduleId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  removeSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.schedules.remove(user, scheduleId);
  }

  // ── parameterised report routes (declared last, deliberately) ────────────

  @Get('reports/:reportId')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.definitions.get(user, reportId);
  }

  @Patch('reports/:reportId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportDefinitionDto,
  ) {
    return this.definitions.update(user, reportId, dto);
  }

  @Post('reports/:reportId/duplicate')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  duplicateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.definitions.duplicate(user, reportId);
  }

  @Delete('reports/:reportId')
  @Permissions(PERMISSION_KEYS.REPORTS_WRITE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  removeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.definitions.remove(user, reportId);
  }
}
