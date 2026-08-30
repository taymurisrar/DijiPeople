import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
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
import { AnalyticsService } from './execution/analytics.service';
import { ReportExecutionService } from './execution/report-execution.service';
import { ReportDefinitionService } from './execution/report-definition.service';
import { ReportFavoriteService } from './execution/favorite.service';
import { SavedViewService } from './execution/saved-view.service';
import { builderFields } from './execution/report-definition.validator';

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
  ) {}

  // ── catalog ──────────────────────────────────────────────────────────────

  @Get('catalog')
  @Permissions(PERMISSION_KEYS.REPORTS_READ)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.catalog(user);
  }

  @Get('builder-fields')
  @Permissions(PERMISSION_KEYS.REPORTS_BUILDER_USE)
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
  @Permissions(PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE)
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
  @Permissions(PERMISSION_KEYS.REPORTS_SAVED_VIEWS_MANAGE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  createSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.savedViews.create(user, dto);
  }

  @Patch('saved-views/:savedViewId')
  @Permissions(PERMISSION_KEYS.REPORTS_SAVED_VIEWS_MANAGE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  updateSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('savedViewId') savedViewId: string,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.savedViews.update(user, savedViewId, dto);
  }

  @Delete('saved-views/:savedViewId')
  @Permissions(PERMISSION_KEYS.REPORTS_SAVED_VIEWS_MANAGE)
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
  @Permissions(PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportDefinitionDto,
  ) {
    return this.definitions.update(user, reportId, dto);
  }

  @Post('reports/:reportId/duplicate')
  @Permissions(PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'create')
  duplicateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.definitions.duplicate(user, reportId);
  }

  @Delete('reports/:reportId')
  @Permissions(PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE)
  @RequirePermission(ENTITY_KEYS.REPORTS, 'write')
  removeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.definitions.remove(user, reportId);
  }
}
