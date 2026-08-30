import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { setCsvDownloadHeaders } from '../../common/utils/csv-response.util';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
  RequireAnyPermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { AttendanceService } from './attendance.service';
import { AuditService } from '../audit/audit.service';
import { AttendanceCorrectionActionDto } from './dto/attendance-correction-action.dto';
import { AttendanceCorrectionQueryDto } from './dto/attendance-correction-query.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateAttendanceIntegrationDto } from './dto/create-attendance-integration.dto';
import { CreateAttendanceCorrectionRequestDto } from './dto/create-attendance-correction-request.dto';
import { CreateManualAttendanceEntryDto } from './dto/create-manual-attendance-entry.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { OverrideAttendanceEntryDto } from './dto/override-attendance-entry.dto';
import { UpdateAttendanceIntegrationDto } from './dto/update-attendance-integration.dto';
import { UpdateAttendancePolicyDto } from './dto/update-attendance-policy.dto';
import { UpdateManualAttendanceEntryDto } from './dto/update-manual-attendance-entry.dto';

type UploadedFileShape = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.ATTENDANCE)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly auditService: AuditService,
  ) {}

  @Post('check-in')
  @Permissions('attendance.checkin')
  @RequireAnyPermission({ entityKey: ENTITY_KEYS.ATTENDANCE, action: 'create' })
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
    @Req() request: Request,
  ) {
    return this.attendanceService.checkIn(
      user,
      enrichAttendanceClientContext(dto, request),
    );
  }

  @Post('check-out')
  @Permissions('attendance.checkout')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'create' },
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'write' },
  )
  checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckOutDto,
    @Req() request: Request,
  ) {
    return this.attendanceService.checkOut(
      user,
      enrichAttendanceClientContext(dto, request),
    );
  }

  @Get('mine')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.listMyAttendance(user, query);
  }

  @Get('mine/active')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getMyActiveAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMyActiveAttendance(user);
  }

  @Get('mine/today')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getTodayAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getTodayAttendance(user);
  }

  @Get('runtime-context')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getSelfServiceRuntimeContext(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getSelfServiceRuntimeContext(user);
  }

  @Delete(':entryId')
  @Permissions('attendance.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  deleteAttendanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    return this.attendanceService.deleteAttendanceEntry(user, entryId);
  }

  @Get(':entryId/timeline')
  @Permissions('attendance.read', 'timeline.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'read' },
    { entityKey: ENTITY_KEYS.PROJECTS, action: 'read' },
  )
  async getTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    await this.attendanceService.getAttendanceEntry(user, entryId);
    return this.auditService.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: 'AttendanceEntry',
      entityId: entryId,
      recordHref: `/attendance/${entryId}`,
    });
  }

  @Get('mine/summary')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  mySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceSummaryQueryDto,
  ) {
    return this.attendanceService.getMyAttendanceSummary(user, query);
  }

  @Get('team')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.listTeamAttendance(user, query);
  }

  @Get('team/summary')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  teamSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceSummaryQueryDto,
  ) {
    return this.attendanceService.getTeamAttendanceSummary(user, query);
  }

  @Post('manual')
  @Permissions('attendance.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  createManualEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualAttendanceEntryDto,
  ) {
    return this.attendanceService.createManualEntry(user, dto);
  }

  @Patch('manual/:entryId')
  @Permissions('attendance.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  updateManualEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() dto: UpdateManualAttendanceEntryDto,
  ) {
    return this.attendanceService.updateManualEntry(user, entryId, dto);
  }

  @Get('correction-requests')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listCorrectionRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceCorrectionQueryDto,
  ) {
    return this.attendanceService.listCorrectionRequests(user, query);
  }

  @Post('correction-requests')
  @Permissions('attendance.correction.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  createCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttendanceCorrectionRequestDto,
  ) {
    return this.attendanceService.createCorrectionRequest(user, dto);
  }

  @Get('correction-requests/:id')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.attendanceService.getCorrectionRequest(user, id);
  }

  @Post('correction-requests/:id/approve')
  @Permissions('attendance.correction.approve')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'approve')
  approveCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceCorrectionActionDto,
  ) {
    return this.attendanceService.approveCorrectionRequest(user, id, dto);
  }

  @Post('correction-requests/:id/reject')
  @Permissions('attendance.correction.reject')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'reject')
  rejectCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceCorrectionActionDto,
  ) {
    return this.attendanceService.rejectCorrectionRequest(user, id, dto);
  }

  @Get('export')
  @Permissions('attendance.export')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'export')
  async exportAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.attendanceService.exportAttendance(user, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
  }

  @Get('export-template')
  @Permissions('attendance.import')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'import')
  exportAttendanceTemplate(@Res({ passthrough: true }) response: Response) {
    const file = this.attendanceService.exportAttendanceTemplate();
    setCsvDownloadHeaders(response, file.filename);
    return new StreamableFile(file.buffer);
  }

  @Post('import')
  @Permissions('attendance.import')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'import')
  @UseInterceptors(FileInterceptor('file'))
  importAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportAttendanceDto,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    return this.attendanceService.importAttendance(user, dto, file);
  }

  @Get('policy')
  @Permissions('attendance.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  getPolicy(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getPolicy(user);
  }

  @Get('configuration')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getRuntimeConfiguration(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getRuntimeConfiguration(user);
  }

  @Patch('policy')
  @Permissions('attendance.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAttendancePolicyDto,
  ) {
    return this.attendanceService.updatePolicy(user, dto);
  }

  @Get('locations')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listOfficeLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listOfficeLocations(user);
  }

  @Get('shifts')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listShiftTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listShiftTemplates(user);
  }

  @Get('integrations')
  @Permissions('attendance.integration.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listIntegrationConfigs(user);
  }

  @Post('integrations')
  @Permissions('attendance.integration.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  createIntegration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttendanceIntegrationDto,
  ) {
    return this.attendanceService.createIntegrationConfig(user, dto);
  }

  @Patch('integrations/:integrationId')
  @Permissions('attendance.integration.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  updateIntegration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('integrationId', new ParseUUIDPipe()) integrationId: string,
    @Body() dto: UpdateAttendanceIntegrationDto,
  ) {
    return this.attendanceService.updateIntegrationConfig(
      user,
      integrationId,
      dto,
    );
  }

  @Get(':entryId')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getAttendanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    return this.attendanceService.getAttendanceEntry(user, entryId);
  }

  @Patch(':entryId/override')
  @Permissions('attendance.override')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'write' },
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'manage' },
  )
  overrideAttendanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() dto: OverrideAttendanceEntryDto,
  ) {
    return this.attendanceService.overrideAttendanceEntry(user, entryId, dto);
  }
}

function enrichAttendanceClientContext<T extends CheckInDto | CheckOutDto>(
  dto: T,
  request: Request,
): T {
  return {
    ...dto,
    ipAddress: dto.ipAddress ?? readClientIp(request),
    userAgent: dto.userAgent ?? request.get('user-agent') ?? undefined,
  };
}

function readClientIp(request: Request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  const firstForwardedIp = forwardedValue?.split(',')[0]?.trim();

  return (
    firstForwardedIp || request.ip || request.socket.remoteAddress || undefined
  );
}
