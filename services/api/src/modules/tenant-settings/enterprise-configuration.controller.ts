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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { EnterpriseConfigurationService } from './enterprise-configuration.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class EnterpriseConfigurationController {
  constructor(
    private readonly enterpriseConfigurationService: EnterpriseConfigurationService,
  ) {}

  @Get('holiday-calendars')
  @Permissions('settings.read')
  listHolidayCalendars(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.listHolidayCalendars(
      user.tenantId,
      query,
    );
  }

  @Post('holiday-calendars')
  @Permissions('settings.update')
  createHolidayCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createHolidayCalendar(
      user,
      body,
    );
  }

  @Get('holiday-calendars/:id')
  @Permissions('settings.read')
  getHolidayCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getHolidayCalendar(
      user.tenantId,
      id,
    );
  }

  @Patch('holiday-calendars/:id')
  @Permissions('settings.update')
  updateHolidayCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateHolidayCalendar(
      user,
      id,
      body,
    );
  }

  @Delete('holiday-calendars/:id')
  @Permissions('settings.update')
  deleteHolidayCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deleteHolidayCalendar(user, id);
  }

  @Get('holiday-calendars/:id/holidays')
  @Permissions('settings.read')
  listHolidays(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.listHolidays(
      user.tenantId,
      id,
      query,
    );
  }

  @Post('holiday-calendars/:id/holidays')
  @Permissions('settings.update')
  createHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createHoliday(user, id, body);
  }

  @Patch('holiday-calendars/:id/holidays/:holidayId')
  @Permissions('settings.update')
  updateHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('holidayId', new ParseUUIDPipe()) holidayId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateHoliday(
      user,
      id,
      holidayId,
      body,
    );
  }

  @Delete('holiday-calendars/:id/holidays/:holidayId')
  @Permissions('settings.update')
  deleteHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('holidayId', new ParseUUIDPipe()) holidayId: string,
  ) {
    return this.enterpriseConfigurationService.deleteHoliday(
      user,
      id,
      holidayId,
    );
  }

  @Post('holiday-calendars/:id/assignments')
  @Permissions('settings.update')
  assignHolidayCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.upsertHolidayCalendarAssignment(
      user,
      id,
      body,
    );
  }

  @Get('work-schedules')
  @Permissions('settings.read')
  listWorkSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.listWorkSchedules(
      user.tenantId,
      query,
    );
  }

  @Post('work-schedules')
  @Permissions('settings.update')
  createWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createWorkSchedule(user, body);
  }

  @Get('work-schedules/:id')
  @Permissions('settings.read')
  getWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getWorkSchedule(
      user.tenantId,
      id,
    );
  }

  @Patch('work-schedules/:id')
  @Permissions('settings.update')
  updateWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateWorkSchedule(
      user,
      id,
      body,
    );
  }

  @Delete('work-schedules/:id')
  @Permissions('settings.update')
  deleteWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deleteWorkSchedule(user, id);
  }

  @Get('shift-templates')
  @Permissions('settings.read')
  listShiftTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseConfigurationService.listShiftTemplates(
      user.tenantId,
    );
  }

  @Post('shift-templates')
  @Permissions('settings.update')
  createShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createShiftTemplate(user, body);
  }

  @Get('shift-templates/:id')
  @Permissions('settings.read')
  getShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getShiftTemplate(
      user.tenantId,
      id,
    );
  }

  @Patch('shift-templates/:id')
  @Permissions('settings.update')
  updateShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateShiftTemplate(
      user,
      id,
      body,
    );
  }

  @Delete('shift-templates/:id')
  @Permissions('settings.update')
  archiveShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.archiveShiftTemplate(user, id);
  }

  @Get('employee-schedule-assignments')
  @Permissions('settings.read')
  listEmployeeScheduleAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseConfigurationService.listEmployeeScheduleAssignments(
      user.tenantId,
    );
  }

  @Post('employee-schedule-assignments')
  @Permissions('settings.update')
  createEmployeeScheduleAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createEmployeeScheduleAssignment(
      user,
      body,
    );
  }

  @Get('employee-schedule-assignments/:id')
  @Permissions('settings.read')
  getEmployeeScheduleAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getEmployeeScheduleAssignment(
      user.tenantId,
      id,
    );
  }

  @Delete('employee-schedule-assignments/:id')
  @Permissions('settings.update')
  deactivateEmployeeScheduleAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deactivateEmployeeScheduleAssignment(
      user,
      id,
    );
  }

  @Get('payroll-regions')
  @Permissions('payroll.settings.read')
  listPayrollRegions(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseConfigurationService.listPayrollRegions(
      user.tenantId,
    );
  }

  @Post('payroll-regions')
  @Permissions('payroll.settings.update')
  createPayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createPayrollRegion(user, body);
  }

  @Get('payroll-regions/:id')
  @Permissions('payroll.settings.read')
  getPayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getPayrollRegion(
      user.tenantId,
      id,
    );
  }

  @Patch('payroll-regions/:id')
  @Permissions('payroll.settings.update')
  updatePayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updatePayrollRegion(
      user,
      id,
      body,
    );
  }

  @Delete('payroll-regions/:id')
  @Permissions('payroll.settings.update')
  deletePayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deletePayrollRegion(user, id);
  }

  @Get('exchange-rates')
  @Permissions('settings.read')
  listExchangeRates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.listExchangeRates(
      user.tenantId,
      query,
    );
  }

  @Post('exchange-rates')
  @Permissions('settings.update')
  createExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createExchangeRate(user, body);
  }

  @Get('exchange-rates/:id')
  @Permissions('settings.read')
  getExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.getExchangeRate(
      user.tenantId,
      id,
    );
  }

  @Patch('exchange-rates/:id')
  @Permissions('settings.update')
  updateExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateExchangeRate(
      user,
      id,
      body,
    );
  }

  @Delete('exchange-rates/:id')
  @Permissions('settings.update')
  deleteExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deleteExchangeRate(user, id);
  }
}
