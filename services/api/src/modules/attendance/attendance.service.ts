import {
  Prisma,
  ApprovalActionType,
  ApprovalAssignmentStatus,
  ApprovalRequestStatus,
  AttendanceCorrectionStatus,
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceImportBatchStatus,
  AttendanceMode,
  GenericApprovalStepStatus,
  LeaveRequestStatus,
  NotificationRecipientResolverType,
  SecurityAccessLevel,
  SecurityPrivilege,
  SlaStatus,
  SlaTargetType,
  WorkWeekday,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  ROLE_KEYS,
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import { hasElevatedTenantRole } from '../../common/security/elevated-tenant-roles';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { ConfigurationResolverService } from '../tenant-settings/configuration-resolver.service';
import {
  AttendanceEntryWithRelations,
  AttendanceRepository,
} from './attendance.repository';
import { AttendanceCorrectionActionDto } from './dto/attendance-correction-action.dto';
import { AttendanceCorrectionQueryDto } from './dto/attendance-correction-query.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateAttendanceCorrectionRequestDto } from './dto/create-attendance-correction-request.dto';
import { CreateAttendanceIntegrationDto } from './dto/create-attendance-integration.dto';
import { CreateManualAttendanceEntryDto } from './dto/create-manual-attendance-entry.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { OverrideAttendanceEntryDto } from './dto/override-attendance-entry.dto';
import { UpdateAttendanceIntegrationDto } from './dto/update-attendance-integration.dto';
import { UpdateAttendancePolicyDto } from './dto/update-attendance-policy.dto';
import { UpdateManualAttendanceEntryDto } from './dto/update-manual-attendance-entry.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type AttendancePolicyShape = {
  lateCheckInGraceMinutes: number;
  lateCheckOutGraceMinutes: number;
  requireOfficeLocationForOfficeMode: boolean;
  requireRemoteLocationForRemoteMode: boolean;
  allowRemoteWithoutLocation: boolean;
  allowManualAdjustments: boolean;
  preventDuplicateAttendance: boolean;
  allowCheckInOnApprovedLeave: boolean;
  markMissingCheckout: boolean;
  allowOffDayCheckIn: boolean;
  allowHolidayCheckIn: boolean;
  allowHrAdminOverride: boolean;
  allowedModes: AttendanceMode[];
};

const ATTENDANCE_IMPORT_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
];

const attendanceCorrectionInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      userId: true,
      manager: { select: { id: true, userId: true } },
    },
  },
  requestedByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  actionedByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  attendanceEntry: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          userId: true,
          managerEmployeeId: true,
          departmentId: true,
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, level: true } },
          manager: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              userId: true,
            },
          },
        },
      },
      workSchedule: true,
      officeLocation: true,
      importedBatch: true,
    },
  },
} satisfies Prisma.AttendanceCorrectionRequestInclude;

