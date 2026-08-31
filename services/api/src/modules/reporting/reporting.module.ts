import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { ReportingController } from './reporting.controller';
import { ReportQueryExecutor } from './engine/query-executor';
import { ReportScopeResolver } from './engine/scope.resolver';
import { AnalyticsService } from './execution/analytics.service';
import { ReportDefinitionService } from './execution/report-definition.service';
import { ReportExecutionService } from './execution/report-execution.service';
import { ReportFavoriteService } from './execution/favorite.service';
import { SavedViewService } from './execution/saved-view.service';
import { ReportArtifactService } from './export/report-artifact.service';
import { ReportExportService } from './export/report-export.service';
import { ReportExportOrchestrator } from './export/report-export.orchestrator';
import { ReportScheduleService } from './schedule/report-schedule.service';
import { ReportSchedulerWorker } from './schedule/report-scheduler.worker';
import { WorkforceSnapshotService } from './snapshot/workforce-snapshot.service';
import { WorkforceSnapshotWorker } from './snapshot/workforce-snapshot.worker';

/**
 * Reports & Analytics.
 *
 * `ReportsModule` (singular) still exists and still serves the four legacy
 * `/reports/*-summary` paths; it now delegates to this module's engine rather
 * than running its own unscoped queries. The two are deliberately separate so
 * the legacy response shapes stay frozen while this one is free to change.
 *
 * Both workers are registered here but start only when their env flag is set —
 * see ADR-0004. A deploy that omits the flags changes nothing rather than
 * quietly beginning to send email.
 */
@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    // AuthAccessService: the scheduler loads the *owner's* access context at
    // execution time, so a revoked owner fails the run instead of it running
    // with something broader.
    AuthModule,
    NotificationsModule,
    TenantSettingsModule,
  ],
  controllers: [ReportingController],
  providers: [
    ReportScopeResolver,
    ReportQueryExecutor,
    AnalyticsService,
    ReportExecutionService,
    ReportDefinitionService,
    SavedViewService,
    ReportFavoriteService,
    ExcelExportService,
    ReportExportService,
    ReportArtifactService,
    ReportExportOrchestrator,
    ReportScheduleService,
    ReportSchedulerWorker,
    WorkforceSnapshotService,
    WorkforceSnapshotWorker,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [AnalyticsService, ReportExecutionService],
})
export class ReportingModule {}
