import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TimesheetExportFormat,
  TimesheetExportStatus,
} from '@prisma/client';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimesheetAuditSettingsService } from './timesheet-audit-settings.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { CreateTimesheetExportDto } from './dto/timesheet-export.dto';
import { toDisplayString } from '../../common/utils/display-string';

type ExportArtifact = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  rowCount: number;
};

const exportColumns = [
  { key: 'employeeCode', header: 'Employee Code', width: 18 },
  { key: 'employeeName', header: 'Employee', width: 28 },
  { key: 'period', header: 'Period', width: 12 },
  { key: 'week', header: 'Week', width: 8 },
  { key: 'date', header: 'Date', width: 13 },
  { key: 'day', header: 'Day', width: 12 },
  { key: 'dayType', header: 'Day Type', width: 20 },
  { key: 'holiday', header: 'Holiday', width: 24 },
  { key: 'leave', header: 'Leave', width: 24 },
  { key: 'expectedHours', header: 'Expected Hours', width: 16 },
  { key: 'attendanceHours', header: 'Attendance Hours', width: 18 },
  { key: 'timesheetHours', header: 'Timesheet Hours', width: 18 },
  { key: 'varianceMinutes', header: 'Variance Minutes', width: 18 },
  { key: 'projectCode', header: 'Project Code', width: 18 },
  { key: 'projectName', header: 'Project', width: 28 },
  { key: 'task', header: 'Task', width: 20 },
  { key: 'activity', header: 'Activity', width: 20 },
  { key: 'workLocation', header: 'Work Location', width: 20 },
  { key: 'costCenter', header: 'Cost Center', width: 18 },
  { key: 'billable', header: 'Billable', width: 12 },
  { key: 'source', header: 'Source', width: 14 },
  { key: 'entryStatus', header: 'Entry Status', width: 16 },
  { key: 'weekStatus', header: 'Week Status', width: 20 },
  { key: 'payrollStatus', header: 'Payroll Status', width: 20 },
  { key: 'notes', header: 'Notes', width: 48 },
] as const;