type AttendanceCorrectionWithRelations =
  Prisma.AttendanceCorrectionRequestGetPayload<{
    include: typeof attendanceCorrectionInclude;
  }>;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly configurationResolverService: ConfigurationResolverService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async checkIn(currentUser: AuthenticatedUser, dto: CheckInDto) {
    const employee = await this.getCurrentEmployee(currentUser);
    const now = new Date();
    const context = await this.resolveSelfServiceContext(
      currentUser,
      employee.id,
      now,
    );
    const [existingToday, policy, approvedLeave] = await Promise.all([
      this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
        currentUser.tenantId,
        employee.id,
        context.attendanceDate,
      ),
      this.resolvePolicy(currentUser.tenantId),
      this.findApprovedLeave(
        currentUser.tenantId,
        employee.id,
        context.attendanceDate,
      ),
    ]);

    if (existingToday && policy.preventDuplicateAttendance) {
      throw new ConflictException('Already checked in today.');
    }
    if (approvedLeave && !policy.allowCheckInOnApprovedLeave) {
      throw new ConflictException(
        'Check in is unavailable because you have approved leave today.',
      );
    }
    if (context.configurationError) {
      throw new BadRequestException(context.configurationError);
    }
    if (context.isOffDay && !policy.allowOffDayCheckIn) {
      throw new ConflictException(
        `Check in is unavailable because ${formatBusinessDateKey(context.attendanceDate)} is a scheduled off day.`,
      );
    }
    if (context.holiday && !policy.allowHolidayCheckIn) {
      throw new ConflictException(
        `Check in is unavailable because today is ${context.holiday.name}.`,
      );
    }
    if (!context.shift) {
      throw new BadRequestException(
        'The resolved work schedule does not provide a shift for today.',
      );
    }

    const attendanceMode = dto.attendanceMode;
    const officeLocation = await this.validateModeAndLocation(
      currentUser.tenantId,
      attendanceMode,
      policy,
      dto.officeLocationId,
      dto.remoteLatitude,
      dto.remoteLongitude,
      true,
    );

    const capturedAt = parseLocationCapturedAt(dto.locationCapturedAt, now);
    const lateCheckIn = resolveLateCheckIn(
      context.workSchedule,
      policy,
      now,
      context.shift,
    );
    let entry: AttendanceEntryWithRelations;
    try {
      entry = await this.attendanceRepository.createAttendanceEntry({
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        workScheduleId: context.workSchedule?.id,
        shiftTemplateId: context.shift.id,
        officeLocationId: officeLocation?.id,
        date: context.attendanceDate,
        checkIn: now,
        attendanceMode,
        status: AttendanceEntryStatus.CHECKED_IN,
        source: AttendanceEntrySource.WEB,
        checkInSource: AttendanceEntrySource.WEB,
        checkInNote: normalizeOptionalText(dto.note),
        workSummary: normalizeOptionalText(dto.workSummary),
        notes: mergeNotes(undefined, dto.note),
        remoteLatitude: dto.remoteLatitude,
        remoteLongitude: dto.remoteLongitude,
        checkInLatitude: dto.remoteLatitude,
        checkInLongitude: dto.remoteLongitude,
        checkInLocationAccuracy: dto.locationAccuracy,
        checkInLocationCapturedAt:
          attendanceMode === AttendanceMode.OFFICE ? undefined : capturedAt,
        remoteAddressText: normalizeOptionalText(dto.remoteAddressText),
        isLateCheckIn: lateCheckIn.isLate,
        lateCheckInMinutes: lateCheckIn.minutesLate,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      if (isAttendanceCreateConflict(error)) {
        throw new ConflictException('Already checked in today.');
      }

      throw error;
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.checked_in',
      entityType: 'AttendanceEntry',
      entityId: entry.id,
      afterSnapshot: {
        attendanceMode: entry.attendanceMode,
        employeeId: entry.employeeId,
        officeLocationId: entry.officeLocationId,
        status: entry.status,
      },
    });

    if (entry.isLateCheckIn || entry.status === AttendanceEntryStatus.LATE) {
      await this.emitAttendanceExceptionNotification(
        currentUser,
        entry,
        'late_check_in',
      );
    }

    return this.mapAttendanceEntry(entry, currentUser);
  }

  async checkOut(currentUser: AuthenticatedUser, dto: CheckOutDto) {
    const employee = await this.getCurrentEmployee(currentUser);
    const now = new Date();
    const context = await this.resolveSelfServiceContext(
      currentUser,
      employee.id,
      now,
    );
    const existing =
      await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
        currentUser.tenantId,
        employee.id,
        context.attendanceDate,
      );

    if (!existing) {
      throw new BadRequestException('Check out requires a check in today.');
    }
    if (!existing.checkIn) {
      throw new BadRequestException('Check out requires a check in today.');
    }
    if (existing.checkOut) {
      throw new ConflictException('Already checked out.');
    }

    if (now < existing.checkIn) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    const policy = await this.resolvePolicy(currentUser.tenantId);
    await this.validateModeAndLocation(
      currentUser.tenantId,
      existing.attendanceMode,
      policy,
      existing.officeLocationId ?? undefined,
      dto.remoteLatitude,
      dto.remoteLongitude,
      true,
    );

    const capturedAt = parseLocationCapturedAt(dto.locationCapturedAt, now);
    const lateCheckOut = resolveLateCheckOut(
      context.workSchedule,
      policy,
      now,
      context.shift,
    );
    const updated = await this.attendanceRepository.updateAttendanceEntry(
      currentUser.tenantId,
      existing.id,
      {
        checkOut: now,
        checkOutNote: normalizeOptionalText(dto.note),
        workSummary:
          normalizeOptionalText(dto.workSummary) ?? existing.workSummary,
        notes: mergeNotes(existing.notes, dto.note),
        checkOutSource: AttendanceEntrySource.WEB,
        checkOutLatitude: dto.remoteLatitude,
        checkOutLongitude: dto.remoteLongitude,
        checkOutLocationAccuracy: dto.locationAccuracy,
        checkOutLocationCapturedAt:
          existing.attendanceMode === AttendanceMode.OFFICE
            ? undefined
            : capturedAt,
        remoteAddressText:
          normalizeOptionalText(dto.remoteAddressText) ??
          existing.remoteAddressText,
        isLateCheckOut: lateCheckOut.isLate,
        lateCheckOutMinutes: lateCheckOut.minutesLate,
        status: AttendanceEntryStatus.CHECKED_OUT,
        updatedById: currentUser.userId,
      },
    );

    if (!updated) {
      throw new NotFoundException('Attendance entry could not be reloaded.');
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.checked_out',
      entityType: 'AttendanceEntry',
      entityId: updated.id,
      afterSnapshot: {
        checkOut: updated.checkOut,
        isLateCheckOut: updated.isLateCheckOut,
        lateCheckOutMinutes: updated.lateCheckOutMinutes,
        workSummary: updated.workSummary,
      },
    });

    return this.mapAttendanceEntry(updated, currentUser);
  }

  async listMyAttendance(
    currentUser: AuthenticatedUser,
    query: AttendanceQueryDto,
  ) {
    const employee = await this.getCurrentEmployee(currentUser);
    const result = await this.attendanceRepository.findAttendancePage(
      currentUser.tenantId,
      query,
      { employeeId: employee.id },
    );
    const summaryItems =
      await this.attendanceRepository.findAttendanceForSummary(
        currentUser.tenantId,
        { ...query, page: 1, pageSize: 5000 },
        { employeeId: employee.id },
      );

    return this.mapAttendanceList(result.items, result.total, query, {
      scope: 'mine',
      employeeId: employee.id,
      summaryItems,
      summaryView: query.view ?? 'week',
      summaryAnchorDate: query.dateFrom ?? currentDateKey(),
    });
  }

  async getMyActiveAttendance(currentUser: AuthenticatedUser) {
    const employee = await this.getCurrentEmployee(currentUser);
    const entry = await this.attendanceRepository.findOpenAttendanceEntry(
      currentUser.tenantId,
      employee.id,
    );

    return entry ? this.mapAttendanceEntry(entry, currentUser) : null;
  }

  async getAttendanceEntry(currentUser: AuthenticatedUser, entryId: string) {
    const entry = await this.getAuthorizedAttendanceEntry(
      currentUser,
      entryId,
      false,
    );

    return this.mapAttendanceEntry(entry, currentUser);
  }

  async listCorrectionRequests(
    currentUser: AuthenticatedUser,
    query: AttendanceCorrectionQueryDto,
  ) {
    this.assertCanReadCorrections(currentUser);
    const where = await this.buildCorrectionWhere(currentUser, query);
    const [items, total] = await Promise.all([
      this.prisma.attendanceCorrectionRequest.findMany({
        where,
        include: attendanceCorrectionInclude,
        orderBy: [{ createdAtUtc: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.attendanceCorrectionRequest.count({ where }),
    ]);

    return {
      items: await Promise.all(
        items.map((item) => this.mapCorrectionRequest(currentUser, item)),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getCorrectionRequest(currentUser: AuthenticatedUser, id: string) {
    const request = await this.findCorrectionRequestForUser(currentUser, id);
    return {
      item: await this.mapCorrectionRequest(currentUser, request, true),
    };
  }

  async createCorrectionRequest(
    currentUser: AuthenticatedUser,
    dto: CreateAttendanceCorrectionRequestDto,
  ) {
    if (!currentUser.permissionKeys.includes('attendance.correction.create')) {
      throw new ForbiddenException(
        'You do not have permission to request attendance corrections.',
      );
    }

    const employee = await this.getCurrentEmployee(currentUser);
    const attendanceEntry = dto.attendanceEntryId
      ? await this.getAuthorizedAttendanceEntry(
          currentUser,
          dto.attendanceEntryId,
          false,
        )
      : null;

    if (attendanceEntry && attendanceEntry.employeeId !== employee.id) {
      throw new ForbiddenException(
        'You can only request corrections for your own attendance records.',
      );
    }

    const requestedCheckInAtUtc = dto.requestedCheckInAtUtc
      ? new Date(dto.requestedCheckInAtUtc)
      : null;
    const requestedCheckOutAtUtc = dto.requestedCheckOutAtUtc
      ? new Date(dto.requestedCheckOutAtUtc)
      : null;

    if (!requestedCheckInAtUtc && !requestedCheckOutAtUtc) {
      throw new BadRequestException(
        'A requested check-in or check-out timestamp is required.',
      );
    }

    if (
      requestedCheckInAtUtc &&
      requestedCheckOutAtUtc &&
      requestedCheckOutAtUtc < requestedCheckInAtUtc
    ) {
      throw new BadRequestException(
        'Requested check-out cannot be earlier than requested check-in.',
      );
    }

    const now = new Date();
    const request = await this.prisma.attendanceCorrectionRequest.create({
      data: {
        tenantId: currentUser.tenantId,
        attendanceEntryId: attendanceEntry?.id ?? null,
        employeeId: employee.id,
        requestedByUserId: currentUser.userId,
        requestNumber: await this.nextCorrectionRequestNumber(
          currentUser.tenantId,
        ),
        correctionType: dto.correctionType,
        originalCheckInAtUtc: attendanceEntry?.checkIn ?? null,
        originalCheckOutAtUtc: attendanceEntry?.checkOut ?? null,
        requestedCheckInAtUtc,
        requestedCheckOutAtUtc,
        reason: dto.reason.trim(),
        status: AttendanceCorrectionStatus.PENDING_APPROVAL,
        submittedAtUtc: now,
      },
      include: attendanceCorrectionInclude,
    });

    await this.syncGenericAttendanceCorrectionApproval(
      request,
      currentUser,
      ApprovalActionType.SUBMITTED,
    );
    await this.emitAttendanceCorrectionSubmitted(request, currentUser);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.correction.submitted',
      entityType: 'AttendanceCorrectionRequest',
      entityId: request.id,
      afterSnapshot: {
        requestNumber: request.requestNumber,
        correctionType: request.correctionType,
        attendanceEntryId: request.attendanceEntryId,
      },
    });

    return {
      item: await this.mapCorrectionRequest(currentUser, request, true),
    };
  }

  async approveCorrectionRequest(
    currentUser: AuthenticatedUser,
    id: string,
    dto: AttendanceCorrectionActionDto,
  ) {
    return this.actionCorrectionRequest(currentUser, id, 'approve', dto);
  }

  async rejectCorrectionRequest(
    currentUser: AuthenticatedUser,
    id: string,
    dto: AttendanceCorrectionActionDto,
  ) {
    return this.actionCorrectionRequest(currentUser, id, 'reject', dto);
  }

  async listTeamAttendance(
    currentUser: AuthenticatedUser,
    query: AttendanceQueryDto,
  ) {
    const canManageAll = this.canReadAttendanceBeyondTeam(currentUser);
    const scope = query.scope ?? 'all';
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser, query)
      : scope === 'team'
        ? await this.resolveDirectReportEmployeeIds(currentUser, query)
        : await this.resolveReportingHierarchyEmployeeIds(currentUser, query);

    if (employeeIds.length === 0) {
      if (!canManageAll && !this.hasManagerRole(currentUser)) {
        throw new ForbiddenException(
          'You do not have permission to view team attendance.',
        );
      }

      return this.mapAttendanceList([], 0, query, {
        scope: canManageAll ? 'tenant' : scope === 'team' ? 'team' : 'tenant',
        employeeId: query.employeeId ?? null,
        summaryItems: [],
        summaryView: query.view ?? 'week',
        summaryAnchorDate: query.dateFrom ?? currentDateKey(),
      });
    }

    const result = await this.attendanceRepository.findAttendancePage(
      currentUser.tenantId,
      query,
      { employeeId: { in: employeeIds } },
    );
    const summaryItems =
      await this.attendanceRepository.findAttendanceForSummary(
        currentUser.tenantId,
        { ...query, page: 1, pageSize: 5000 },
        { employeeId: { in: employeeIds } },
      );

    return this.mapAttendanceList(result.items, result.total, query, {
      scope: canManageAll ? 'tenant' : scope === 'team' ? 'team' : 'tenant',
      employeeId: query.employeeId ?? null,
      summaryItems,
      summaryView: query.view ?? 'week',
      summaryAnchorDate: query.dateFrom ?? currentDateKey(),
    });
  }

  async getMyAttendanceSummary(
    currentUser: AuthenticatedUser,
    query: AttendanceSummaryQueryDto,
  ) {
    const employee = await this.getCurrentEmployee(currentUser);
    const rangeQuery = summaryQueryToAttendanceQuery(query);
    const items = await this.attendanceRepository.findAttendanceForSummary(
      currentUser.tenantId,
      rangeQuery,
      { employeeId: employee.id },
    );

    return buildSummaryResponse(
      items,
      query.view,
      query.date ?? currentDateKey(),
      {
        scope: 'mine',
      },
    );
  }

  async getTeamAttendanceSummary(
    currentUser: AuthenticatedUser,
    query: AttendanceSummaryQueryDto,
  ) {
    const canManageAll = this.canReadAttendanceBeyondTeam(currentUser);
    const scope = query.scope ?? 'all';
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser, {})
      : scope === 'team'
        ? await this.resolveDirectReportEmployeeIds(currentUser, {})
        : await this.resolveReportingHierarchyEmployeeIds(currentUser, {});

    if (employeeIds.length === 0) {
      if (!canManageAll && !this.hasManagerRole(currentUser)) {
        throw new ForbiddenException(
          'You do not have permission to view team attendance.',
        );
      }

      return buildSummaryResponse(
        [],
        query.view,
        query.date ?? currentDateKey(),
        {
          scope: canManageAll ? 'tenant' : scope === 'team' ? 'team' : 'tenant',
        },
      );
    }

    const rangeQuery = summaryQueryToAttendanceQuery(query);
    const items = await this.attendanceRepository.findAttendanceForSummary(
      currentUser.tenantId,
      rangeQuery,
      { employeeId: { in: employeeIds } },
    );

    return buildSummaryResponse(
      items,
      query.view,
      query.date ?? currentDateKey(),
      {
        scope: canManageAll ? 'tenant' : scope === 'team' ? 'team' : 'tenant',
      },
    );
  }

  async createManualEntry(
    currentUser: AuthenticatedUser,
    dto: CreateManualAttendanceEntryDto,
  ) {
    const policy = await this.resolvePolicy(currentUser.tenantId);
    if (!policy.allowManualAdjustments) {
      throw new ForbiddenException(
        'Manual attendance adjustments are disabled in tenant attendance settings.',
      );
    }

    const employee =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        currentUser.tenantId,
        dto.employeeId,
      );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }

    const resolvedContext = await this.resolveSelfServiceContext(
      currentUser,
      dto.employeeId,
      parseBusinessDateInput(dto.date),
    );
    const attendanceDate = resolvedContext.attendanceDate;
    const existing =
      await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
        currentUser.tenantId,
        dto.employeeId,
        attendanceDate,
      );

    if (existing) {
      throw new ConflictException(
        'An attendance entry already exists for this employee on this date.',
      );
    }
    const [officeLocation, shift] = await Promise.all([
      this.validateModeAndLocation(
        currentUser.tenantId,
        dto.attendanceMode,
        policy,
        dto.officeLocationId,
        dto.remoteLatitude,
        dto.remoteLongitude,
      ),
      dto.shiftTemplateId
        ? this.attendanceRepository.findShiftTemplateById(
            currentUser.tenantId,
            dto.shiftTemplateId,
          )
        : Promise.resolve(resolvedContext.shift),
    ]);
    if (!shift) {
      throw new BadRequestException(
        'Selected shift is not active for this tenant.',
      );
    }

    const checkIn = dto.checkInTime
      ? combineDateAndTimeInTimezone(
          attendanceDate,
          dto.checkInTime,
          resolvedContext.timezone,
        )
      : undefined;
    const checkOut = dto.checkOutTime
      ? combineDateAndTimeInTimezone(
          attendanceDate,
          dto.checkOutTime,
          resolvedContext.timezone,
        )
      : undefined;

    if (checkOut && !checkIn) {
      throw new BadRequestException(
        'Check-in time is required when check-out time is provided.',
      );
    }

    if (checkIn && checkOut && checkOut < checkIn) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    const lateCheckIn = checkIn
      ? resolveLateCheckIn(resolvedContext.workSchedule, policy, checkIn, shift)
      : { isLate: false, minutesLate: null };
    const lateCheckOut = checkOut
      ? resolveLateCheckOut(
          resolvedContext.workSchedule,
          policy,
          checkOut,
          shift,
        )
      : { isLate: false, minutesLate: null };

    const entry = await this.attendanceRepository.createAttendanceEntry({
      tenantId: currentUser.tenantId,
      employeeId: dto.employeeId,
      workScheduleId: resolvedContext.workSchedule?.id,
      shiftTemplateId: shift.id,
      officeLocationId: officeLocation?.id,
      date: attendanceDate,
      checkIn,
      checkOut,
      attendanceMode: dto.attendanceMode,
      status:
        dto.status ??
        deriveManualStatus(
          checkIn,
          checkOut,
          lateCheckIn.isLate,
          dto.attendanceMode,
        ),
      source: dto.source ?? AttendanceEntrySource.MANUAL,
      checkInNote: normalizeOptionalText(dto.checkInNote),
      checkOutNote: normalizeOptionalText(dto.checkOutNote),
      workSummary: normalizeOptionalText(dto.workSummary),
      notes: dto.adjustmentReason.trim(),
      remoteLatitude: dto.remoteLatitude,
      remoteLongitude: dto.remoteLongitude,
      remoteAddressText: normalizeOptionalText(dto.remoteAddressText),
      isLateCheckIn: lateCheckIn.isLate,
      isLateCheckOut: lateCheckOut.isLate,
      lateCheckInMinutes: lateCheckIn.minutesLate,
      lateCheckOutMinutes: lateCheckOut.minutesLate,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.manual_created',
      entityType: 'AttendanceEntry',
      entityId: entry.id,
      afterSnapshot: {
        adjustmentReason: dto.adjustmentReason,
        attendanceMode: entry.attendanceMode,
        employeeId: entry.employeeId,
        source: entry.source,
        status: entry.status,
      },
    });

    await this.emitAttendanceExceptionNotificationForStatus(currentUser, entry);

    return this.mapAttendanceEntry(entry, currentUser);
  }

  async updateManualEntry(
    currentUser: AuthenticatedUser,
    entryId: string,
    dto: UpdateManualAttendanceEntryDto,
  ) {
    const policy = await this.resolvePolicy(currentUser.tenantId);
    if (!policy.allowManualAdjustments) {
      throw new ForbiddenException(
        'Manual attendance adjustments are disabled in tenant attendance settings.',
      );
    }

    const existing = await this.attendanceRepository.findAttendanceEntryById(
      currentUser.tenantId,
      entryId,
    );

    if (!existing) {
      throw new NotFoundException('Attendance entry could not be found.');
    }

    const targetEmployeeId = dto.employeeId ?? existing.employeeId;
    const employee =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        currentUser.tenantId,
        targetEmployeeId,
      );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }

    const resolvedContext = await this.resolveSelfServiceContext(
      currentUser,
      targetEmployeeId,
      dto.date ? parseBusinessDateInput(dto.date) : existing.date,
    );
    const attendanceDate = dto.date
      ? resolvedContext.attendanceDate
      : existing.date;

    if (
      targetEmployeeId !== existing.employeeId ||
      attendanceDate.getTime() !== existing.date.getTime()
    ) {
      const duplicate =
        await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
          currentUser.tenantId,
          targetEmployeeId,
          attendanceDate,
        );

      if (duplicate && duplicate.id !== existing.id) {
        throw new ConflictException(
          'Another attendance entry already exists for this employee on that date.',
        );
      }
    }

    const [officeLocation, shift] = await Promise.all([
      this.validateModeAndLocation(
        currentUser.tenantId,
        dto.attendanceMode ?? existing.attendanceMode,
        policy,
        dto.officeLocationId ?? existing.officeLocationId ?? undefined,
        dto.remoteLatitude ?? existing.remoteLatitude ?? undefined,
        dto.remoteLongitude ?? existing.remoteLongitude ?? undefined,
      ),
      dto.shiftTemplateId
        ? this.attendanceRepository.findShiftTemplateById(
            currentUser.tenantId,
            dto.shiftTemplateId,
          )
        : Promise.resolve(existing.shiftTemplate ?? resolvedContext.shift),
    ]);
    if (!shift) {
      throw new BadRequestException(
        'Selected shift is not active for this tenant.',
      );
    }

    const checkIn = dto.checkInTime
      ? combineDateAndTimeInTimezone(
          attendanceDate,
          dto.checkInTime,
          resolvedContext.timezone,
        )
      : dto.checkInTime === undefined
        ? (existing.checkIn ?? undefined)
        : undefined;
    const checkOut = dto.checkOutTime
      ? combineDateAndTimeInTimezone(
          attendanceDate,
          dto.checkOutTime,
          resolvedContext.timezone,
        )
      : dto.checkOutTime === undefined
        ? (existing.checkOut ?? undefined)
        : undefined;

    if (checkOut && !checkIn) {
      throw new BadRequestException(
        'Check-in time is required when check-out time is provided.',
      );
    }

    if (checkIn && checkOut && checkOut < checkIn) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    const lateCheckIn = checkIn
      ? resolveLateCheckIn(resolvedContext.workSchedule, policy, checkIn, shift)
      : { isLate: false, minutesLate: null };
    const lateCheckOut = checkOut
      ? resolveLateCheckOut(
          resolvedContext.workSchedule,
          policy,
          checkOut,
          shift,
        )
      : { isLate: false, minutesLate: null };

    const updated = await this.attendanceRepository.updateAttendanceEntry(
      currentUser.tenantId,
      existing.id,
      {
        employeeId: targetEmployeeId,
        date: attendanceDate,
        checkIn,
        checkOut,
        workScheduleId: resolvedContext.workSchedule?.id,
        shiftTemplateId: shift.id,
        officeLocationId: officeLocation?.id ?? null,
        attendanceMode: dto.attendanceMode ?? existing.attendanceMode,
        status:
          dto.status ??
          deriveManualStatus(
            checkIn,
            checkOut,
            lateCheckIn.isLate,
            dto.attendanceMode ?? existing.attendanceMode,
          ),
        source: dto.source ?? existing.source,
        checkInNote:
          normalizeOptionalText(dto.checkInNote) ?? existing.checkInNote,
        checkOutNote:
          normalizeOptionalText(dto.checkOutNote) ?? existing.checkOutNote,
        workSummary:
          normalizeOptionalText(dto.workSummary) ?? existing.workSummary,
        remoteLatitude: dto.remoteLatitude ?? existing.remoteLatitude,
        remoteLongitude: dto.remoteLongitude ?? existing.remoteLongitude,
        remoteAddressText:
          normalizeOptionalText(dto.remoteAddressText) ??
          existing.remoteAddressText,
        isLateCheckIn: lateCheckIn.isLate,
        isLateCheckOut: lateCheckOut.isLate,
        lateCheckInMinutes: lateCheckIn.minutesLate,
        lateCheckOutMinutes: lateCheckOut.minutesLate,
        notes: dto.adjustmentReason
          ? mergeNotes(existing.notes, dto.adjustmentReason)
          : existing.notes,
        updatedById: currentUser.userId,
      },
    );

    if (!updated) {
      throw new NotFoundException('Attendance entry could not be updated.');
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.manual_updated',
      entityType: 'AttendanceEntry',
      entityId: updated.id,
      beforeSnapshot: {
        attendanceMode: existing.attendanceMode,
        employeeId: existing.employeeId,
        status: existing.status,
      },
      afterSnapshot: {
        attendanceMode: updated.attendanceMode,
        employeeId: updated.employeeId,
        status: updated.status,
      },
    });

    await this.emitAttendanceCorrectionStatusNotification(currentUser, updated);
    await this.emitAttendanceExceptionNotificationForStatus(
      currentUser,
      updated,
    );

    return this.mapAttendanceEntry(updated, currentUser);
  }

  async overrideAttendanceEntry(
    currentUser: AuthenticatedUser,
    entryId: string,
    dto: OverrideAttendanceEntryDto,
  ) {
    if (!this.canOverrideAttendance(currentUser)) {
      throw new ForbiddenException(
        'You do not have permission to override attendance records.',
      );
    }

    if (!normalizeOptionalText(dto.adjustmentReason)) {
      throw new BadRequestException(
        'Override reason is required when changing attendance records.',
      );
    }

    await this.getAuthorizedAttendanceEntry(currentUser, entryId, true);

    return this.updateManualEntry(currentUser, entryId, {
      ...dto,
      adjustmentReason: `Override: ${dto.adjustmentReason}`,
    });
  }

  private async actionCorrectionRequest(
    currentUser: AuthenticatedUser,
    id: string,
    action: 'approve' | 'reject',
    dto: AttendanceCorrectionActionDto,
  ) {
    const permission =
      action === 'approve'
        ? 'attendance.correction.approve'
        : 'attendance.correction.reject';
    if (!currentUser.permissionKeys.includes(permission)) {
      throw new ForbiddenException(
        `You do not have permission to ${action} attendance corrections.`,
      );
    }

    const request = await this.findCorrectionRequestForUser(currentUser, id);
    await this.assertCanActionCorrection(currentUser, request);

    if (request.status !== AttendanceCorrectionStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        'Only pending attendance correction requests can be actioned.',
      );
    }

    const nextStatus =
      action === 'approve'
        ? AttendanceCorrectionStatus.APPROVED
        : AttendanceCorrectionStatus.REJECTED;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'approve') {
        await this.applyApprovedCorrection(request, currentUser, tx);
      }

      await tx.attendanceCorrectionRequest.update({
        where: { id: request.id },
        data: {
          status: nextStatus,
          approvedAtUtc: action === 'approve' ? now : null,
          rejectedAtUtc: action === 'reject' ? now : null,
          actionedByUserId: currentUser.userId,
          actionComment: dto.comment?.trim() || null,
        },
      });

      return tx.attendanceCorrectionRequest.findFirstOrThrow({
        where: { id: request.id, tenantId: currentUser.tenantId },
        include: attendanceCorrectionInclude,
      });
    });

    await this.syncGenericAttendanceCorrectionApproval(
      updated,
      currentUser,
      action === 'approve'
        ? ApprovalActionType.APPROVED
        : ApprovalActionType.REJECTED,
      dto.comment,
    );
    await this.emitAttendanceCorrectionActioned(updated, currentUser, action);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action:
        action === 'approve'
          ? 'attendance.correction.approved'
          : 'attendance.correction.rejected',
      entityType: 'AttendanceCorrectionRequest',
      entityId: updated.id,
      beforeSnapshot: { status: request.status },
      afterSnapshot: { status: updated.status, actionComment: dto.comment },
    });

    return {
      item: await this.mapCorrectionRequest(currentUser, updated, true),
    };
  }

  private async applyApprovedCorrection(
    request: AttendanceCorrectionWithRelations,
    currentUser: AuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    const checkIn =
      request.requestedCheckInAtUtc ?? request.originalCheckInAtUtc;
    const checkOut =
      request.requestedCheckOutAtUtc ?? request.originalCheckOutAtUtc;

    if (checkIn && checkOut && checkOut < checkIn) {
      throw new BadRequestException(
        'Requested check-out cannot be earlier than requested check-in.',
      );
    }

    if (request.attendanceEntryId) {
      const existing = await tx.attendanceEntry.findFirst({
        where: {
          id: request.attendanceEntryId,
          tenantId: currentUser.tenantId,
        },
      });
      if (!existing) {
        throw new NotFoundException('Attendance entry could not be found.');
      }

      await tx.attendanceEntry.update({
        where: { id: existing.id },
        data: {
          checkIn,
          checkOut,
          status: deriveManualStatus(
            checkIn ?? undefined,
            checkOut ?? undefined,
            existing.isLateCheckIn,
            existing.attendanceMode,
          ),
          source: AttendanceEntrySource.MANUAL,
          notes: mergeNotes(
            existing.notes,
            `Correction ${request.requestNumber}: ${request.reason}`,
          ),
          updatedById: currentUser.userId,
        },
      });
      return;
    }

    const attendanceDate = toStartOfDay(checkIn ?? checkOut ?? new Date());
    const duplicate = await tx.attendanceEntry.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        employeeId: request.employeeId,
        date: attendanceDate,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'An attendance entry already exists for the requested correction date.',
      );
    }

    await tx.attendanceEntry.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId: request.employeeId,
        date: attendanceDate,
        checkIn,
        checkOut,
        attendanceMode: AttendanceMode.MANUAL,
        status: deriveManualStatus(
          checkIn ?? undefined,
          checkOut ?? undefined,
          false,
          AttendanceMode.MANUAL,
        ),
        source: AttendanceEntrySource.MANUAL,
        notes: `Correction ${request.requestNumber}: ${request.reason}`,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });
  }

  private async buildCorrectionWhere(
    currentUser: AuthenticatedUser,
    query: AttendanceCorrectionQueryDto,
  ): Promise<Prisma.AttendanceCorrectionRequestWhereInput> {
    const base: Prisma.AttendanceCorrectionRequestWhereInput = {
      tenantId: currentUser.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                requestNumber: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                reason: { contains: query.search.trim(), mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
    const view = query.view ?? 'mine';
    if (view === 'mine')
      return { ...base, requestedByUserId: currentUser.userId };
    if (view === 'pending') {
      return {
        ...base,
        status: AttendanceCorrectionStatus.PENDING_APPROVAL,
        ...(await this.correctionRelevantScope(currentUser)),
      };
    }
    if (view === 'approved')
      return {
        ...base,
        status: AttendanceCorrectionStatus.APPROVED,
        ...(await this.correctionRelevantScope(currentUser)),
      };
    if (view === 'rejected')
      return {
        ...base,
        status: AttendanceCorrectionStatus.REJECTED,
        ...(await this.correctionRelevantScope(currentUser)),
      };
    if (view === 'team') {
      return { ...base, ...(await this.teamCorrectionScope(currentUser)) };
    }
    return { ...base, ...(await this.correctionRelevantScope(currentUser)) };
  }

  private async correctionRelevantScope(
    currentUser: AuthenticatedUser,
  ): Promise<Prisma.AttendanceCorrectionRequestWhereInput> {
    const permissions = new Set(currentUser.permissionKeys);
    if (
      permissions.has('attendance.correction.manage') ||
      permissions.has('attendance.correction.readTeam')
    ) {
      return {};
    }

    return {
      OR: [
        { requestedByUserId: currentUser.userId },
        { employee: { manager: { userId: currentUser.userId } } },
      ],
    };
  }

  private async teamCorrectionScope(
    currentUser: AuthenticatedUser,
  ): Promise<Prisma.AttendanceCorrectionRequestWhereInput> {
    if (
      currentUser.permissionKeys.includes('attendance.correction.manage') ||
      currentUser.permissionKeys.includes('attendance.correction.readTeam')
    ) {
      return {};
    }
    return { employee: { manager: { userId: currentUser.userId } } };
  }

  private async findCorrectionRequestForUser(
    currentUser: AuthenticatedUser,
    id: string,
  ) {
    this.assertCanReadCorrections(currentUser);
    const request = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: {
        id,
        tenantId: currentUser.tenantId,
        ...(await this.correctionRelevantScope(currentUser)),
      },
      include: attendanceCorrectionInclude,
    });

    if (!request) {
      throw new NotFoundException(
        'Attendance correction request was not found.',
      );
    }

    return request;
  }

  private async nextCorrectionRequestNumber(tenantId: string) {
    const count = await this.prisma.attendanceCorrectionRequest.count({
      where: { tenantId },
    });
    return `ACR-${String(count + 1).padStart(6, '0')}`;
  }

  private assertCanReadCorrections(currentUser: AuthenticatedUser) {
    const permissions = new Set(currentUser.permissionKeys);
    if (
      permissions.has('attendance.correction.read') ||
      permissions.has('attendance.correction.readOwn') ||
      permissions.has('attendance.correction.readTeam') ||
      permissions.has('attendance.correction.approve') ||
      permissions.has('attendance.correction.reject') ||
      permissions.has('attendance.correction.manage')
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have permission to read attendance corrections.',
    );
  }

  private async assertCanActionCorrection(
    currentUser: AuthenticatedUser,
    request: AttendanceCorrectionWithRelations,
  ) {
    const assignment = await this.prisma.approvalAssignment.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        status: ApprovalAssignmentStatus.PENDING,
        assignedToUserId: currentUser.userId,
        approvalRequest: {
          moduleKey: 'attendance',
          entityType: 'attendanceCorrectionRequest',
          entityId: request.id,
        },
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'Only the assigned approver can action this correction request.',
      );
    }
  }

  private async syncGenericAttendanceCorrectionApproval(
    request: AttendanceCorrectionWithRelations,
    currentUser: AuthenticatedUser,
    actionType: ApprovalActionType,
    comment?: string,
  ) {
    const approverUserId = request.employee.manager?.userId ?? null;
    const genericStatus = mapCorrectionApprovalStatus(request.status);
    const dueAtUtc = await this.resolveCorrectionDueAtUtc(currentUser.tenantId);
    const approval = await this.prisma.approvalRequest.upsert({
      where: {
        tenantId_moduleKey_entityType_entityId: {
          tenantId: currentUser.tenantId,
          moduleKey: 'attendance',
          entityType: 'attendanceCorrectionRequest',
          entityId: request.id,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        moduleKey: 'attendance',
        entityType: 'attendanceCorrectionRequest',
        entityId: request.id,
        requestNumber: request.requestNumber,
        title: `${request.requestNumber} - ${formatEmployeeName(request.employee)}`,
        submittedByUserId: request.requestedByUserId,
        submittedForEmployeeId: request.employeeId,
        status: genericStatus,
        createdAtUtc: request.createdAtUtc,
        submittedAtUtc: request.submittedAtUtc,
        completedAtUtc:
          genericStatus === ApprovalRequestStatus.PENDING
            ? null
            : (request.approvedAtUtc ?? request.rejectedAtUtc ?? new Date()),
        metadata: { source: 'attendance-correction' },
      },
      update: {
        status: genericStatus,
        completedAtUtc:
          genericStatus === ApprovalRequestStatus.PENDING
            ? null
            : (request.approvedAtUtc ?? request.rejectedAtUtc ?? new Date()),
      },
    });

    const step = await this.prisma.approvalStep.upsert({
      where: {
        approvalRequestId_stepOrder: {
          approvalRequestId: approval.id,
          stepOrder: 1,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        approvalRequestId: approval.id,
        stepOrder: 1,
        stepName: 'Manager review',
        approverResolverType:
          NotificationRecipientResolverType.REPORTING_MANAGER,
        status: mapCorrectionStepStatus(request.status),
        startedAtUtc: request.submittedAtUtc ?? request.createdAtUtc,
        dueAtUtc,
        completedAtUtc: request.approvedAtUtc ?? request.rejectedAtUtc,
        slaStatus: dueAtUtc ? SlaStatus.ON_TRACK : SlaStatus.NOT_APPLICABLE,
        metadata: { attendanceCorrectionRequestId: request.id },
      },
      update: {
        status: mapCorrectionStepStatus(request.status),
        dueAtUtc,
        completedAtUtc: request.approvedAtUtc ?? request.rejectedAtUtc,
        slaStatus: dueAtUtc ? SlaStatus.ON_TRACK : SlaStatus.NOT_APPLICABLE,
      },
    });

    if (approverUserId) {
      await this.prisma.approvalAssignment.upsert({
        where: {
          id:
            (
              await this.prisma.approvalAssignment.findFirst({
                where: {
                  tenantId: currentUser.tenantId,
                  approvalStepId: step.id,
                  assignedToUserId: approverUserId,
                },
                select: { id: true },
              })
            )?.id ?? '__new_assignment__',
        },
        create: {
          tenantId: currentUser.tenantId,
          approvalRequestId: approval.id,
          approvalStepId: step.id,
          assignedToUserId: approverUserId,
          status: mapCorrectionAssignmentStatus(request.status),
          assignedAtUtc: request.submittedAtUtc ?? request.createdAtUtc,
          actionedAtUtc: request.approvedAtUtc ?? request.rejectedAtUtc,
          metadata: { attendanceCorrectionRequestId: request.id },
        },
        update: {
          status: mapCorrectionAssignmentStatus(request.status),
          actionedAtUtc: request.approvedAtUtc ?? request.rejectedAtUtc,
        },
      });
    }

    await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { currentStepId: step.id },
    });

    await this.prisma.approvalAction.create({
      data: {
        tenantId: currentUser.tenantId,
        approvalRequestId: approval.id,
        approvalStepId: step.id,
        actionType,
        actionByUserId: currentUser.userId,
        comment: comment?.trim() || null,
        actionAtUtc: new Date(),
        actionTimeZone: null,
        metadata: { source: 'attendance-correction' },
      },
    });

    if (dueAtUtc) {
      await this.prisma.slaTracking.upsert({
        where: {
          tenantId_targetType_targetId: {
            tenantId: currentUser.tenantId,
            targetType: SlaTargetType.APPROVAL_STEP,
            targetId: step.id,
          },
        },
        create: {
          tenantId: currentUser.tenantId,
          targetType: SlaTargetType.APPROVAL_STEP,
          targetId: step.id,
          dueAtUtc,
          metadata: { source: 'attendance-correction' },
        },
        update: {
          dueAtUtc,
          completedAtUtc:
            request.status === AttendanceCorrectionStatus.PENDING_APPROVAL
              ? null
              : new Date(),
          status:
            request.status === AttendanceCorrectionStatus.PENDING_APPROVAL
              ? SlaStatus.ON_TRACK
              : SlaStatus.NOT_APPLICABLE,
        },
      });
    }
  }

  private async resolveCorrectionDueAtUtc(tenantId: string) {
    const rule = await this.prisma.slaRule.findFirst({
      where: {
        tenantId,
        targetType: SlaTargetType.APPROVAL_STEP,
        targetStatus: 'PENDING',
        enabled: true,
        slaPolicy: { moduleKey: 'attendance', enabled: true },
      },
      orderBy: { durationMinutes: 'asc' },
    });

    if (!rule) return null;

    return new Date(Date.now() + rule.durationMinutes * 60_000);
  }

  private emitAttendanceCorrectionSubmitted(
    request: AttendanceCorrectionWithRelations,
    currentUser: AuthenticatedUser,
  ) {
    const approverUserId = request.employee.manager?.userId ?? null;
    return this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'attendance.correction.submitted.approver',
      moduleKey: 'attendance',
      actorUserId: currentUser.userId,
      relatedEntityType: 'attendanceCorrectionRequest',
      relatedEntityId: request.id,
      relatedRecordNumber: request.requestNumber,
      metadata: {
        employeeId: request.employeeId,
        employeeName: formatEmployeeName(request.employee),
        correctionRequestId: request.id,
        correctionType: request.correctionType,
        approvalAssigneeUserIds: approverUserId ? [approverUserId] : [],
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/attendance/corrections/${request.id}`,
      },
    });
  }

  private emitAttendanceCorrectionActioned(
    request: AttendanceCorrectionWithRelations,
    currentUser: AuthenticatedUser,
    action: 'approve' | 'reject',
  ) {
    return this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey:
        action === 'approve'
          ? 'attendance.correction.approved.employee'
          : 'attendance.correction.rejected.employee',
      moduleKey: 'attendance',
      actorUserId: currentUser.userId,
      relatedEntityType: 'attendanceCorrectionRequest',
      relatedEntityId: request.id,
      relatedRecordNumber: request.requestNumber,
      metadata: {
        employeeId: request.employeeId,
        employeeName: formatEmployeeName(request.employee),
        correctionRequestId: request.id,
        correctionType: request.correctionType,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/attendance/corrections/${request.id}`,
      },
    });
  }

  private async mapCorrectionRequest(
    currentUser: AuthenticatedUser,
    request: AttendanceCorrectionWithRelations,
    includeApproval = false,
  ) {
    const approval = includeApproval
      ? await this.prisma.approvalRequest.findFirst({
          where: {
            tenantId: currentUser.tenantId,
            moduleKey: 'attendance',
            entityType: 'attendanceCorrectionRequest',
            entityId: request.id,
          },
          include: {
            steps: {
              include: {
                assignments: {
                  include: {
                    assignedToUser: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                      },
                    },
                    assignedToRole: {
                      select: { id: true, name: true, key: true },
                    },
                  },
                },
                actions: {
                  include: {
                    actionByUser: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                      },
                    },
                  },
                  orderBy: { actionAtUtc: 'asc' },
                },
              },
              orderBy: { stepOrder: 'asc' },
            },
            actions: {
              include: {
                actionByUser: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: { actionAtUtc: 'asc' },
            },
          },
        })
      : null;
    const canAct =
      request.status === AttendanceCorrectionStatus.PENDING_APPROVAL &&
      (await this.canCurrentUserActionCorrection(currentUser, request));

    return {
      ...request,
      employeeName: formatEmployeeName(request.employee),
      canApprove:
        canAct &&
        currentUser.permissionKeys.includes('attendance.correction.approve'),
      canReject:
        canAct &&
        currentUser.permissionKeys.includes('attendance.correction.reject'),
      approval,
      relatedRecordUrl: `/attendance/corrections/${request.id}`,
    };
  }

  private async canCurrentUserActionCorrection(
    currentUser: AuthenticatedUser,
    request: AttendanceCorrectionWithRelations,
  ) {
    const assignment = await this.prisma.approvalAssignment.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        status: ApprovalAssignmentStatus.PENDING,
        assignedToUserId: currentUser.userId,
        approvalRequest: {
          moduleKey: 'attendance',
          entityType: 'attendanceCorrectionRequest',
          entityId: request.id,
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  private emitAttendanceCorrectionStatusNotification(
    currentUser: AuthenticatedUser,
    entry: AttendanceEntryWithRelations,
  ) {
    return this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'attendance.correction.updated.employee',
      moduleKey: 'attendance',
      actorUserId: currentUser.userId,
      relatedEntityType: 'attendanceRecord',
      relatedEntityId: entry.id,
      relatedRecordNumber: formatAttendanceRecordNumber(entry),
      metadata: {
        employeeId: entry.employeeId,
        employeeName: formatEmployeeName(entry.employee),
        attendanceDate: entry.date.toISOString(),
        attendanceStatus: entry.status,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/attendance?recordId=${encodeURIComponent(entry.id)}`,
      },
    });
  }

  private async emitAttendanceExceptionNotificationForStatus(
    currentUser: AuthenticatedUser,
    entry: AttendanceEntryWithRelations,
  ) {
    const exceptionType = resolveAttendanceExceptionType(entry);
    if (!exceptionType) return;

    await this.emitAttendanceExceptionNotification(
      currentUser,
      entry,
      exceptionType,
    );
  }

  private emitAttendanceExceptionNotification(
    currentUser: AuthenticatedUser,
    entry: AttendanceEntryWithRelations,
    exceptionType:
      | 'late_check_in'
      | 'missing_checkout'
      | 'absence_without_leave',
  ) {
    return this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'attendance.exception.detected.manager',
      moduleKey: 'attendance',
      actorUserId: currentUser.userId,
      relatedEntityType: 'attendanceRecord',
      relatedEntityId: entry.id,
      relatedRecordNumber: formatAttendanceRecordNumber(entry),
      metadata: {
        employeeId: entry.employeeId,
        employeeName: formatEmployeeName(entry.employee),
        exceptionType,
        attendanceDate: entry.date.toISOString(),
        attendanceStatus: entry.status,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/attendance/team?recordId=${encodeURIComponent(entry.id)}`,
      },
    });
  }

  async exportAttendance(
    currentUser: AuthenticatedUser,
    query: AttendanceQueryDto,
  ) {
    const canManageAll = this.canManageTenantAttendance(currentUser);
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser, query)
      : await this.resolveDirectReportEmployeeIds(currentUser, query);

    if (employeeIds.length === 0) {
      return {
        fileName: buildExportFileName(query),
        csv: buildAttendanceCsv([]),
      };
    }

    const items = await this.attendanceRepository.findAttendanceForSummary(
      currentUser.tenantId,
      {
        ...query,
        page: 1,
        pageSize: 5000,
      },
      { employeeId: { in: employeeIds } },
    );

    return {
      fileName: buildExportFileName(query),
      csv: buildAttendanceCsv(
        items.map((item) => this.mapAttendanceEntry(item)),
      ),
    };
  }

  async importAttendance(
    currentUser: AuthenticatedUser,
    dto: ImportAttendanceDto,
    file: UploadedFile | undefined,
  ) {
    const validatedFile = validateImportFile(file);
    const batch = await this.attendanceRepository.createImportBatch({
      tenantId: currentUser.tenantId,
      fileName: validatedFile.originalname,
      sourceLabel: normalizeOptionalText(dto.sourceLabel),
      status: AttendanceImportBatchStatus.PROCESSING,
      importedByUserId: currentUser.userId,
      importedAt: new Date(),
    });

    const employees = await this.employeesRepository.findByTenant(
      currentUser.tenantId,
      {
        page: 1,
        pageSize: 1000,
        search: undefined,
        employmentStatus: undefined,
        reportingManagerEmployeeId: undefined,
      },
    );

    const employeeByCode = new Map(
      employees.items.map((employee) => [
        employee.employeeCode.toLowerCase(),
        employee,
      ]),
    );
    const employeeByEmail = new Map(
      employees.items
        .filter((employee) => employee.email)
        .map((employee) => [employee.email!.toLowerCase(), employee]),
    );

    const rows = parseCsv(validatedFile.buffer.toString('utf8'));
    const rowErrors: Array<{ row: number; message: string }> = [];
    let successCount = 0;

    for (const row of rows) {
      try {
        await this.importRow(
          currentUser,
          batch.id,
          row,
          employeeByCode,
          employeeByEmail,
        );
        successCount += 1;
      } catch (error) {
        rowErrors.push({
          row: row.rowNumber,
          message: error instanceof Error ? error.message : 'Invalid row.',
        });
      }
    }

    const failedCount = rowErrors.length;
    await this.attendanceRepository.updateImportBatch(
      currentUser.tenantId,
      batch.id,
      {
        status:
          failedCount === 0
            ? AttendanceImportBatchStatus.COMPLETED
            : successCount > 0
              ? AttendanceImportBatchStatus.PARTIAL
              : AttendanceImportBatchStatus.FAILED,
        totalRows: rows.length,
        successCount,
        failedCount,
        errorSummary:
          rowErrors.length > 0
            ? rowErrors
                .slice(0, 10)
                .map((item) => `Row ${item.row}: ${item.message}`)
                .join('\n')
            : null,
      },
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.imported',
      entityType: 'AttendanceImportBatch',
      entityId: batch.id,
      afterSnapshot: {
        failedCount,
        fileName: batch.fileName,
        successCount,
        totalRows: rows.length,
      },
    });

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      totalRows: rows.length,
      successCount,
      failedCount,
      rowErrors,
    };
  }

  async listIntegrationConfigs(currentUser: AuthenticatedUser) {
    const integrations =
      await this.attendanceRepository.listAttendanceIntegrations(
        currentUser.tenantId,
      );

    return integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      integrationType: integration.integrationType,
      description: integration.description,
      endpointUrl: integration.endpointUrl,
      username: integration.username,
      configJson: integration.configJson,
      isActive: integration.isActive,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    }));
  }

  async createIntegrationConfig(
    currentUser: AuthenticatedUser,
    dto: CreateAttendanceIntegrationDto,
  ) {
    const integration =
      await this.attendanceRepository.createAttendanceIntegration({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        integrationType: dto.integrationType,
        description: normalizeOptionalText(dto.description),
        endpointUrl: normalizeOptionalText(dto.endpointUrl),
        username: normalizeOptionalText(dto.username),
        configJson: normalizeOptionalText(dto.configJson),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.integration_created',
      entityType: 'AttendanceIntegrationConfig',
      entityId: integration.id,
      afterSnapshot: {
        integrationType: integration.integrationType,
        isActive: integration.isActive,
        name: integration.name,
      },
    });

    return integration;
  }

  async updateIntegrationConfig(
    currentUser: AuthenticatedUser,
    integrationId: string,
    dto: UpdateAttendanceIntegrationDto,
  ) {
    const existing =
      await this.attendanceRepository.findAttendanceIntegrationById(
        currentUser.tenantId,
        integrationId,
      );

    if (!existing) {
      throw new NotFoundException('Attendance integration could not be found.');
    }

    await this.attendanceRepository.updateAttendanceIntegration(
      currentUser.tenantId,
      integrationId,
      {
        name: dto.name?.trim(),
        integrationType: dto.integrationType,
        description: normalizeOptionalText(dto.description),
        endpointUrl: normalizeOptionalText(dto.endpointUrl),
        username: normalizeOptionalText(dto.username),
        configJson: normalizeOptionalText(dto.configJson),
        updatedById: currentUser.userId,
      },
    );

    const updated =
      await this.attendanceRepository.findAttendanceIntegrationById(
        currentUser.tenantId,
        integrationId,
      );

    if (!updated) {
      throw new NotFoundException(
        'Attendance integration could not be reloaded.',
      );
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.integration_updated',
      entityType: 'AttendanceIntegrationConfig',
      entityId: updated.id,
      beforeSnapshot: {
        integrationType: existing.integrationType,
        name: existing.name,
      },
      afterSnapshot: {
        integrationType: updated.integrationType,
        name: updated.name,
      },
    });

    return updated;
  }

  async getPolicy(currentUser: AuthenticatedUser) {
    return this.resolvePolicy(currentUser.tenantId);
  }

  async getTodayAttendance(currentUser: AuthenticatedUser) {
    const employee = await this.getCurrentEmployee(currentUser);
    const context = await this.resolveSelfServiceContext(
      currentUser,
      employee.id,
      new Date(),
    );
    const entry =
      await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
        currentUser.tenantId,
        employee.id,
        context.attendanceDate,
      );

    return entry ? this.mapAttendanceEntry(entry, currentUser) : null;
  }

  async getSelfServiceRuntimeContext(currentUser: AuthenticatedUser) {
    const employee = await this.getCurrentEmployee(currentUser);
    const now = new Date();
    const context = await this.resolveSelfServiceContext(
      currentUser,
      employee.id,
      now,
    );
    const [todayAttendance, policy, workSites, approvedLeave] =
      await Promise.all([
        this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
          currentUser.tenantId,
          employee.id,
          context.attendanceDate,
        ),
        this.resolvePolicy(currentUser.tenantId),
        this.attendanceRepository.listOfficeLocations(currentUser.tenantId),
        this.findApprovedLeave(
          currentUser.tenantId,
          employee.id,
          context.attendanceDate,
        ),
      ]);

    const state = !todayAttendance
      ? 'not-checked-in'
      : todayAttendance.checkOut
        ? 'completed'
        : todayAttendance.checkIn
          ? 'checked-in'
          : 'not-checked-in';

    return {
      attendanceActionState:
        (approvedLeave && !policy.allowCheckInOnApprovedLeave) ||
        Boolean(context.configurationError) ||
        (context.isOffDay && !policy.allowOffDayCheckIn) ||
        (Boolean(context.holiday) && !policy.allowHolidayCheckIn)
          ? 'blocked'
          : state,
      attendanceDate: formatBusinessDateKey(context.attendanceDate),
      timezone: context.timezone,
      allowedModes: policy.allowedModes.filter(isSelfServiceAttendanceMode),
      resolvedShift: context.shift
        ? {
            id: context.shift.id,
            name: context.shift.name,
            code: context.shift.code,
            startTime: context.shift.startTime,
            endTime: context.shift.endTime,
            timezone: context.shift.timezone,
            breakMinutes: context.shift.breakMinutes,
            expectedHours: Number(context.shift.expectedHours),
            lateGraceMinutes: context.shift.lateGraceMinutes,
            earlyExitGraceMinutes: context.shift.earlyExitGraceMinutes,
            isNightShift: context.shift.isNightShift,
          }
        : null,
      workSites,
      todayAttendance: todayAttendance
        ? this.mapAttendanceEntry(todayAttendance, currentUser)
        : null,
      blockedReason: approvedLeave
        ? policy.allowCheckInOnApprovedLeave
          ? null
          : 'Check in is unavailable because you have approved leave today.'
        : context.configurationError
          ? context.configurationError
          : context.isOffDay && !policy.allowOffDayCheckIn
            ? `Check in is unavailable because ${formatBusinessDateKey(context.attendanceDate)} is a scheduled off day.`
            : context.holiday && !policy.allowHolidayCheckIn
              ? `Check in is unavailable because today is ${context.holiday.name}.`
              : null,
      policy: {
        allowManualAdjustments: policy.allowManualAdjustments,
        officeRequiresWorkSite: policy.requireOfficeLocationForOfficeMode,
        remoteRequiresLocation: policy.requireRemoteLocationForRemoteMode,
        hybridRequiresLocation: policy.requireRemoteLocationForRemoteMode,
      },
      nonWorkingDayPolicy: {
        allowOffDayCheckIn: policy.allowOffDayCheckIn,
        allowHolidayCheckIn: policy.allowHolidayCheckIn,
        isOffDay: context.isOffDay,
        holiday: context.holiday,
      },
    };
  }

  async getRuntimeConfiguration(currentUser: AuthenticatedUser) {
    const [policy, persistedPolicy, persistedSettings] = await Promise.all([
      this.resolvePolicy(currentUser.tenantId),
      this.attendanceRepository.findAttendancePolicy(currentUser.tenantId),
      this.prisma.tenantSetting.findMany({
        where: {
          tenantId: currentUser.tenantId,
          category: 'attendance',
        },
        select: { key: true },
      }),
    ]);
    const issues: string[] = [];

    if (!persistedPolicy && persistedSettings.length === 0) {
      issues.push(
        'Attendance Configuration has not been saved. Catalog defaults are shown until Attendance Configuration is completed in Settings.',
      );
    }
    if (policy.allowedModes.length === 0) {
      issues.push(
        'Attendance allowed modes are missing or invalid. Review Attendance Configuration in Settings.',
      );
    }

    return {
      status:
        issues.length === 0 ? ('AVAILABLE' as const) : ('INVALID' as const),
      policy,
      issues,
      source: persistedPolicy
        ? ('policy' as const)
        : persistedSettings.length > 0
          ? ('settings' as const)
          : ('catalog-default' as const),
    };
  }

  async updatePolicy(
    currentUser: AuthenticatedUser,
    dto: UpdateAttendancePolicyDto,
  ) {
    const existing = await this.attendanceRepository.findAttendancePolicy(
      currentUser.tenantId,
    );

    const policy = await this.attendanceRepository.upsertAttendancePolicy(
      currentUser.tenantId,
      {
        tenantId: currentUser.tenantId,
        lateCheckInGraceMinutes: dto.lateCheckInGraceMinutes,
        lateCheckOutGraceMinutes: dto.lateCheckOutGraceMinutes,
        requireOfficeLocationForOfficeMode:
          dto.requireOfficeLocationForOfficeMode,
        requireRemoteLocationForRemoteMode:
          dto.requireRemoteLocationForRemoteMode,
        allowRemoteWithoutLocation: dto.allowRemoteWithoutLocation,
        allowManualAdjustments: dto.allowManualAdjustments,
        preventDuplicateAttendance: dto.preventDuplicateAttendance,
        allowCheckInOnApprovedLeave: dto.allowCheckInOnApprovedLeave,
        markMissingCheckout: dto.markMissingCheckout,
        allowOffDayCheckIn: dto.allowOffDayCheckIn ?? false,
        allowHolidayCheckIn: dto.allowHolidayCheckIn ?? false,
        allowHrAdminOverride: dto.allowHrAdminOverride ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      {
        lateCheckInGraceMinutes: dto.lateCheckInGraceMinutes,
        lateCheckOutGraceMinutes: dto.lateCheckOutGraceMinutes,
        requireOfficeLocationForOfficeMode:
          dto.requireOfficeLocationForOfficeMode,
        requireRemoteLocationForRemoteMode:
          dto.requireRemoteLocationForRemoteMode,
        allowRemoteWithoutLocation: dto.allowRemoteWithoutLocation,
        allowManualAdjustments: dto.allowManualAdjustments,
        preventDuplicateAttendance: dto.preventDuplicateAttendance,
        allowCheckInOnApprovedLeave: dto.allowCheckInOnApprovedLeave,
        markMissingCheckout: dto.markMissingCheckout,
        allowOffDayCheckIn:
          dto.allowOffDayCheckIn ?? existing?.allowOffDayCheckIn ?? false,
        allowHolidayCheckIn:
          dto.allowHolidayCheckIn ?? existing?.allowHolidayCheckIn ?? false,
        allowHrAdminOverride:
          dto.allowHrAdminOverride ?? existing?.allowHrAdminOverride ?? true,
        updatedById: currentUser.userId,
      },
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'attendance.policy_updated',
      entityType: 'AttendancePolicy',
      entityId: policy.id,
      beforeSnapshot: existing,
      afterSnapshot: policy,
    });

    return policy;
  }

  async listOfficeLocations(currentUser: AuthenticatedUser) {
    return this.attendanceRepository.listOfficeLocations(currentUser.tenantId);
  }

  async listShiftTemplates(currentUser: AuthenticatedUser) {
    return this.attendanceRepository.listShiftTemplates(currentUser.tenantId);
  }

  private async importRow(
    currentUser: AuthenticatedUser,
    batchId: string,
    row: ParsedCsvRow,
    employeeByCode: Map<string, { id: string; employeeCode: string }>,
    employeeByEmail: Map<string, { id: string; workEmail?: string | null }>,
  ) {
    const employee = resolveEmployeeFromImportRow(
      row,
      employeeByCode,
      employeeByEmail,
    );

    if (!employee) {
      throw new BadRequestException(
        'Employee could not be matched from employeeCode or workEmail.',
      );
    }

    const dateValue = row.values.date;
    if (!dateValue) {
      throw new BadRequestException('date is required.');
    }

    let attendanceDate: Date;
    try {
      attendanceDate = parseBusinessDateInput(dateValue);
    } catch {
      throw new BadRequestException('date must be a valid ISO date.');
    }

    const existing =
      await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
        currentUser.tenantId,
        employee.id,
        attendanceDate,
      );

    if (existing) {
      throw new ConflictException(
        'Attendance already exists for this employee and date.',
      );
    }

    const policy = await this.resolvePolicy(currentUser.tenantId);
    const officeLocationId = row.values.officeLocationId?.trim() || undefined;
    const attendanceMode = parseAttendanceMode(row.values.attendanceMode);
    const [workSchedule, officeLocation] = await Promise.all([
      this.attendanceRepository.findDefaultWorkSchedule(currentUser.tenantId),
      this.validateModeAndLocation(
        currentUser.tenantId,
        attendanceMode,
        policy,
        officeLocationId,
        parseNumber(row.values.remoteLatitude),
        parseNumber(row.values.remoteLongitude),
      ),
    ]);

    const checkIn = row.values.checkInTime
      ? combineDateAndTime(attendanceDate, row.values.checkInTime)
      : undefined;
    const checkOut = row.values.checkOutTime
      ? combineDateAndTime(attendanceDate, row.values.checkOutTime)
      : undefined;

    if (checkOut && !checkIn) {
      throw new BadRequestException(
        'checkInTime is required when checkOutTime is present.',
      );
    }

    if (checkIn && checkOut && checkOut < checkIn) {
      throw new BadRequestException(
        'checkOutTime cannot be earlier than checkInTime.',
      );
    }

    const lateCheckIn = checkIn
      ? resolveLateCheckIn(workSchedule, policy, checkIn)
      : { isLate: false, minutesLate: null };
    const lateCheckOut = checkOut
      ? resolveLateCheckOut(workSchedule, policy, checkOut)
      : { isLate: false, minutesLate: null };

    await this.attendanceRepository.createAttendanceEntry({
      tenantId: currentUser.tenantId,
      employeeId: employee.id,
      workScheduleId: workSchedule?.id,
      officeLocationId: officeLocation?.id,
      importedBatchId: batchId,
      date: attendanceDate,
      checkIn,
      checkOut,
      attendanceMode,
      status:
        parseAttendanceStatus(row.values.status) ??
        deriveManualStatus(
          checkIn,
          checkOut,
          lateCheckIn.isLate,
          attendanceMode,
        ),
      source: AttendanceEntrySource.IMPORT,
      checkInNote: normalizeOptionalText(row.values.checkInNote),
      checkOutNote: normalizeOptionalText(row.values.checkOutNote),
      workSummary: normalizeOptionalText(row.values.workSummary),
      notes: normalizeOptionalText(row.values.notes),
      remoteLatitude: parseNumber(row.values.remoteLatitude),
      remoteLongitude: parseNumber(row.values.remoteLongitude),
      remoteAddressText: normalizeOptionalText(row.values.remoteAddressText),
      isLateCheckIn: lateCheckIn.isLate,
      isLateCheckOut: lateCheckOut.isLate,
      lateCheckInMinutes: lateCheckIn.minutesLate,
      lateCheckOutMinutes: lateCheckOut.minutesLate,
      machineDeviceId: normalizeOptionalText(row.values.machineDeviceId),
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });
  }

  private async getCurrentEmployee(currentUser: AuthenticatedUser) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    return employee;
  }

  private async resolveSelfServiceContext(
    currentUser: AuthenticatedUser,
    employeeId: string,
    effectiveDate: Date,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        id: employeeId,
        isDeleted: false,
      },
      select: {
        id: true,
        businessUnitId: true,
      },
    });
    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    const appContext =
      await this.configurationResolverService.resolveAppContext({
        tenantId: currentUser.tenantId,
        businessUnitId: employee.businessUnitId,
        employeeId,
        module: 'attendance',
        effectiveDate,
      });
    const attendanceDate = businessDateAtUtcMidnight(
      effectiveDate,
      appContext.timezone,
    );
    const resolvedWorkConfiguration =
      await this.attendanceRepository.resolveEmployeeWorkConfiguration(
        currentUser.tenantId,
        employeeId,
        attendanceDate,
        toWeekday(attendanceDate),
      );
    const workSchedule = resolvedWorkConfiguration?.workSchedule ?? null;
    const scheduleDay = resolvedWorkConfiguration?.scheduleDay ?? null;
    const shift =
      scheduleDay?.isWorkingDay &&
      scheduleDay.shiftTemplate?.isActive &&
      scheduleDay.shiftTemplate.status === 'ACTIVE'
        ? scheduleDay.shiftTemplate
        : null;
    const holiday =
      resolvedWorkConfiguration?.holidayCalendarId &&
      resolvedWorkConfiguration.employee
        ? await this.attendanceRepository.findHolidayForEmployeeDate(
            currentUser.tenantId,
            resolvedWorkConfiguration.holidayCalendarId,
            attendanceDate,
            resolvedWorkConfiguration.employee.departmentId,
            resolvedWorkConfiguration.employee.locationId,
          )
        : null;
    const isWorkingDay = scheduleDay
      ? scheduleDay.isWorkingDay
      : Boolean(
          workSchedule?.weeklyWorkDays.includes(toWeekday(attendanceDate)),
        );
    const configurationError = !workSchedule
      ? 'No active work schedule is configured for this employee, department, work site, or tenant default.'
      : isWorkingDay && !shift
        ? `Work schedule "${workSchedule.name}" has no active shift configured for ${toWeekday(attendanceDate).toLowerCase()}.`
        : null;

    return {
      attendanceDate,
      timezone: appContext.timezone,
      workSchedule,
      shift,
      holiday,
      isOffDay: Boolean(workSchedule && !isWorkingDay),
      scheduleSource: resolvedWorkConfiguration?.source ?? null,
      configurationError,
    };
  }

  private findApprovedLeave(
    tenantId: string,
    employeeId: string,
    attendanceDate: Date,
  ) {
    return this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: attendanceDate },
        endDate: { gte: attendanceDate },
      },
      select: { id: true },
    });
  }

  private canManageTenantAttendance(currentUser: AuthenticatedUser) {
    return (
      hasElevatedTenantRole(currentUser) ||
      currentUser.permissionKeys.includes('attendance.manage')
    );
  }

  private canReadAttendanceBeyondTeam(currentUser: AuthenticatedUser) {
    return (
      this.canManageTenantAttendance(currentUser) ||
      this.hasAttendanceAccessAtOrAbove(currentUser, SecurityPrivilege.READ, [
        SecurityAccessLevel.BUSINESS_UNIT,
        SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
        SecurityAccessLevel.ORGANIZATION,
        SecurityAccessLevel.TENANT,
      ])
    );
  }

  private canOverrideAttendance(currentUser: AuthenticatedUser) {
    return (
      this.canManageTenantAttendance(currentUser) ||
      currentUser.permissionKeys.includes('attendance.update') ||
      this.hasAttendanceAccessAtOrAbove(currentUser, SecurityPrivilege.WRITE, [
        SecurityAccessLevel.BUSINESS_UNIT,
        SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
        SecurityAccessLevel.ORGANIZATION,
        SecurityAccessLevel.TENANT,
      ]) ||
      this.hasAttendanceAccessAtOrAbove(currentUser, SecurityPrivilege.MANAGE, [
        SecurityAccessLevel.BUSINESS_UNIT,
        SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
        SecurityAccessLevel.ORGANIZATION,
        SecurityAccessLevel.TENANT,
      ])
    );
  }

  private hasAttendanceAccessAtOrAbove(
    currentUser: AuthenticatedUser,
    privilege: SecurityPrivilege,
    allowedLevels: SecurityAccessLevel[],
  ) {
    const minimumWeight = Math.min(
      ...allowedLevels.map((level) => SECURITY_ACCESS_LEVEL_WEIGHT[level] ?? 0),
    );

    return (
      currentUser.rolePrivileges?.some(
        (rolePrivilege) =>
          rolePrivilege.entityKey === 'attendance' &&
          rolePrivilege.privilege === privilege &&
          (SECURITY_ACCESS_LEVEL_WEIGHT[rolePrivilege.accessLevel] ?? 0) >=
            minimumWeight,
      ) ?? false
    );
  }

  private hasManagerRole(currentUser: AuthenticatedUser) {
    return currentUser.roleKeys?.includes(ROLE_KEYS.MANAGER) ?? false;
  }

  private async getAuthorizedAttendanceEntry(
    currentUser: AuthenticatedUser,
    entryId: string,
    requireOverrideAccess: boolean,
  ) {
    const entry = await this.attendanceRepository.findAttendanceEntryById(
      currentUser.tenantId,
      entryId,
    );

    if (!entry) {
      throw new NotFoundException('Attendance entry could not be found.');
    }

    const currentEmployee =
      await this.attendanceRepository.findEmployeeIdByUserId(
        currentUser.tenantId,
        currentUser.userId,
      );
    if (
      entry.employee.userId === currentUser.userId ||
      currentEmployee?.id === entry.employeeId
    ) {
      if (requireOverrideAccess && !this.canOverrideAttendance(currentUser)) {
        throw new ForbiddenException(
          'You do not have permission to override this attendance record.',
        );
      }

      return entry;
    }

    if (requireOverrideAccess) {
      const employeeIds = await this.resolveAllTenantEmployeeIds(currentUser, {
        employeeId: entry.employeeId,
      });

      if (employeeIds.includes(entry.employeeId)) {
        return entry;
      }

      throw new ForbiddenException(
        'You do not have permission to override this attendance record.',
      );
    }

    if (this.canReadAttendanceBeyondTeam(currentUser)) {
      const employeeIds = await this.resolveAllTenantEmployeeIds(currentUser, {
        employeeId: entry.employeeId,
      });

      if (employeeIds.includes(entry.employeeId)) {
        return entry;
      }
    }

    if (this.hasManagerRole(currentUser)) {
      const employeeIds = await this.resolveReportingHierarchyEmployeeIds(
        currentUser,
        { employeeId: entry.employeeId },
      );

      if (employeeIds.includes(entry.employeeId)) {
        return entry;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to view this attendance record.',
    );
  }

  private async resolvePolicy(tenantId: string) {
    const attendanceSettings =
      await this.tenantSettingsResolverService.getAttendanceSettings(tenantId);
    const policy =
      await this.attendanceRepository.findAttendancePolicy(tenantId);

    return {
      lateCheckInGraceMinutes:
        policy?.lateCheckInGraceMinutes ??
        attendanceSettings.defaultGraceMinutes,
      lateCheckOutGraceMinutes:
        policy?.lateCheckOutGraceMinutes ??
        attendanceSettings.defaultGraceMinutes,
      requireOfficeLocationForOfficeMode:
        policy?.requireOfficeLocationForOfficeMode ??
        attendanceSettings.enforceOfficeLocationForOfficeMode,
      requireRemoteLocationForRemoteMode:
        policy?.requireRemoteLocationForRemoteMode ??
        attendanceSettings.requireRemoteLocationCapture,
      allowRemoteWithoutLocation:
        policy?.allowRemoteWithoutLocation ??
        !attendanceSettings.requireRemoteLocationCapture,
      allowManualAdjustments: attendanceSettings.allowManualAdjustments,
      preventDuplicateAttendance: policy?.preventDuplicateAttendance ?? true,
      allowCheckInOnApprovedLeave: policy?.allowCheckInOnApprovedLeave ?? false,
      markMissingCheckout: policy?.markMissingCheckout ?? true,
      allowOffDayCheckIn: policy?.allowOffDayCheckIn ?? false,
      allowHolidayCheckIn: policy?.allowHolidayCheckIn ?? false,
      allowHrAdminOverride: policy?.allowHrAdminOverride ?? true,
      allowedModes: attendanceSettings.allowedModes,
    };
  }

  private async validateModeAndLocation(
    tenantId: string,
    attendanceMode: AttendanceMode,
    policy: AttendancePolicyShape,
    officeLocationId?: string,
    remoteLatitude?: number,
    remoteLongitude?: number,
    requireBrowserLocation = false,
  ) {
    if (!policy.allowedModes.includes(attendanceMode)) {
      throw new BadRequestException(
        `Attendance mode ${attendanceMode} is disabled for this tenant.`,
      );
    }

    if (attendanceMode === AttendanceMode.OFFICE) {
      if (!officeLocationId) {
        throw new BadRequestException(
          'Office location is required for office attendance.',
        );
      }

      const officeLocation =
        await this.attendanceRepository.findOfficeLocationById(
          tenantId,
          officeLocationId,
        );

      if (!officeLocation) {
        throw new BadRequestException(
          'Selected office location does not belong to this tenant.',
        );
      }

      return officeLocation;
    }

    if (
      requireBrowserLocation &&
      (attendanceMode === AttendanceMode.REMOTE ||
        attendanceMode === AttendanceMode.HYBRID) &&
      (remoteLatitude === undefined || remoteLongitude === undefined)
    ) {
      throw new BadRequestException(
        `${attendanceMode === AttendanceMode.HYBRID ? 'Hybrid' : 'Remote'} attendance requires browser location.`,
      );
    }

    return null;
  }

  private async resolveAllTenantEmployeeIds(
    currentUser: AuthenticatedUser,
    query: Partial<AttendanceQueryDto>,
  ) {
    const tenantId = currentUser.tenantId;
    const accessibleBusinessUnitIds =
      currentUser.accessContext?.accessibleBusinessUnitIds ?? [];
    const canAccessAllBusinessUnits =
      hasElevatedTenantRole(currentUser) ||
      currentUser.accessContext?.canAccessAllBusinessUnits === true;
    const accessWhere: Prisma.EmployeeWhereInput = canAccessAllBusinessUnits
      ? {}
      : accessibleBusinessUnitIds.length > 0
        ? {
            OR: [
              { businessUnitId: { in: accessibleBusinessUnitIds } },
              { user: { businessUnitId: { in: accessibleBusinessUnitIds } } },
            ],
          }
        : { id: '__attendance_no_business_unit_access__' };

    if (query.employeeId) {
      const employee =
        await this.employeesRepository.findHierarchyNodeByIdAndTenant(
          tenantId,
          query.employeeId,
        );

      if (!employee) {
        throw new BadRequestException(
          'Selected employee does not belong to this tenant.',
        );
      }

      if (
        !canAccessAllBusinessUnits &&
        !accessibleBusinessUnitIds.includes(employee.businessUnitId ?? '') &&
        !accessibleBusinessUnitIds.includes(employee.user?.businessUnitId ?? '')
      ) {
        throw new ForbiddenException(
          'You do not have permission to view attendance for this employee.',
        );
      }

      return [employee.id];
    }

    const employees = await this.employeesRepository.findByTenant(
      tenantId,
      {
        page: 1,
        pageSize: 1000,
        search: undefined,
        employmentStatus: undefined,
        reportingManagerEmployeeId: undefined,
      },
      accessWhere,
    );

    let items = employees.items;

    if (query.departmentId) {
      items = items.filter(
        (employee) => employee.departmentId === query.departmentId,
      );
    }

    return items.map((employee) => employee.id);
  }

  private async resolveDirectReportEmployeeIds(
    currentUser: AuthenticatedUser,
    query: Partial<AttendanceQueryDto>,
  ) {
    const currentEmployee = await this.getCurrentEmployee(currentUser);
    const directReports = await this.employeesRepository.findDirectReports(
      currentUser.tenantId,
      currentEmployee.id,
    );

    const filteredReports = query.departmentId
      ? directReports.filter(
          (employee) => employee.department?.id === query.departmentId,
        )
      : directReports;
    const directReportIds = filteredReports.map((employee) => employee.id);

    if (query.employeeId) {
      if (!directReportIds.includes(query.employeeId)) {
        throw new ForbiddenException(
          'You can only view attendance for your direct reports.',
        );
      }

      return [query.employeeId];
    }

    return directReportIds;
  }

  private async resolveReportingHierarchyEmployeeIds(
    currentUser: AuthenticatedUser,
    query: Partial<AttendanceQueryDto>,
  ) {
    const currentEmployee = await this.getCurrentEmployee(currentUser);
    const hierarchyIds = new Set<string>();
    let frontier = [currentEmployee.id];

    while (frontier.length > 0) {
      const nextFrontier: string[] = [];

      for (const managerEmployeeId of frontier) {
        const directReports = await this.employeesRepository.findDirectReports(
          currentUser.tenantId,
          managerEmployeeId,
        );

        for (const employee of directReports) {
          if (
            query.departmentId &&
            employee.department?.id !== query.departmentId
          ) {
            continue;
          }

          if (!hierarchyIds.has(employee.id)) {
            hierarchyIds.add(employee.id);
            nextFrontier.push(employee.id);
          }
        }
      }

      frontier = nextFrontier;
    }

    if (query.employeeId) {
      if (!hierarchyIds.has(query.employeeId)) {
        throw new ForbiddenException(
          'You can only view attendance for employees in your reporting hierarchy.',
        );
      }

      return [query.employeeId];
    }

    if (hierarchyIds.size === 0 && !this.hasManagerRole(currentUser)) {
      throw new ForbiddenException(
        'You do not have permission to view team attendance.',
      );
    }

    return Array.from(hierarchyIds);
  }

  private mapAttendanceList(
    items: AttendanceEntryWithRelations[],
    total: number,
    query: AttendanceQueryDto,
    filters: {
      scope: 'mine' | 'team' | 'tenant';
      employeeId: string | null;
      summaryItems?: AttendanceEntryWithRelations[];
      summaryView?: 'day' | 'week' | 'month';
      summaryAnchorDate?: string;
    },
  ) {
    const summary = buildSummaryResponse(
      filters.summaryItems ?? items,
      filters.summaryView ?? query.view ?? 'week',
      filters.summaryAnchorDate ?? query.dateFrom ?? currentDateKey(),
      { scope: filters.scope },
    );
    const mappedItems = items.map((item) => this.mapAttendanceEntry(item));

    return {
      items: mappedItems,
      data: mappedItems,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      summary: summary.totals,
      filters: {
        search: query.search ?? null,
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        status: query.status ?? null,
        attendanceMode: query.attendanceMode ?? null,
        source: query.source ?? null,
        employeeId: filters.employeeId,
        departmentId: query.departmentId ?? null,
        officeLocationId: query.officeLocationId ?? null,
        sortField: query.sortField ?? 'date',
        sortDirection: query.sortDirection ?? 'desc',
        scope: filters.scope,
      },
    };
  }

  private mapAttendanceEntry(
    entry: AttendanceEntryWithRelations,
    currentUser?: AuthenticatedUser,
  ) {
    const isCurrentUsersEntry =
      currentUser !== undefined && entry.employee.userId === currentUser.userId;
    const canCurrentUserCheckOut =
      isCurrentUsersEntry && entry.checkIn !== null && entry.checkOut === null;
    const durationMinutes =
      entry.checkIn && entry.checkOut
        ? Math.max(0, differenceInMinutes(entry.checkOut, entry.checkIn))
        : null;
    const durationLabel =
      durationMinutes === null ? null : formatDurationMinutes(durationMinutes);

    return {
      id: entry.id,
      tenantId: entry.tenantId,
      employeeId: entry.employeeId,
      workScheduleId: entry.workScheduleId,
      shiftTemplateId: entry.shiftTemplateId,
      officeLocationId: entry.officeLocationId,
      importedBatchId: entry.importedBatchId,
      attendanceDate: entry.date,
      date: entry.date,
      checkInAt: entry.checkIn,
      checkOutAt: entry.checkOut,
      checkIn: entry.checkIn,
      checkOut: entry.checkOut,
      attendanceMode: entry.attendanceMode,
      status: entry.status,
      source: entry.source,
      checkInSource: entry.checkInSource,
      checkOutSource: entry.checkOutSource,
      checkInNote: entry.checkInNote,
      checkOutNote: entry.checkOutNote,
      workSummary: entry.workSummary,
      notes: entry.notes,
      remoteLatitude: entry.remoteLatitude,
      remoteLongitude: entry.remoteLongitude,
      remoteAddressText: entry.remoteAddressText,
      checkInLatitude: entry.checkInLatitude,
      checkInLongitude: entry.checkInLongitude,
      checkInLocationAccuracy: entry.checkInLocationAccuracy,
      checkInLocationCapturedAt: entry.checkInLocationCapturedAt,
      checkOutLatitude: entry.checkOutLatitude,
      checkOutLongitude: entry.checkOutLongitude,
      checkOutLocationAccuracy: entry.checkOutLocationAccuracy,
      checkOutLocationCapturedAt: entry.checkOutLocationCapturedAt,
      isLateCheckIn: entry.isLateCheckIn,
      isLateCheckOut: entry.isLateCheckOut,
      lateCheckInMinutes: entry.lateCheckInMinutes,
      lateCheckOutMinutes: entry.lateCheckOutMinutes,
      machineDeviceId: entry.machineDeviceId,
      durationMinutes,
      durationLabel,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      employee: {
        id: entry.employee.id,
        employeeCode: entry.employee.employeeCode,
        firstName: entry.employee.firstName,
        lastName: entry.employee.lastName,
        preferredName: entry.employee.preferredName,
        fullName: `${entry.employee.firstName} ${entry.employee.lastName}`,
        managerEmployeeId: entry.employee.managerEmployeeId,
        department: entry.employee.department,
        designation: entry.employee.designation,
        manager: entry.employee.manager
          ? {
              id: entry.employee.manager.id,
              employeeCode: entry.employee.manager.employeeCode,
              firstName: entry.employee.manager.firstName,
              lastName: entry.employee.manager.lastName,
              preferredName: entry.employee.manager.preferredName,
            }
          : null,
      },
      officeLocation: entry.officeLocation,
      workSchedule: entry.workSchedule,
      shift: entry.shiftTemplate,
      importedBatch: entry.importedBatch,
      canCurrentUserEdit: currentUser
        ? this.canManageTenantAttendance(currentUser)
        : false,
      canCurrentUserCheckOut,
      checkOutBlockedReason: canCurrentUserCheckOut
        ? null
        : resolveCheckOutBlockedReason(
            currentUser,
            isCurrentUsersEntry,
            entry.checkIn,
            entry.checkOut,
          ),
      isCurrentUsersEntry,
    };
  }
}

