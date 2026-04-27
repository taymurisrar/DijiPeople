import {
  Prisma,
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceImportBatchStatus,
  AttendanceMode,
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
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import {
  AttendanceEntryWithRelations,
  AttendanceRepository,
} from './attendance.repository';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateAttendanceIntegrationDto } from './dto/create-attendance-integration.dto';
import { CreateManualAttendanceEntryDto } from './dto/create-manual-attendance-entry.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
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
  allowedModes: AttendanceMode[];
};

const ATTENDANCE_IMPORT_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
];

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly auditService: AuditService,
  ) {}

  async checkIn(currentUser: AuthenticatedUser, dto: CheckInDto) {
    const employee = await this.getCurrentEmployee(currentUser);
    const now = new Date();
    const attendanceDate = toStartOfDay(now);

    const [existingOpenEntry, workSchedule, policy] = await Promise.all([
      this.attendanceRepository.findOpenAttendanceEntry(
        currentUser.tenantId,
        employee.id,
      ),
      this.attendanceRepository.findDefaultWorkSchedule(currentUser.tenantId),
      this.resolvePolicy(currentUser.tenantId),
    ]);

    if (existingOpenEntry) {
      throw new ConflictException(
        'You already have an active attendance session. Please check out first.',
      );
    }

    const attendanceMode = dto.attendanceMode ?? AttendanceMode.OFFICE;
    const officeLocation = await this.validateModeAndLocation(
      currentUser.tenantId,
      attendanceMode,
      policy,
      dto.officeLocationId,
      dto.remoteLatitude,
      dto.remoteLongitude,
    );

    const lateCheckIn = resolveLateCheckIn(workSchedule, policy, now);
    let entry: AttendanceEntryWithRelations;
    try {
      entry = await this.attendanceRepository.createAttendanceEntry({
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        workScheduleId: workSchedule?.id,
        officeLocationId: officeLocation?.id,
        date: attendanceDate,
        checkIn: now,
        attendanceMode,
        status: lateCheckIn.isLate
          ? AttendanceEntryStatus.LATE
          : AttendanceEntryStatus.PRESENT,
        source: AttendanceEntrySource.SYSTEM,
        checkInNote: normalizeOptionalText(dto.note),
        workSummary: normalizeOptionalText(dto.workSummary),
        notes: mergeNotes(undefined, dto.note),
        remoteLatitude: dto.remoteLatitude,
        remoteLongitude: dto.remoteLongitude,
        remoteAddressText: normalizeOptionalText(dto.remoteAddressText),
        isLateCheckIn: lateCheckIn.isLate,
        lateCheckInMinutes: lateCheckIn.minutesLate,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      if (isAttendanceCreateConflict(error)) {
        throw new ConflictException(
          'Attendance could not be created because an older one-entry-per-day database rule is still active. Apply the latest attendance migration and try again.',
        );
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

    return this.mapAttendanceEntry(entry, currentUser);
  }

  async checkOut(currentUser: AuthenticatedUser, dto: CheckOutDto) {
    const employee = await this.getCurrentEmployee(currentUser);
    const now = new Date();
    const existing = await this.attendanceRepository.findOpenAttendanceEntry(
      currentUser.tenantId,
      employee.id,
    );

    if (!existing?.checkIn) {
      throw new BadRequestException('No active check-in was found.');
    }

    if (now < existing.checkIn) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    const [workSchedule, policy] = await Promise.all([
      this.attendanceRepository.findDefaultWorkSchedule(currentUser.tenantId),
      this.resolvePolicy(currentUser.tenantId),
    ]);

    const lateCheckOut = resolveLateCheckOut(workSchedule, policy, now);
    const updated = await this.attendanceRepository.updateAttendanceEntry(
      currentUser.tenantId,
      existing.id,
      {
        checkOut: now,
        checkOutNote: normalizeOptionalText(dto.note),
        workSummary: normalizeOptionalText(dto.workSummary) ?? existing.workSummary,
        notes: mergeNotes(existing.notes, dto.note),
        remoteLatitude: dto.remoteLatitude ?? existing.remoteLatitude,
        remoteLongitude: dto.remoteLongitude ?? existing.remoteLongitude,
        remoteAddressText:
          normalizeOptionalText(dto.remoteAddressText) ??
          existing.remoteAddressText,
        isLateCheckOut: lateCheckOut.isLate,
        lateCheckOutMinutes: lateCheckOut.minutesLate,
        status:
          existing.status === AttendanceEntryStatus.MISSED_CHECK_OUT
            ? AttendanceEntryStatus.PRESENT
            : existing.status,
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

    return this.mapAttendanceList(result.items, result.total, query, {
      scope: 'mine',
      employeeId: employee.id,
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

  async listTeamAttendance(
    currentUser: AuthenticatedUser,
    query: AttendanceQueryDto,
  ) {
    const canManageAll = currentUser.permissionKeys.includes('attendance.manage');
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser.tenantId, query)
      : await this.resolveDirectReportEmployeeIds(currentUser, query);

    if (employeeIds.length === 0) {
      return this.mapAttendanceList([], 0, query, {
        scope: canManageAll ? 'tenant' : 'team',
        employeeId: query.employeeId ?? null,
      });
    }

    const result = await this.attendanceRepository.findAttendancePage(
      currentUser.tenantId,
      query,
      { employeeId: { in: employeeIds } },
    );

    return this.mapAttendanceList(result.items, result.total, query, {
      scope: canManageAll ? 'tenant' : 'team',
      employeeId: query.employeeId ?? null,
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

    return buildSummaryResponse(items, query.view, query.date ?? currentDateKey(), {
      scope: 'mine',
    });
  }

  async getTeamAttendanceSummary(
    currentUser: AuthenticatedUser,
    query: AttendanceSummaryQueryDto,
  ) {
    const canManageAll = currentUser.permissionKeys.includes('attendance.manage');
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser.tenantId, {})
      : await this.resolveDirectReportEmployeeIds(currentUser, {});

    if (employeeIds.length === 0) {
      return buildSummaryResponse([], query.view, query.date ?? currentDateKey(), {
        scope: canManageAll ? 'tenant' : 'team',
      });
    }

    const rangeQuery = summaryQueryToAttendanceQuery(query);
    const items = await this.attendanceRepository.findAttendanceForSummary(
      currentUser.tenantId,
      rangeQuery,
      { employeeId: { in: employeeIds } },
    );

    return buildSummaryResponse(items, query.view, query.date ?? currentDateKey(), {
      scope: canManageAll ? 'tenant' : 'team',
    });
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

    const employee = await this.employeesRepository.findHierarchyNodeByIdAndTenant(
      currentUser.tenantId,
      dto.employeeId,
    );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }

    const attendanceDate = toStartOfDay(new Date(dto.date));
    const existing = await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
      currentUser.tenantId,
      dto.employeeId,
      attendanceDate,
    );

    if (existing) {
      throw new ConflictException(
        'An attendance entry already exists for this employee on this date.',
      );
    }

    const [workSchedule, officeLocation] = await Promise.all([
      this.attendanceRepository.findDefaultWorkSchedule(currentUser.tenantId),
      this.validateModeAndLocation(
        currentUser.tenantId,
        dto.attendanceMode,
        policy,
        dto.officeLocationId,
        dto.remoteLatitude,
        dto.remoteLongitude,
      ),
    ]);

    const checkIn = dto.checkInTime
      ? combineDateAndTime(attendanceDate, dto.checkInTime)
      : undefined;
    const checkOut = dto.checkOutTime
      ? combineDateAndTime(attendanceDate, dto.checkOutTime)
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
      ? resolveLateCheckIn(workSchedule, policy, checkIn)
      : { isLate: false, minutesLate: null };
    const lateCheckOut = checkOut
      ? resolveLateCheckOut(workSchedule, policy, checkOut)
      : { isLate: false, minutesLate: null };

    const entry = await this.attendanceRepository.createAttendanceEntry({
      tenantId: currentUser.tenantId,
      employeeId: dto.employeeId,
      workScheduleId: workSchedule?.id,
      officeLocationId: officeLocation?.id,
      date: attendanceDate,
      checkIn,
      checkOut,
      attendanceMode: dto.attendanceMode,
      status:
        dto.status ??
        deriveManualStatus(checkIn, checkOut, lateCheckIn.isLate, dto.attendanceMode),
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
    const employee = await this.employeesRepository.findHierarchyNodeByIdAndTenant(
      currentUser.tenantId,
      targetEmployeeId,
    );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }

    const attendanceDate = dto.date
      ? toStartOfDay(new Date(dto.date))
      : existing.date;

    if (
      targetEmployeeId !== existing.employeeId ||
      attendanceDate.getTime() !== existing.date.getTime()
    ) {
      const duplicate = await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
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

    const [workSchedule, officeLocation] = await Promise.all([
      this.attendanceRepository.findDefaultWorkSchedule(currentUser.tenantId),
      this.validateModeAndLocation(
        currentUser.tenantId,
        dto.attendanceMode ?? existing.attendanceMode,
        policy,
        dto.officeLocationId ?? existing.officeLocationId ?? undefined,
        dto.remoteLatitude ?? existing.remoteLatitude ?? undefined,
        dto.remoteLongitude ?? existing.remoteLongitude ?? undefined,
      ),
    ]);

    const checkIn = dto.checkInTime
      ? combineDateAndTime(attendanceDate, dto.checkInTime)
      : dto.checkInTime === undefined
        ? existing.checkIn ?? undefined
        : undefined;
    const checkOut = dto.checkOutTime
      ? combineDateAndTime(attendanceDate, dto.checkOutTime)
      : dto.checkOutTime === undefined
        ? existing.checkOut ?? undefined
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
      ? resolveLateCheckIn(workSchedule, policy, checkIn)
      : { isLate: false, minutesLate: null };
    const lateCheckOut = checkOut
      ? resolveLateCheckOut(workSchedule, policy, checkOut)
      : { isLate: false, minutesLate: null };

    const updated = await this.attendanceRepository.updateAttendanceEntry(
      currentUser.tenantId,
      existing.id,
      {
        employeeId: targetEmployeeId,
        date: attendanceDate,
        checkIn,
        checkOut,
        workScheduleId: workSchedule?.id,
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

    return this.mapAttendanceEntry(updated, currentUser);
  }

  async exportAttendance(
    currentUser: AuthenticatedUser,
    query: AttendanceQueryDto,
  ) {
    const canManageAll = currentUser.permissionKeys.includes('attendance.manage');
    const employeeIds = canManageAll
      ? await this.resolveAllTenantEmployeeIds(currentUser.tenantId, query)
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
      csv: buildAttendanceCsv(items.map((item) => this.mapAttendanceEntry(item))),
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

    const employees = await this.employeesRepository.findByTenant(currentUser.tenantId, {
      page: 1,
      pageSize: 1000,
      search: undefined,
      employmentStatus: undefined,
      reportingManagerEmployeeId: undefined,
    });

    const employeeByCode = new Map(
      employees.items.map((employee) => [employee.employeeCode.toLowerCase(), employee]),
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
        await this.importRow(currentUser, batch.id, row, employeeByCode, employeeByEmail);
        successCount += 1;
      } catch (error) {
        rowErrors.push({
          row: row.rowNumber,
          message: error instanceof Error ? error.message : 'Invalid row.',
        });
      }
    }

    const failedCount = rowErrors.length;
    await this.attendanceRepository.updateImportBatch(currentUser.tenantId, batch.id, {
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
    });

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
    const integrations = await this.attendanceRepository.listAttendanceIntegrations(
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
    const integration = await this.attendanceRepository.createAttendanceIntegration({
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
    const existing = await this.attendanceRepository.findAttendanceIntegrationById(
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

    const updated = await this.attendanceRepository.findAttendanceIntegrationById(
      currentUser.tenantId,
      integrationId,
    );

    if (!updated) {
      throw new NotFoundException('Attendance integration could not be reloaded.');
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
        requireOfficeLocationForOfficeMode: dto.requireOfficeLocationForOfficeMode,
        requireRemoteLocationForRemoteMode: dto.requireRemoteLocationForRemoteMode,
        allowRemoteWithoutLocation: dto.allowRemoteWithoutLocation,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      {
        lateCheckInGraceMinutes: dto.lateCheckInGraceMinutes,
        lateCheckOutGraceMinutes: dto.lateCheckOutGraceMinutes,
        requireOfficeLocationForOfficeMode: dto.requireOfficeLocationForOfficeMode,
        requireRemoteLocationForRemoteMode: dto.requireRemoteLocationForRemoteMode,
        allowRemoteWithoutLocation: dto.allowRemoteWithoutLocation,
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

  private async importRow(
    currentUser: AuthenticatedUser,
    batchId: string,
    row: ParsedCsvRow,
    employeeByCode: Map<string, { id: string; employeeCode: string }>,
    employeeByEmail: Map<string, { id: string; workEmail?: string | null }>,
  ) {
    const employee = resolveEmployeeFromImportRow(row, employeeByCode, employeeByEmail);

    if (!employee) {
      throw new BadRequestException(
        'Employee could not be matched from employeeCode or workEmail.',
      );
    }

    const dateValue = row.values.date;
    if (!dateValue) {
      throw new BadRequestException('date is required.');
    }

    const attendanceDate = toStartOfDay(new Date(dateValue));
    if (Number.isNaN(attendanceDate.getTime())) {
      throw new BadRequestException('date must be a valid ISO date.');
    }

    const existing = await this.attendanceRepository.findAttendanceEntryByEmployeeAndDate(
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
        deriveManualStatus(checkIn, checkOut, lateCheckIn.isLate, attendanceMode),
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

  private async resolvePolicy(tenantId: string) {
    const attendanceSettings =
      await this.tenantSettingsResolverService.getAttendanceSettings(tenantId);
    const policy = await this.attendanceRepository.findAttendancePolicy(tenantId);

    return {
      lateCheckInGraceMinutes:
        policy?.lateCheckInGraceMinutes ?? attendanceSettings.defaultGraceMinutes,
      lateCheckOutGraceMinutes:
        policy?.lateCheckOutGraceMinutes ?? attendanceSettings.defaultGraceMinutes,
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
  ) {
    if (!policy.allowedModes.includes(attendanceMode)) {
      throw new BadRequestException(
        `Attendance mode ${attendanceMode} is disabled for this tenant.`,
      );
    }

    if (attendanceMode === AttendanceMode.OFFICE) {
      if (!officeLocationId && policy.requireOfficeLocationForOfficeMode) {
        throw new BadRequestException(
          'Office location is required for office attendance.',
        );
      }

      if (!officeLocationId) {
        return null;
      }

      const officeLocation = await this.attendanceRepository.findOfficeLocationById(
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
      attendanceMode === AttendanceMode.REMOTE &&
      policy.requireRemoteLocationForRemoteMode &&
      !policy.allowRemoteWithoutLocation &&
      (remoteLatitude === undefined || remoteLongitude === undefined)
    ) {
      throw new BadRequestException(
        'Remote attendance requires browser location for this tenant.',
      );
    }

    return null;
  }

  private async resolveAllTenantEmployeeIds(
    tenantId: string,
    query: Partial<AttendanceQueryDto>,
  ) {
    if (query.employeeId) {
      const employee = await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        tenantId,
        query.employeeId,
      );

      if (!employee) {
        throw new BadRequestException(
          'Selected employee does not belong to this tenant.',
        );
      }

      return [employee.id];
    }

    const employees = await this.employeesRepository.findByTenant(tenantId, {
      page: 1,
      pageSize: 1000,
      search: undefined,
      employmentStatus: undefined,
      reportingManagerEmployeeId: undefined,
    });

    let items = employees.items;

    if (query.departmentId) {
      items = items.filter((employee) => employee.departmentId === query.departmentId);
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
      ? directReports.filter((employee) => employee.department?.id === query.departmentId)
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

  private mapAttendanceList(
    items: AttendanceEntryWithRelations[],
    total: number,
    query: AttendanceQueryDto,
    filters: {
      scope: 'mine' | 'team' | 'tenant';
      employeeId: string | null;
    },
  ) {
    return {
      items: items.map((item) => this.mapAttendanceEntry(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
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
    const hasCheckoutPermission =
      currentUser?.permissionKeys.includes('attendance.checkout') ?? false;
    const canCurrentUserCheckOut =
      isCurrentUsersEntry &&
      entry.checkIn !== null &&
      entry.checkOut === null &&
      hasCheckoutPermission;
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
      checkInNote: entry.checkInNote,
      checkOutNote: entry.checkOutNote,
      workSummary: entry.workSummary,
      notes: entry.notes,
      remoteLatitude: entry.remoteLatitude,
      remoteLongitude: entry.remoteLongitude,
      remoteAddressText: entry.remoteAddressText,
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
      importedBatch: entry.importedBatch,
      canCurrentUserEdit:
        currentUser?.permissionKeys.includes('attendance.manage') ?? false,
      canCurrentUserCheckOut,
      checkOutBlockedReason: canCurrentUserCheckOut
        ? null
        : resolveCheckOutBlockedReason(
            currentUser,
            isCurrentUsersEntry,
            hasCheckoutPermission,
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
  hasCheckoutPermission: boolean,
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

  if (!hasCheckoutPermission) {
    return 'Your current role does not include attendance checkout access yet. Ask an administrator to refresh tenant role permissions or sign in again after the update.';
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
    schedule.standardStartTime,
  );
  startAt.setMinutes(startAt.getMinutes() + policy.lateCheckInGraceMinutes);
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
    schedule.standardEndTime,
  );
  endAt.setMinutes(endAt.getMinutes() + policy.lateCheckOutGraceMinutes);
  const minutesLate = differenceInMinutes(currentDateTime, endAt);

  return {
    isLate: currentDateTime > endAt,
    minutesLate: currentDateTime > endAt ? minutesLate : null,
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

function summaryQueryToAttendanceQuery(query: AttendanceSummaryQueryDto): AttendanceQueryDto {
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
      existing.workedMinutes += differenceInMinutes(item.checkOut, item.checkIn);
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
      present: items.filter((item) => item.status === AttendanceEntryStatus.PRESENT).length,
      late: items.filter((item) => item.status === AttendanceEntryStatus.LATE || item.isLateCheckIn).length,
      remote: items.filter((item) => item.attendanceMode === AttendanceMode.REMOTE).length,
      office: items.filter((item) => item.attendanceMode === AttendanceMode.OFFICE).length,
      missedCheckout: items.filter((item) => item.status === AttendanceEntryStatus.MISSED_CHECK_OUT).length,
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
    const employee = item.employee as { fullName: string; employeeCode: string };
    lines.push(
      [
        escapeCsv(employee.fullName),
        escapeCsv(employee.employeeCode),
        escapeCsv(String(item.attendanceDate ?? '').slice(0, 10)),
        escapeCsv(item.checkInAt ? new Date(String(item.checkInAt)).toISOString() : ''),
        escapeCsv(item.checkOutAt ? new Date(String(item.checkOutAt)).toISOString() : ''),
        escapeCsv(String(item.durationLabel ?? '')),
        escapeCsv(String(item.attendanceMode ?? '')),
        escapeCsv(String(item.status ?? '')),
        escapeCsv(String(item.source ?? '')),
        escapeCsv(String((item.officeLocation as { name?: string } | null)?.name ?? '')),
        escapeCsv(String(item.remoteAddressText ?? '')),
      ].join(','),
    );
  }

  return lines.join('\n');
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

function isAttendanceCreateConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function validateImportFile(file: UploadedFile | undefined) {
  if (!file) {
    throw new BadRequestException('CSV file is required for attendance import.');
  }

  if (
    !ATTENDANCE_IMPORT_MIME_TYPES.includes(file.mimetype) &&
    !file.originalname.toLowerCase().endsWith('.csv')
  ) {
    throw new BadRequestException('Attendance import currently supports CSV files only.');
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
    throw new BadRequestException('Attendance CSV must include a header row and at least one data row.');
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

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}
