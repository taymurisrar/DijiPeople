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
import {
  CreatePayrollCalendarDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  PayrollCoreQueryDto,
  UpdatePayrollCalendarDto,
  UpdatePayrollPeriodDto,
} from './dto/payroll-core.dto';
import { PayrollRunService } from './payroll-run.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollRunController {
  constructor(private readonly payrollRunService: PayrollRunService) {}

  @Post('calendars')
  @Permissions('payroll-calendars.manage')
  createCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollCalendarDto,
  ) {
    return this.payrollRunService.createCalendar(user, dto);
  }

  @Get('calendars')
  @Permissions('payroll-calendars.read')
  listCalendars(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listCalendars(user, query);
  }

  @Get('calendars/:id')
  @Permissions('payroll-calendars.read')
  getCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getCalendar(user, id);
  }

  @Patch('calendars/:id')
  @Permissions('payroll-calendars.manage')
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollCalendarDto,
  ) {
    return this.payrollRunService.updateCalendar(user, id, dto);
  }

  @Post('periods')
  @Permissions('payroll-periods.manage')
  createPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.payrollRunService.createPeriod(user, dto);
  }

  @Get('periods')
  @Permissions('payroll-periods.read')
  listPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listPeriods(user, query);
  }

  @Get('periods/:id')
  @Permissions('payroll-periods.read')
  getPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getPeriod(user, id);
  }

  @Patch('periods/:id')
  @Permissions('payroll-periods.manage')
  updatePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollPeriodDto,
  ) {
    return this.payrollRunService.updatePeriod(user, id, dto);
  }

  @Post('runs')
  @Permissions('payroll-runs.create')
  createPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payrollRunService.createPayrollRun(user, dto);
  }

  @Get('runs')
  @Permissions('payroll-runs.read')
  listPayrollRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listPayrollRuns(user, query);
  }

  @Get('runs/:id')
  @Permissions('payroll-runs.read')
  getPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getPayrollRun(user, id);
  }

  @Post('runs/:id/calculate')
  @Permissions('payroll-runs.calculate')
  calculatePayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.calculateDraftPayrollRun(user, id);
  }

  @Post('runs/:id/lock')
  @Permissions('payroll-runs.lock')
  lockPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.lockPayrollRun(user, id);
  }

  @Post('runs/:id/calculate-taxes')
  @Permissions('payroll-tax.calculate')
  calculatePayrollRunTaxes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.calculatePayrollRunTaxes(user, id);
  }

  @Get('runs/:id/employees')
  @Permissions('payroll-runs.read')
  listRunEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.listRunEmployees(user, id);
  }

  @Get('runs/:id/exceptions')
  @Permissions('payroll-runs.read')
  listRunExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.listRunExceptions(user, id);
  }
}