function resolveCheckOutBlockedReason(
  currentUser: AuthenticatedUser | undefined,
  isCurrentUsersEntry: boolean,
  checkIn: Date | null,
  checkOut: Date | null,
) {
  if (!currentUser) {
    return null;
  }

  if (checkIn === null) {
    return 'You cannot check out before checking in.';
  }

  if (checkOut !== null) {
    return 'This attendance session has already been checked out.';
  }

  if (!isCurrentUsersEntry) {
    return 'This attendance entry is not linked to your current user session.';
  }

  return 'Checkout is unavailable for this attendance entry.';
}

function toStartOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function parseBusinessDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('date must be a valid ISO date.');
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('date must be a valid ISO date.');
  }
  return parsed;
}

function combineDateAndTimeInTimezone(
  businessDate: Date,
  time: string,
  timezone: string,
) {
  const [year, month, day] = businessDate
    .toISOString()
    .slice(0, 10)
    .split('-')
    .map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const intendedUtc = Date.UTC(year, month - 1, day, hours, minutes);
  let candidate = new Date(intendedUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const representedUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
    );
    candidate = new Date(candidate.getTime() + intendedUtc - representedUtc);
  }

  return candidate;
}

function differenceInMinutes(later: Date, earlier: Date) {
  return Math.round((later.getTime() - earlier.getTime()) / 60_000);
}

