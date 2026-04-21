import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { GetMonthlyTimesheetDto } from './dto/get-monthly-timesheet.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { SubmitTimesheetDto } from './dto/submit-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { UpsertTimesheetEntriesDto } from './dto/upsert-timesheet-entries.dto';
import { TimesheetsService } from './timesheets.service';

@Controller('timesheets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get('mine/monthly')
  @Permissions('timesheets.read')
  getMineMonthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetMonthlyTimesheetDto,
  ) {
    return this.timesheetsService.getMyMonthlyTimesheet(user, query);
  }

  @Get('mine')
  @Permissions('timesheets.read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listMine(user, query);
  }

  @Get('team')
  @Permissions('timesheets.read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listTeam(user, query);
  }

  @Get('team/:timesheetId')
  @Permissions('timesheets.read')
  getTeamTimesheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.getTeamTimesheetById(user, timesheetId);
  }

  @Patch(':timesheetId/entries')
  @Permissions('timesheets.create')
  updateEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: UpsertTimesheetEntriesDto,
  ) {
    return this.timesheetsService.updateEntries(user, timesheetId, dto);
  }

  @Post(':timesheetId/submit')
  @Permissions('timesheets.submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: SubmitTimesheetDto,
  ) {
    return this.timesheetsService.submitTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/approve')
  @Permissions('timesheets.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.approveTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/reject')
  @Permissions('timesheets.approve')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.rejectTimesheet(user, timesheetId, dto);
  }

  @Get(':timesheetId/export')
  @Permissions('timesheets.read')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.exportTimesheet(user, timesheetId);
  }
}
