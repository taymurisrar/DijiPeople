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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';
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

type UploadedFileShape = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @Permissions('attendance.checkin')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(user, dto);
  }

  @Post('check-out')
  @Permissions('attendance.checkout')
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
}