function resolveLateCheckIn(
  schedule: {
    weeklyWorkDays: WorkWeekday[];
    standardStartTime: string;
  } | null,
  policy: AttendancePolicyShape,
  currentDateTime: Date,
  shift?: { startTime: string; lateGraceMinutes: number } | null,
) {
  if (!schedule) {
    return { isLate: false, minutesLate: null as number | null };
  }

  const weekday = toWeekday(currentDateTime);

  if (!schedule.weeklyWorkDays.includes(weekday)) {
    return { isLate: false, minutesLate: null as number | null };
  }

  const startAt = combineDateAndTime(
    toStartOfDay(currentDateTime),
    shift?.startTime ?? schedule.standardStartTime,
  );
  startAt.setMinutes(
    startAt.getMinutes() +
      (shift?.lateGraceMinutes ?? policy.lateCheckInGraceMinutes),
  );
  const minutesLate = differenceInMinutes(currentDateTime, startAt);

  return {
    isLate: currentDateTime > startAt,
    minutesLate: currentDateTime > startAt ? minutesLate : null,
  };
}

function resolveLateCheckOut(
  schedule: {
    weeklyWorkDays: WorkWeekday[];
    standardEndTime: string;
  } | null,
  policy: AttendancePolicyShape,
  currentDateTime: Date,
  shift?: { endTime: string; earlyExitGraceMinutes: number } | null,
) {
  if (!schedule) {
    return { isLate: false, minutesLate: null as number | null };
  }

  const weekday = toWeekday(currentDateTime);

  if (!schedule.weeklyWorkDays.includes(weekday)) {
    return { isLate: false, minutesLate: null as number | null };
  }

  const endAt = combineDateAndTime(
    toStartOfDay(currentDateTime),
    shift?.endTime ?? schedule.standardEndTime,
  );
  endAt.setMinutes(
    endAt.getMinutes() -
      (shift?.earlyExitGraceMinutes ?? policy.lateCheckOutGraceMinutes),
  );
  return {
    isLate: currentDateTime < endAt,
    minutesLate:
      currentDateTime < endAt
        ? differenceInMinutes(endAt, currentDateTime)
        : null,
  };
}

