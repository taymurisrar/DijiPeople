import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AttendanceExceptionStatus,
  AttendanceExceptionType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AttendanceEngineService,
  type TeamDayView,
} from './attendance-engine.service';

/**
 * Reconciled attendance: days, sessions, exceptions and the actions on them.
 *
 * Sits under `attendance/` alongside the existing attendance routes rather than
 * at a new top-level path, because to a consumer this is the same subject —
 * "what attendance does this person have" — seen at a different resolution.
 *
 * Tenant always comes from the session. No route accepts a tenantId, and every
 * employee id is re-checked against the caller's scope inside the service.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class DayRangeDto {
  @IsUUID() employeeId!: string;
  @Matches(ISO_DATE, { message: 'from must be formatted YYYY-MM-DD.' })
  from!: string;
  @Matches(ISO_DATE, { message: 'to must be formatted YYYY-MM-DD.' })
  to!: string;
}

class SummaryQueryDto {
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;
}

class ExceptionQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() workSiteId?: string;
  @IsOptional() @IsEnum(AttendanceExceptionType) type?: AttendanceExceptionType;
  @IsOptional()
  @IsEnum(AttendanceExceptionStatus)
  status?: AttendanceExceptionStatus;
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class TeamDayQueryDto {
  @Matches(ISO_DATE) from!: string;
  @Matches(ISO_DATE) to!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional()
  @IsIn([
    'ALL',
    'NEEDS_REVIEW',
    'PENDING_RECONCILIATION',
    'MISSING_PUNCHES',
    'HYBRID',
    'PENDING_CORRECTIONS',
    'LOCKED',
    'LOCKED_WITH_NEW_EVIDENCE',
    'ATTENDANCE_DURING_LEAVE',
    'UNAUTHORIZED_WORK_SITE',
  ])
  view?: TeamDayView;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class ResolveExceptionDto {
  @IsIn(['RESOLVED', 'IGNORED', 'APPROVED', 'REJECTED'])
  status!: 'RESOLVED' | 'IGNORED' | 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class LockDayDto {
  @IsUUID() employeeId!: string;
  @Matches(ISO_DATE) date!: string;
  @IsBoolean() locked!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ReconcileRangeDto {
  @IsUUID() employeeId!: string;
  @Matches(ISO_DATE) from!: string;
  @Matches(ISO_DATE) to!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class ReconcileDayDto {
  @IsUUID() employeeId!: string;
  @Matches(ISO_DATE) date!: string;
}

@Controller('attendance/engine')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceEngineController {
  constructor(private readonly service: AttendanceEngineService) {}

  /**
   * One reconciled day in full.
   *
   * `attendance.read` is the gate; whether this particular employee is visible
   * to this caller is decided in the service, which is the only place that knows
   * about self, reporting line and tenant-wide scope.
   */
  @Get('days/:employeeId/:date')
  @Permissions('attendance.read')
  getDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('date') date: string,
  ) {
    return this.service.getDay(user, employeeId, date);
  }

  @Get('days')
  @Permissions('attendance.read')
  listDays(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DayRangeDto,
  ) {
    return this.service.listDays(user, query);
  }

  /**
   * Counts for the workspace's quick filters, within the caller's own scope.
   */
  @Get('exceptions/summary')
  @Permissions('attendance.read')
  exceptionSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SummaryQueryDto,
  ) {
    return this.service.exceptionSummary(user, query);
  }

  /**
   * The coordinates behind a location-validated decision.
   *
   * `attendance.read` gates the route; the service additionally requires
   * `attendance.locationEvidence.read` for anyone who is not the employee
   * themselves. Managing attendance and knowing where somebody physically stood
   * are different privileges, so holding `attendance.manage` is not enough.
   */
  @Get('location-evidence')
  @Permissions('attendance.read')
  listLocationEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DayRangeDto,
  ) {
    return this.service.listLocationEvidence(user, query);
  }

  @Get('exceptions')
  @Permissions('attendance.read')
  listExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExceptionQueryDto,
  ) {
    return this.service.listExceptions(user, query);
  }

  /**
   * One exception with its attendance, sessions, leave and correction context.
   *
   * Everything a reviewer needs in one call, so deciding whether a day counts
   * does not mean opening three other modules.
   */
  @Get('exceptions/:id')
  @Permissions('attendance.read')
  getException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getExceptionDetail(user, id);
  }

  /** Reconciled days across the caller's team, with the review views. */
  @Get('team-days')
  @Permissions('attendance.read')
  listTeamDays(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TeamDayQueryDto,
  ) {
    return this.service.listTeamDays(user, query);
  }

  @Post('exceptions/:id/resolve')
  @Permissions('attendance.manage')
  resolveException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveExceptionDto,
  ) {
    return this.service.resolveException(user, id, dto);
  }

  /**
   * Locks or reopens a day.
   *
   * Behind `attendance.manage` because locking is what freezes numbers payroll
   * consumes, and reopening is what unfreezes them.
   */
  @Post('days/lock')
  @Permissions('attendance.manage')
  setLock(@CurrentUser() user: AuthenticatedUser, @Body() dto: LockDayDto) {
    return this.service.setDayLock(user, dto);
  }

  /** Queues a range for recalculation. Returns once queued, not once done. */
  @Post('reconcile')
  @Permissions('attendance.manage')
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReconcileRangeDto,
  ) {
    return this.service.requestReconciliation(user, dto);
  }

  /** Reconciles a single day inline, for support and for verification. */
  @Post('reconcile/day')
  @Permissions('attendance.manage')
  reconcileDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReconcileDayDto,
  ) {
    return this.service.reconcileNow(user, dto);
  }
}
