import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RequireAnyPermission } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
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
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly auditService: AuditService,
  ) {}

  @Post('check-in')
  @RequireAnyPermission({ entityKey: ENTITY_KEYS.ATTENDANCE, action: 'create' })
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(user, dto);
  }

  @Post('check-out')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'create' },
    { entityKey: ENTITY_KEYS.ATTENDANCE, action: 'write' },
  )
  checkOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOutDto) {
    return this.attendanceService.checkOut(user, dto);
  }

  @Get('mine')
  @Permissions('attendance.read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.listMyAttendance(user, query);
  }

  @Get('mine/active')
  @Permissions('attendance.read')
  getMyActiveAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMyActiveAttendance(user);
  }

  @Get('mine/today')
  @Permissions('attendance.read')
  getTodayAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getTodayAttendance(user);
  }

  @Get('runtime-context')
  @Permissions('attendance.read')
  getSelfServiceRuntimeContext(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getSelfServiceRuntimeContext(user);
  }

  @Get(':entryId/timeline')
  @Permissions('attendance.read', 'timeline.read')
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
  mySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceSummaryQueryDto,
  ) {
    return this.attendanceService.getMyAttendanceSummary(user, query);
  }

  @Get('team')
  @Permissions('attendance.read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.listTeamAttendance(user, query);
  }

  @Get('team/summary')
  @Permissions('attendance.read')
  teamSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceSummaryQueryDto,
  ) {
    return this.attendanceService.getTeamAttendanceSummary(user, query);
  }

  @Post('manual')
  @Permissions('attendance.manage')
  createManualEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualAttendanceEntryDto,
  ) {
    return this.attendanceService.createManualEntry(user, dto);
  }

  @Patch('manual/:entryId')
  @Permissions('attendance.manage')
  updateManualEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() dto: UpdateManualAttendanceEntryDto,
  ) {
    return this.attendanceService.updateManualEntry(user, entryId, dto);
  }

  @Get('correction-requests')
  listCorrectionRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceCorrectionQueryDto,
  ) {
    return this.attendanceService.listCorrectionRequests(user, query);
  }

  @Post('correction-requests')
  createCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttendanceCorrectionRequestDto,
  ) {
    return this.attendanceService.createCorrectionRequest(user, dto);
  }

  @Get('correction-requests/:id')
  getCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.attendanceService.getCorrectionRequest(user, id);
  }

  @Post('correction-requests/:id/approve')
  approveCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceCorrectionActionDto,
  ) {
    return this.attendanceService.approveCorrectionRequest(user, id, dto);
  }

  @Post('correction-requests/:id/reject')
  rejectCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceCorrectionActionDto,
  ) {
    return this.attendanceService.rejectCorrectionRequest(user, id, dto);
  }

  @Get('export')
  @Permissions('attendance.export')
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

  @Post('import')
  @Permissions('attendance.import')
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
  getPolicy(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getPolicy(user);
  }

  @Get('configuration')
  @Permissions('attendance.read')
  getRuntimeConfiguration(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getRuntimeConfiguration(user);
  }

  @Patch('policy')
  @Permissions('attendance.manage')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAttendancePolicyDto,
  ) {
    return this.attendanceService.updatePolicy(user, dto);
  }

  @Get('locations')
  @Permissions('attendance.read')
  listOfficeLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listOfficeLocations(user);
  }

  @Get('shifts')
  @Permissions('attendance.read')
  listShiftTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listShiftTemplates(user);
  }

  @Get('integrations')
  @Permissions('attendance.integration.manage')
  listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listIntegrationConfigs(user);
  }

  @Post('integrations')
  @Permissions('attendance.integration.manage')
  createIntegration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttendanceIntegrationDto,
  ) {
    return this.attendanceService.createIntegrationConfig(user, dto);
  }

  @Patch('integrations/:integrationId')
  @Permissions('attendance.integration.manage')
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
  getAttendanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    return this.attendanceService.getAttendanceEntry(user, entryId);
  }

  @Patch(':entryId/override')
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