function toWeekday(date: Date): WorkWeekday {
  const days: WorkWeekday[] = [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
  ];

  return days[date.getDay()];
}

function mergeNotes(existing: string | null | undefined, incoming?: string) {
  const next = incoming?.trim();

  if (!next) {
    return existing ?? null;
  }

  if (!existing?.trim()) {
    return next;
  }

  return `${existing}\n${next}`;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function deriveManualStatus(
  checkIn: Date | undefined,
  checkOut: Date | undefined,
  isLateCheckIn: boolean,
  attendanceMode: AttendanceMode,
) {
  if (!checkIn) {
    return AttendanceEntryStatus.ABSENT;
  }

  if (checkIn && !checkOut) {
    return AttendanceEntryStatus.MISSED_CHECK_OUT;
  }

  if (attendanceMode === AttendanceMode.REMOTE || isLateCheckIn) {
    return AttendanceEntryStatus.LATE;
  }

  return AttendanceEntryStatus.PRESENT;
}

function resolveAttendanceExceptionType(entry: AttendanceEntryWithRelations) {
  if (entry.status === AttendanceEntryStatus.ABSENT) {
    return 'absence_without_leave' as const;
  }
  if (entry.status === AttendanceEntryStatus.MISSED_CHECK_OUT) {
    return 'missing_checkout' as const;
  }
  if (entry.status === AttendanceEntryStatus.LATE || entry.isLateCheckIn) {
    return 'late_check_in' as const;
  }
  return null;
}

function formatAttendanceRecordNumber(entry: AttendanceEntryWithRelations) {
  return `${entry.employee.employeeCode}-${entry.date.toISOString().slice(0, 10)}`;
}

function formatEmployeeName(employee: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}) {
  return [
    employee.preferredName || employee.firstName,
    employee.preferredName ? null : employee.lastName,
  ]
    .filter(Boolean)
    .join(' ');
}

