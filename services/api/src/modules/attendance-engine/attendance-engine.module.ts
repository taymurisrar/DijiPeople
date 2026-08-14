import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditModule } from '../audit/audit.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { AttendanceBackfillService } from './attendance-backfill.service';
import { AttendanceDayContextService } from './attendance-day-context.service';
import { AttendanceEngineController } from './attendance-engine.controller';
import { AttendanceEngineService } from './attendance-engine.service';
import { AttendanceGeofenceService } from './attendance-geofence.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';
import { AttendanceReconciliationQueueService } from './attendance-reconciliation-queue.service';
import { AttendanceReconciliationService } from './attendance-reconciliation.service';
import { AttendanceSessionBuilderService } from './attendance-session-builder.service';
import { AttendanceWebAttendanceService } from './attendance-web-attendance.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';
import { PunchInterpreterService } from './punch-interpreter.service';

/**
 * The Attendance Engine.
 *
 * Kept as its own module rather than folded into `attendance`, for the same
 * reason `attendance-integrations` is separate: that module owns the public
 * daily record and the screens built on it, while this one owns the derivation
 * — sessions, reconciliation, exceptions, geofence and work-mode policy. The
 * dependency runs one way, from the engine to the record it projects onto, and
 * keeping the boundary visible is what stops derived calculation leaking back
 * into the record's own CRUD.
 *
 * `forwardRef` on AttendanceModule because the engine reads that module's
 * repository and time helpers, while the attendance service enqueues
 * reconciliation after a self-service punch. The cycle is real and deliberate:
 * the alternative is duplicating the shift and timezone resolution, which would
 * drift.
 */
@Module({
  imports: [
    PrismaModule,
    TenantSettingsModule,
    AuditModule,
    forwardRef(() => AttendanceModule),
  ],
  controllers: [AttendanceEngineController],
  providers: [
    // Pure, no I/O — the pieces the tests exercise directly.
    PunchInterpreterService,
    AttendanceSessionBuilderService,
    AttendanceGeofenceService,
    ImpossibleTravelDetectorService,
    // Context and policy.
    AttendanceDayContextService,
    AttendancePolicyResolverService,
    // Orchestration.
    AttendanceReconciliationService,
    AttendanceReconciliationQueueService,
    AttendanceWebAttendanceService,
    AttendanceEngineService,
    AttendanceBackfillService,
  ],
  exports: [
    AttendanceGeofenceService,
    AttendancePolicyResolverService,
    AttendanceReconciliationService,
    AttendanceReconciliationQueueService,
    AttendanceWebAttendanceService,
    AttendanceEngineService,
    AttendanceBackfillService,
    ImpossibleTravelDetectorService,
  ],
})
export class AttendanceEngineModule {}
