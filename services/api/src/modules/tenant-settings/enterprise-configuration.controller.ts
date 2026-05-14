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
    return this.enterpriseConfigurationService.deleteHoliday(user, id, holidayId);
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

  @Patch('work-schedules/:id')
  @Permissions('settings.update')
  updateWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updateWorkSchedule(user, id, body);
  }

  @Delete('work-schedules/:id')
  @Permissions('settings.update')
  deleteWorkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deleteWorkSchedule(user, id);
  }

  @Get('payroll-regions')
  @Permissions('payroll.settings.read')
  listPayrollRegions(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseConfigurationService.listPayrollRegions(user.tenantId);
  }

  @Post('payroll-regions')
  @Permissions('payroll.settings.update')
  createPayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.createPayrollRegion(user, body);
  }

  @Patch('payroll-regions/:id')
  @Permissions('payroll.settings.update')
  updatePayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.updatePayrollRegion(user, id, body);
  }

  @Delete('payroll-regions/:id')
  @Permissions('payroll.settings.update')
  deletePayrollRegion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enterpriseConfigurationService.deletePayrollRegion(user, id);
  }

  @Get('currency-configurations')
  @Permissions('settings.read')
  listCurrencyConfigurations(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseConfigurationService.listCurrencyConfigurations(
      user.tenantId,
    );
  }

  @Post('currency-configurations')
  @Permissions('settings.update')
  upsertCurrencyConfiguration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.enterpriseConfigurationService.upsertCurrencyConfiguration(
      user,
      body,
    );
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
}