function summaryQueryToAttendanceQuery(
  query: AttendanceSummaryQueryDto,
): AttendanceQueryDto {
  const anchor = query.date ? new Date(query.date) : new Date();
  const { dateFrom, dateTo } = resolveSummaryRange(anchor, query.view);

  return {
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
    page: 1,
    pageSize: 500,
    view: query.view,
  };
}

function resolveSummaryRange(anchor: Date, view: 'day' | 'week' | 'month') {
  const start = toStartOfDay(anchor);
  const end = toStartOfDay(anchor);

  if (view === 'day') {
    return { dateFrom: start, dateTo: end };
  }

  if (view === 'week') {
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    return { dateFrom: start, dateTo: end };
  }

  start.setDate(1);
  end.setMonth(start.getMonth() + 1, 0);
  return { dateFrom: start, dateTo: end };
}

function buildSummaryResponse(
  items: AttendanceEntryWithRelations[],
  view: 'day' | 'week' | 'month',
  anchorDate: string,
  options: { scope: 'mine' | 'team' | 'tenant' },
) {
  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      attendanceDate: string;
      entryCount: number;
      presentCount: number;
      lateCount: number;
      remoteCount: number;
      officeCount: number;
      missedCheckoutCount: number;
      workedMinutes: number;
    }
  >();

  for (const item of items) {
    const attendanceDate = item.date.toISOString().slice(0, 10);
    const key = bucketKey(item.date, view);
    const existing = buckets.get(key) ?? {
      key,
      label: bucketLabel(item.date, view),
      attendanceDate,
      entryCount: 0,
      presentCount: 0,
      lateCount: 0,
      remoteCount: 0,
      officeCount: 0,
      missedCheckoutCount: 0,
      workedMinutes: 0,
    };

    existing.entryCount += 1;
    if (item.status === AttendanceEntryStatus.PRESENT) {
      existing.presentCount += 1;
    }
    if (item.status === AttendanceEntryStatus.LATE || item.isLateCheckIn) {
      existing.lateCount += 1;
    }
    if (item.attendanceMode === AttendanceMode.REMOTE) {
      existing.remoteCount += 1;
    }
    if (item.attendanceMode === AttendanceMode.OFFICE) {
      existing.officeCount += 1;
    }
    if (item.status === AttendanceEntryStatus.MISSED_CHECK_OUT) {
      existing.missedCheckoutCount += 1;
    }
    if (item.checkIn && item.checkOut) {
      existing.workedMinutes += differenceInMinutes(
        item.checkOut,
        item.checkIn,
      );
    }

    buckets.set(key, existing);
  }

  const bucketItems = Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    workedLabel: formatDurationMinutes(bucket.workedMinutes),
  }));
  const totalWorkedMinutes = items.reduce((total, item) => {
    if (!item.checkIn || !item.checkOut) {
      return total;
    }
    return total + differenceInMinutes(item.checkOut, item.checkIn);
  }, 0);

  return {
    scope: options.scope,
    view,
    anchorDate,
    totals: {
      entries: items.length,
      present: items.filter(
        (item) => item.status === AttendanceEntryStatus.PRESENT,
      ).length,
      late: items.filter(
        (item) =>
          item.status === AttendanceEntryStatus.LATE || item.isLateCheckIn,
      ).length,
      remote: items.filter(
        (item) => item.attendanceMode === AttendanceMode.REMOTE,
      ).length,
      office: items.filter(
        (item) => item.attendanceMode === AttendanceMode.OFFICE,
      ).length,
      missedCheckout: items.filter(
        (item) => item.status === AttendanceEntryStatus.MISSED_CHECK_OUT,
      ).length,
      workedMinutes: totalWorkedMinutes,
      workedLabel: formatDurationMinutes(totalWorkedMinutes),
    },
    buckets: bucketItems,
  };
}

