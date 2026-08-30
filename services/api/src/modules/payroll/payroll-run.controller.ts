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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreatePayrollCalendarDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  PayrollCoreQueryDto,
  UpdatePayrollCalendarDto,
  UpdatePayrollPeriodDto,
} from './dto/payroll-core.dto';
import {
  CreatePayrollAdjustmentDto,
  PayrollAdjustmentDecisionDto,
  PayrollExceptionActionDto,
  UpdatePayrollAdjustmentDto,
} from './dto/payroll-adjustment.dto';
import { PayrollRunService } from './payroll-run.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class PayrollRunController {
  constructor(private readonly payrollRunService: PayrollRunService) {}

  @Post('calendars')
  @Permissions('payroll-calendars.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_CALENDARS, 'manage')
  createCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollCalendarDto,
  ) {
    return this.payrollRunService.createCalendar(user, dto);
  }

  @Get('calendars')
  @Permissions('payroll-calendars.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_CALENDARS, 'read')
  listCalendars(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listCalendars(user, query);
  }

  @Get('calendars/:id')
  @Permissions('payroll-calendars.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_CALENDARS, 'read')
  getCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getCalendar(user, id);
  }

  @Patch('calendars/:id')
  @Permissions('payroll-calendars.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_CALENDARS, 'manage')
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollCalendarDto,
  ) {
    return this.payrollRunService.updateCalendar(user, id, dto);
  }

  @Post('periods')
  @Permissions('payroll-periods.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_PERIODS, 'manage')
  createPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.payrollRunService.createPeriod(user, dto);
  }

  @Get('periods')
  @Permissions('payroll-periods.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_PERIODS, 'read')
  listPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listPeriods(user, query);
  }

  @Get('periods/:id')
  @Permissions('payroll-periods.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_PERIODS, 'read')
  getPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getPeriod(user, id);
  }

  @Patch('periods/:id')
  @Permissions('payroll-periods.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_PERIODS, 'manage')
  updatePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollPeriodDto,
  ) {
    return this.payrollRunService.updatePeriod(user, id, dto);
  }

  @Post('runs')
  @Permissions('payroll-runs.create')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'create')
  createPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payrollRunService.createPayrollRun(user, dto);
  }

  @Get('runs')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  listPayrollRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCoreQueryDto,
  ) {
    return this.payrollRunService.listPayrollRuns(user, query);
  }

  @Get('runs/:id')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  getPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.getPayrollRun(user, id);
  }

  @Delete('runs/:id')
  @Permissions('payroll-runs.delete')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'delete')
  deletePayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.deletePayrollRun(user, id);
  }

  @Post('runs/:id/calculate')
  @Permissions('payroll-runs.calculate')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  calculatePayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.calculateDraftPayrollRun(user, id);
  }

  @Post('runs/:id/lock')
  @Permissions('payroll-runs.lock')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'configure')
  lockPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.lockPayrollRun(user, id);
  }

  @Post('runs/:id/calculate-taxes')
  @Permissions('payroll-tax.calculate')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'manage')
  calculatePayrollRunTaxes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.calculatePayrollRunTaxes(user, id);
  }

  @Get('runs/:id/employees')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  listRunEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.listRunEmployees(user, id);
  }

  @Get('runs/:id/exceptions')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  listRunExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.listRunExceptions(user, id);
  }

  @Post('runs/:id/exceptions/:exceptionId/acknowledge')
  @Permissions('payroll-runs.calculate')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  acknowledgeRunException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exceptionId', new ParseUUIDPipe()) exceptionId: string,
    @Body() dto: PayrollExceptionActionDto,
  ) {
    return this.payrollRunService.acknowledgeRunException(
      user,
      id,
      exceptionId,
      dto,
    );
  }

  @Post('runs/:id/exceptions/:exceptionId/resolve')
  @Permissions('payroll-runs.calculate')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  resolveRunException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exceptionId', new ParseUUIDPipe()) exceptionId: string,
    @Body() dto: PayrollExceptionActionDto,
  ) {
    return this.payrollRunService.resolveRunException(
      user,
      id,
      exceptionId,
      dto,
    );
  }

  @Get('runs/:id/adjustments')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  listRunAdjustments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollRunService.listRunAdjustments(user, id);
  }

  @Post('runs/:id/adjustments')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  createRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePayrollAdjustmentDto,
  ) {
    return this.payrollRunService.createRunAdjustment(user, id, dto);
  }

  @Patch('runs/:id/adjustments/:adjustmentId')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  updateRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
    @Body() dto: UpdatePayrollAdjustmentDto,
  ) {
    return this.payrollRunService.updateRunAdjustment(
      user,
      id,
      adjustmentId,
      dto,
    );
  }

  @Delete('runs/:id/adjustments/:adjustmentId')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  deleteRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
  ) {
    return this.payrollRunService.deleteRunAdjustment(user, id, adjustmentId);
  }

  @Post('runs/:id/adjustments/:adjustmentId/submit')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  submitRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
  ) {
    return this.payrollRunService.submitRunAdjustment(user, id, adjustmentId);
  }

  @Post('runs/:id/adjustments/:adjustmentId/approve')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  approveRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
  ) {
    return this.payrollRunService.approveRunAdjustment(user, id, adjustmentId);
  }

  @Post('runs/:id/adjustments/:adjustmentId/reject')
  @Permissions('payroll-runs.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'manage')
  rejectRunAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
    @Body() dto: PayrollAdjustmentDecisionDto,
  ) {
    return this.payrollRunService.rejectRunAdjustment(
      user,
      id,
      adjustmentId,
      dto,
    );
  }

  @Get('runs/:id/cost-allocations')
  @Permissions('payroll-runs.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_RUNS, 'read')
  listRunCostAllocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: { page?: number; pageSize?: number; search?: string },
  ) {
    return this.payrollRunService.listRunCostAllocations(user, id, query);
  }
}