@Injectable()
export class TimesheetExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelExportService,
    private readonly tenantSettings: TenantSettingsResolverService,
    private readonly auditService: AuditService,
    private readonly timesheetAuditSettings: TimesheetAuditSettingsService,
  ) {}

  async exportCurrent(
    user: AuthenticatedUser,
    timesheetId: string,
    format: TimesheetExportFormat,
  ) {
    const dto: CreateTimesheetExportDto = {
      exportType: 'CURRENT',
      format,
      timesheetIds: [timesheetId],
    };
    const where = await this.buildWhere(user, dto);
    const count = await this.prisma.timesheet.count({ where });
    if (!count)
      throw new NotFoundException(
        'Timesheet was not found or is outside your access scope.',
      );
    const artifact = await this.generate(where, format, user.tenantId, {
      filters: dto,
      requestedBy: user.userId,
    });
    await this.auditExport(
      user,
      'TIMESHEET_EXPORT_DOWNLOADED',
      null,
      dto,
      artifact.rowCount,
    );
    return artifact;
  }

  async requestExport(user: AuthenticatedUser, dto: CreateTimesheetExportDto) {
    if (dto.exportType === 'SELECTED' && !dto.timesheetIds?.length) {
      throw new BadRequestException('Select at least one timesheet.');
    }
    const where = await this.buildWhere(user, dto);
    const [timesheetCount, rowCount, settings] = await Promise.all([
      this.prisma.timesheet.count({ where }),
      this.prisma.timesheetEntry.count({
        where: { tenantId: user.tenantId, timesheet: where },
      }),
      this.tenantSettings.getTimesheetSettingsForBusinessUnit(
        user.tenantId,
        dto.businessUnitId,
      ),
    ]);
    if (!timesheetCount)
      throw new NotFoundException(
        'No accessible timesheets match this export.',
      );
    const request = await this.prisma.timesheetExportRequest.create({
      data: {
        tenantId: user.tenantId,
        requestedById: user.userId,
        exportType: dto.exportType,
        filters: toJson(dto),
        format: dto.format,
        rowCount,
        expiresAt: addDays(new Date(), settings.exportRetentionDays),
      },
    });
    await this.auditExport(
      user,
      'TIMESHEET_EXPORT_REQUESTED',
      request.id,
      dto,
      rowCount,
    );
    const threshold = settings.largeExportRowThreshold;
    if (rowCount <= threshold)
      await this.executeRequest(user.tenantId, request.id);
    return this.getRequest(user, request.id);
  }

  async listRequests(user: AuthenticatedUser) {
    const items = await this.prisma.timesheetExportRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.permissionKeys.includes('timesheets.read.all')
          ? {}
          : { requestedById: user.userId }),
      },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return { items: items.map(stripFileReference) };
  }

  async getRequest(user: AuthenticatedUser, requestId: string) {
    const item = await this.findRequest(user, requestId);
    return { item: stripFileReference(item) };
  }

  async download(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<ExportArtifact> {
    const item = await this.findRequest(user, requestId);
    if (
      item.status !== TimesheetExportStatus.COMPLETED ||
      !item.fileReference ||
      !item.fileName ||
      !item.contentType
    ) {
      throw new BadRequestException(
        `Export is ${item.status.toLowerCase()} and cannot be downloaded.`,
      );
    }
    if (item.expiresAt && item.expiresAt < new Date()) {
      await this.prisma.timesheetExportRequest.update({
        where: { id: item.id },
        data: { status: TimesheetExportStatus.EXPIRED, fileReference: null },
      });
      throw new BadRequestException('This export has expired. Run it again.');
    }
    await this.auditExport(
      user,
      'TIMESHEET_EXPORT_DOWNLOADED',
      item.id,
      item.filters,
      item.rowCount,
    );
    return {
      buffer: Buffer.from(item.fileReference, 'base64'),
      fileName: item.fileName,
      contentType: item.contentType,
      rowCount: item.rowCount,
    };
  }

  async executeRequest(tenantId: string, requestId: string) {
    const request = await this.prisma.timesheetExportRequest.findFirst({
      where: { id: requestId, tenantId },
    });
    if (!request) throw new NotFoundException('Export request was not found.');
    if (request.status === TimesheetExportStatus.COMPLETED) return request;
    if (
      !(
        [
          TimesheetExportStatus.QUEUED,
          TimesheetExportStatus.FAILED,
        ] as TimesheetExportStatus[]
      ).includes(request.status)
    )
      return request;
    await this.prisma.timesheetExportRequest.update({
      where: { id: request.id },
      data: { status: TimesheetExportStatus.PROCESSING, failureReason: null },
    });
    try {
      const dto = fromJson(request.filters, request.format);
      const where = await this.buildWhereForStoredRequest(
        tenantId,
        request.requestedById,
        dto,
      );
      const artifact = await this.generate(where, request.format, tenantId, {
        filters: dto,
        requestedBy: request.requestedById,
      });
      return await this.prisma.timesheetExportRequest.update({
        where: { id: request.id },
        data: {
          status: TimesheetExportStatus.COMPLETED,
          rowCount: artifact.rowCount,
          fileReference: artifact.buffer.toString('base64'),
          fileName: artifact.fileName,
          contentType: artifact.contentType,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.timesheetExportRequest.update({
        where: { id: request.id },
        data: {
          status: TimesheetExportStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : 'Export failed.',
        },
      });
      throw error;
    }
  }

  async processQueued(tenantId: string) {
    const queued = await this.prisma.timesheetExportRequest.findMany({
      where: {
        tenantId,
        status: {
          in: [TimesheetExportStatus.QUEUED, TimesheetExportStatus.FAILED],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    const results: Array<{ id: string; status: string }> = [];
    for (const request of queued) {
      try {
        const completed = await this.executeRequest(tenantId, request.id);
        results.push({ id: request.id, status: completed.status });
      } catch {
        results.push({ id: request.id, status: TimesheetExportStatus.FAILED });
      }
    }
    return results;
  }

  async expireFiles(tenantId: string) {
    return this.prisma.timesheetExportRequest.updateMany({
      where: {
        tenantId,
        expiresAt: { lt: new Date() },
        status: TimesheetExportStatus.COMPLETED,
      },
      data: { status: TimesheetExportStatus.EXPIRED, fileReference: null },
    });
  }

  private async generate(
    where: Prisma.TimesheetWhereInput,
    format: TimesheetExportFormat,
    tenantId: string,
    criteria: { filters: unknown; requestedBy: string },
  ): Promise<ExportArtifact> {
    const timesheets = await this.prisma.timesheet.findMany({
      where: { tenantId, AND: [where] },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        weeks: {
          include: {
            days: {
              include: {
                entries: {
                  include: { project: { select: { code: true, name: true } } },
                },
              },
              orderBy: { date: 'asc' },
            },
          },
          orderBy: { weekNumber: 'asc' },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { employee: { employeeCode: 'asc' } }],
    });
    const rows = timesheets.flatMap((timesheet) =>
      timesheet.weeks.flatMap((week) =>
        week.days.flatMap((day) => {
          const entries = day.entries.length ? day.entries : [null];
          return entries.map((entry) => ({
            employeeCode: safe(timesheet.employee.employeeCode),
            employeeName: safe(
              `${timesheet.employee.firstName} ${timesheet.employee.lastName}`,
            ),
            period: `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
            week: week.weekNumber,
            date: dateKey(day.date),
            day: day.dayOfWeek,
            dayType: day.dayType,
            holiday: safe(day.holidayName),
            leave: safe(day.leaveTypeName),
            expectedHours: Number(day.expectedHours),
            attendanceHours: Number(day.attendanceHours),
            timesheetHours: entry ? Number(entry.hours) : 0,
            varianceMinutes: day.varianceMinutes,
            projectCode: safe(entry?.project?.code),
            projectName: safe(entry?.project?.name),
            task: safe(entry?.taskId),
            activity: safe(entry?.activityTypeId ?? entry?.activityCode),
            workLocation: safe(entry?.workLocationId),
            costCenter: safe(entry?.costCenterId),
            billable: entry?.billableFlag ? 'Yes' : 'No',
            source: entry?.source ?? '',
            entryStatus: entry?.approvalStatus ?? '',
            weekStatus: week.status,
            payrollStatus: timesheet.payrollStatus,
            notes: safe(entry?.note ?? entry?.description),
          }));
        }),
      ),
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === TimesheetExportFormat.XLSX) {
      const approvalIds = timesheets.flatMap((timesheet) =>
        timesheet.weeks
          .map((week) => week.approvalRequestId)
          .filter((id): id is string => Boolean(id)),
      );
      const approvals = approvalIds.length
        ? await this.prisma.approvalRequest.findMany({
            where: { tenantId, id: { in: approvalIds } },
            include: {
              actions: {
                include: {
                  actionByUser: { select: { firstName: true, lastName: true } },
                },
                orderBy: { actionAtUtc: 'asc' },
              },
            },
          })
        : [];
      const summaryRows = timesheets.map((timesheet) => ({
        employeeCode: safe(timesheet.employee.employeeCode),
        employeeName: safe(
          `${timesheet.employee.firstName} ${timesheet.employee.lastName}`,
        ),
        period: `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
        status: timesheet.status,
        completion: Number(timesheet.completionPercentage),
        requiredHours: Number(timesheet.requiredHours),
        enteredHours: Number(timesheet.enteredHours),
        leaveHours: Number(timesheet.approvedLeaveHours),
        overtimeHours: Number(timesheet.overtimeHours),
        payrollStatus: timesheet.payrollStatus,
      }));
      const approvalRows = approvals.flatMap((approval) =>
        approval.actions.map((action) => ({
          requestNumber: approval.requestNumber ?? approval.id,
          title: safe(approval.title),
          requestStatus: approval.status,
          action: action.actionType,
          actor: safe(
            `${action.actionByUser.firstName} ${action.actionByUser.lastName}`,
          ),
          actionDate: action.actionAtUtc,
          comment: safe(action.comment),
        })),
      );
      const criteriaRows = [
        { criterion: 'Tenant', value: tenantId },
        { criterion: 'Requested By', value: criteria.requestedBy },
        { criterion: 'Requested At', value: new Date().toISOString() },
        { criterion: 'Filters', value: JSON.stringify(criteria.filters) },
        { criterion: 'Record Count', value: String(timesheets.length) },
        { criterion: 'Detail Row Count', value: String(rows.length) },
      ];
      return {
        buffer: this.excel.buildWorkbookBuffer({
          sheets: [
            {
              name: 'Summary',
              columns: [
                { key: 'employeeCode', header: 'Employee Code', width: 18 },
                { key: 'employeeName', header: 'Employee', width: 28 },
                { key: 'period', header: 'Period', width: 12 },
                { key: 'status', header: 'Status', width: 18 },
                { key: 'completion', header: 'Completion %', width: 16 },
                { key: 'requiredHours', header: 'Required Hours', width: 16 },
                { key: 'enteredHours', header: 'Entered Hours', width: 16 },
                { key: 'leaveHours', header: 'Leave Hours', width: 16 },
                { key: 'overtimeHours', header: 'Overtime Hours', width: 16 },
                { key: 'payrollStatus', header: 'Payroll Status', width: 20 },
              ],
              rows: summaryRows,
            },
            { name: 'Daily Detail', columns: exportColumns, rows },
            {
              name: 'Approval History',
              columns: [
                { key: 'requestNumber', header: 'Request', width: 28 },
                { key: 'title', header: 'Title', width: 36 },
                { key: 'requestStatus', header: 'Request Status', width: 18 },
                { key: 'action', header: 'Action', width: 18 },
                { key: 'actor', header: 'Actor', width: 28 },
                { key: 'actionDate', header: 'Action Date', width: 24 },
                {
                  key: 'comment',
                  header: 'Comments / Rejection Reason',
                  width: 52,
                },
              ],
              rows: approvalRows,
            },
            {
              name: 'Export Criteria',
              columns: [
                { key: 'criterion', header: 'Criterion', width: 24 },
                { key: 'value', header: 'Value', width: 90 },
              ],
              rows: criteriaRows,
            },
          ],
        }),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `timesheets-${stamp}.xlsx`,
        rowCount: rows.length,
      };
    }
    const matrix = [
      exportColumns.map((column) => column.header),
      ...rows.map((row) =>
        exportColumns.map((column) => String(row[column.key] ?? '')),
      ),
    ];
    if (format === TimesheetExportFormat.PDF) {
      const lines = matrix.map((values) => values.slice(0, 12).join(' | '));
      return {
        buffer: buildPdf(lines),
        contentType: 'application/pdf',
        fileName: `timesheets-${stamp}.pdf`,
        rowCount: rows.length,
      };
    }
    return {
      buffer: Buffer.from(
        '\uFEFF' +
          matrix.map((values) => values.map(csvCell).join(',')).join('\r\n'),
        'utf8',
      ),
      contentType: 'text/csv; charset=utf-8',
      fileName: `timesheets-${stamp}.csv`,
      rowCount: rows.length,
    };
  }

  private async buildWhere(
    user: AuthenticatedUser,
    dto: CreateTimesheetExportDto,
  ): Promise<Prisma.TimesheetWhereInput> {
    const access = await this.accessWhere(
      user.tenantId,
      user.userId,
      user.permissionKeys,
    );
    return mergeWhere(dto, access);
  }

  private async buildWhereForStoredRequest(
    tenantId: string,
    userId: string,
    dto: CreateTimesheetExportDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
        userPermissions: { include: { permission: true } },
      },
    });
    const permissions = [
      ...(user?.userRoles.flatMap((membership) =>
        membership.role.rolePermissions.map((item) => item.permission.key),
      ) ?? []),
      ...(user?.userPermissions.map((item) => item.permission.key) ?? []),
    ];
    return mergeWhere(
      dto,
      await this.accessWhere(tenantId, userId, permissions),
    );
  }

  private async accessWhere(
    tenantId: string,
    userId: string,
    permissions: string[],
  ): Promise<Prisma.TimesheetWhereInput> {
    if (permissions.includes('timesheets.read.all')) return { tenantId };
    if (permissions.includes('timesheets.read.team')) {
      return {
        tenantId,
        employee: { OR: [{ userId }, { manager: { userId } }] },
      };
    }
    return { tenantId, employee: { userId } };
  }

  private async findRequest(user: AuthenticatedUser, id: string) {
    const item = await this.prisma.timesheetExportRequest.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...(user.permissionKeys.includes('timesheets.read.all')
          ? {}
          : { requestedById: user.userId }),
      },
    });
    if (!item) throw new NotFoundException('Export request was not found.');
    return item;
  }

  /**
   * BUG-2206 — `timesheets.auditExports` was rendered, saved and read by
   * nothing. It gates exactly these rows: who exported whose hours, with which
   * filters. It defaults on, and a settings read failure audits anyway; see
   * `TimesheetAuditSettingsService`.
   */
  private async auditExport(
    user: AuthenticatedUser,
    action: string,
    requestId: string | null,
    filters: unknown,
    rowCount: number,
  ) {
    if (
      !(await this.timesheetAuditSettings.shouldAudit(
        user.tenantId,
        'auditExports',
      ))
    ) {
      return undefined;
    }

    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: 'TimesheetExportRequest',
      entityId: requestId ?? `direct:${Date.now()}`,
      sourceModule: 'timesheets',
      scope: { filters, rowCount },
    });
  }
}

function mergeWhere(
  dto: CreateTimesheetExportDto,
  access: Prisma.TimesheetWhereInput,
): Prisma.TimesheetWhereInput {
  return {
    AND: [
      access,
      ...(dto.timesheetIds?.length ? [{ id: { in: dto.timesheetIds } }] : []),
      ...(dto.year ? [{ year: dto.year }] : []),
      ...(dto.month ? [{ month: dto.month }] : []),
      ...(dto.status ? [{ status: dto.status }] : []),
      ...(dto.businessUnitId ? [{ businessUnitId: dto.businessUnitId }] : []),
      ...(dto.organizationId ? [{ organizationId: dto.organizationId }] : []),
      ...(dto.departmentId ? [{ departmentId: dto.departmentId }] : []),
      ...(dto.employeeIds?.length
        ? [{ employeeId: { in: dto.employeeIds } }]
        : []),
      ...(dto.projectIds?.length
        ? [{ entries: { some: { projectId: { in: dto.projectIds } } } }]
        : []),
      ...(dto.dateFrom ? [{ periodEnd: { gte: new Date(dto.dateFrom) } }] : []),
      ...(dto.dateTo ? [{ periodStart: { lte: new Date(dto.dateTo) } }] : []),
    ],
  };
}
function toJson(value: CreateTimesheetExportDto) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function fromJson(
  value: Prisma.JsonValue,
  format: TimesheetExportFormat,
): CreateTimesheetExportDto {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...record,
    exportType: toDisplayString(
      record.exportType ?? 'ADVANCED',
    ) as CreateTimesheetExportDto['exportType'],
    format,
  } as CreateTimesheetExportDto;
}
function stripFileReference<T extends { fileReference: string | null }>(
  item: T,
) {
  const { fileReference: _fileReference, ...safeItem } = item;
  return { ...safeItem, downloadable: Boolean(item.fileReference) };
}
function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + Math.max(1, days));
  return result;
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
function safe(value?: string | null) {
  const text = value ?? '';
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildPdf(lines: string[]) {
  const pages: string[][] = [];
  for (let index = 0; index < Math.max(1, lines.length); index += 42)
    pages.push(lines.slice(index, index + 42));
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  let nextId = 4;
  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    const stream = `BT /F1 7 Tf 28 800 Td 10 TL ${pageLines.map((line, index) => `${index ? 'T* ' : ''}(${pdfEscape(line.slice(0, 180))}) Tj`).join(' ')} ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let output = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, 'utf8');
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1)
    output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}
function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
}