function bucketKey(date: Date, view: 'day' | 'week' | 'month') {
  const normalized = toStartOfDay(date);
  if (view === 'day') {
    return normalized.toISOString().slice(0, 10);
  }
  if (view === 'week') {
    const day = normalized.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    normalized.setDate(normalized.getDate() + diffToMonday);
    return normalized.toISOString().slice(0, 10);
  }
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
}

function bucketLabel(date: Date, view: 'day' | 'week' | 'month') {
  if (view === 'day') {
    return date.toLocaleDateString();
  }
  if (view === 'week') {
    const start = new Date(date);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function buildExportFileName(query: AttendanceQueryDto) {
  const from = query.dateFrom ?? currentDateKey();
  const to = query.dateTo ?? currentDateKey();
  return `attendance-${from}-to-${to}.csv`;
}

function buildAttendanceCsv(items: Array<Record<string, unknown>>) {
  const header = [
    'Employee',
    'Employee Code',
    'Date',
    'Check In',
    'Check Out',
    'Duration Minutes',
    'Mode',
    'Status',
    'Source',
    'Office Location',
    'Remote Address',
  ];

  const lines = [header.join(',')];

  for (const item of items) {
    const employee = item.employee as {
      fullName: string;
      employeeCode: string;
    };
    lines.push(
      [
        escapeCsv(employee.fullName),
        escapeCsv(employee.employeeCode),
        escapeCsv(scalarToString(item.attendanceDate).slice(0, 10)),
        escapeCsv(
          item.checkInAt
            ? new Date(scalarToString(item.checkInAt)).toISOString()
            : '',
        ),
        escapeCsv(
          item.checkOutAt
            ? new Date(scalarToString(item.checkOutAt)).toISOString()
            : '',
        ),
        escapeCsv(scalarToString(item.durationLabel)),
        escapeCsv(scalarToString(item.attendanceMode)),
        escapeCsv(scalarToString(item.status)),
        escapeCsv(scalarToString(item.source)),
        escapeCsv(
          scalarToString(
            (item.officeLocation as { name?: string } | null)?.name,
          ),
        ),
        escapeCsv(scalarToString(item.remoteAddressText)),
      ].join(','),
    );
  }

  return lines.join('\n');
}

function scalarToString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  return '';
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatDurationMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  }

  return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} ${
    minutes === 1 ? 'min' : 'mins'
  }`;
}

function businessDateAtUtcMidnight(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatBusinessDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseLocationCapturedAt(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      'Location captured timestamp must be a valid ISO timestamp.',
    );
  }
  return parsed;
}

function isSelfServiceAttendanceMode(
  value: AttendanceMode,
): value is
  | typeof AttendanceMode.OFFICE
  | typeof AttendanceMode.REMOTE
  | typeof AttendanceMode.HYBRID {
  return (
    value === AttendanceMode.OFFICE ||
    value === AttendanceMode.REMOTE ||
    value === AttendanceMode.HYBRID
  );
}

function isAttendanceCreateConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function validateImportFile(file: UploadedFile | undefined) {
  if (!file) {
    throw new BadRequestException(
      'CSV file is required for attendance import.',
    );
  }

  if (
    !ATTENDANCE_IMPORT_MIME_TYPES.includes(file.mimetype) &&
    !file.originalname.toLowerCase().endsWith('.csv')
  ) {
    throw new BadRequestException(
      'Attendance import currently supports CSV files only.',
    );
  }

  return file;
}

type ParsedCsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

function parseCsv(content: string): ParsedCsvRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new BadRequestException(
      'Attendance CSV must include a header row and at least one data row.',
    );
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex]?.trim() ?? '';
    });
    return {
      rowNumber: index + 2,
      values: record,
    };
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function resolveEmployeeFromImportRow(
  row: ParsedCsvRow,
  employeeByCode: Map<string, { id: string; employeeCode: string }>,
  employeeByEmail: Map<string, { id: string; workEmail?: string | null }>,
) {
  const employeeCode = row.values.employeeCode?.toLowerCase();
  const workEmail = row.values.workEmail?.toLowerCase();

  if (employeeCode && employeeByCode.has(employeeCode)) {
    return employeeByCode.get(employeeCode) ?? null;
  }

  if (workEmail && employeeByEmail.has(workEmail)) {
    return employeeByEmail.get(workEmail) ?? null;
  }

  return null;
}

function parseAttendanceMode(value: string | undefined) {
  switch ((value ?? '').trim().toUpperCase()) {
    case 'REMOTE':
      return AttendanceMode.REMOTE;
    case 'HYBRID':
      return AttendanceMode.HYBRID;
    case 'MACHINE':
      return AttendanceMode.MACHINE;
    case 'MANUAL':
      return AttendanceMode.MANUAL;
    case 'OFFICE':
    default:
      return AttendanceMode.OFFICE;
  }
}

function parseAttendanceStatus(value: string | undefined) {
  const normalized = (value ?? '').trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized in AttendanceEntryStatus) {
    return normalized as AttendanceEntryStatus;
  }

  return null;
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapCorrectionApprovalStatus(status: AttendanceCorrectionStatus) {
  switch (status) {
    case AttendanceCorrectionStatus.APPROVED:
      return ApprovalRequestStatus.APPROVED;
    case AttendanceCorrectionStatus.REJECTED:
      return ApprovalRequestStatus.REJECTED;
    case AttendanceCorrectionStatus.RETURNED:
      return ApprovalRequestStatus.RETURNED;
    case AttendanceCorrectionStatus.CANCELLED:
      return ApprovalRequestStatus.CANCELLED;
    case AttendanceCorrectionStatus.DRAFT:
      return ApprovalRequestStatus.DRAFT;
    default:
      return ApprovalRequestStatus.PENDING;
  }
}

function mapCorrectionStepStatus(status: AttendanceCorrectionStatus) {
  switch (status) {
    case AttendanceCorrectionStatus.APPROVED:
      return GenericApprovalStepStatus.APPROVED;
    case AttendanceCorrectionStatus.REJECTED:
      return GenericApprovalStepStatus.REJECTED;
    case AttendanceCorrectionStatus.RETURNED:
      return GenericApprovalStepStatus.RETURNED;
    case AttendanceCorrectionStatus.CANCELLED:
      return GenericApprovalStepStatus.SKIPPED;
    case AttendanceCorrectionStatus.DRAFT:
      return GenericApprovalStepStatus.NOT_STARTED;
    default:
      return GenericApprovalStepStatus.PENDING;
  }
}

function mapCorrectionAssignmentStatus(status: AttendanceCorrectionStatus) {
  switch (status) {
    case AttendanceCorrectionStatus.APPROVED:
      return ApprovalAssignmentStatus.APPROVED;
    case AttendanceCorrectionStatus.REJECTED:
      return ApprovalAssignmentStatus.REJECTED;
    case AttendanceCorrectionStatus.RETURNED:
      return ApprovalAssignmentStatus.RETURNED;
    case AttendanceCorrectionStatus.CANCELLED:
      return ApprovalAssignmentStatus.SUPERSEDED;
    default:
      return ApprovalAssignmentStatus.PENDING;
  }
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}
