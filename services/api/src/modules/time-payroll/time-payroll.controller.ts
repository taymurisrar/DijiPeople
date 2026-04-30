import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateOvertimePolicyDto,
  CreateTimePayrollPolicyDto,
  UpdateOvertimePolicyDto,
  UpdateTimePayrollPolicyDto,
} from './dto/time-payroll-policy.dto';
import { TimePayrollPreparationService } from './time-payroll-preparation.service';
import { TimePayrollService } from './time-payroll.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimePayrollController {
  constructor(
    private readonly service: TimePayrollService,
    private readonly preparationService: TimePayrollPreparationService,
  ) {}

  @Post('time-payroll-policies')
  @Permissions('time-payroll-policies.manage')
  createTimePolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTimePayrollPolicyDto) {
    return this.service.createTimePolicy(user, dto);
  }

  @Get('time-payroll-policies')
  @Permissions('time-payroll-policies.read')
  listTimePolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listTimePolicies(user);
  }

  @Get('time-payroll-policies/:id')
  @Permissions('time-payroll-policies.read')
  getTimePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getTimePolicy(user, id);
  }

  @Patch('time-payroll-policies/:id')
  @Permissions('time-payroll-policies.manage')
  updateTimePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTimePayrollPolicyDto,
  ) {
    return this.service.updateTimePolicy(user, id, dto);
  }

  @Delete('time-payroll-policies/:id')
  @Permissions('time-payroll-policies.manage')
  deactivateTimePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivateTimePolicy(user, id);
  }

  @Post('overtime-policies')
  @Permissions('overtime-policies.manage')
  createOvertimePolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOvertimePolicyDto) {
    return this.service.createOvertimePolicy(user, dto);
  }

  @Get('overtime-policies')
  @Permissions('overtime-policies.read')
  listOvertimePolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listOvertimePolicies(user);
  }

  @Get('overtime-policies/:id')
  @Permissions('overtime-policies.read')
  getOvertimePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getOvertimePolicy(user, id);
  }

  @Patch('overtime-policies/:id')
  @Permissions('overtime-policies.manage')
  updateOvertimePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOvertimePolicyDto,
  ) {
    return this.service.updateOvertimePolicy(user, id, dto);
  }

  @Delete('overtime-policies/:id')
  @Permissions('overtime-policies.manage')
  deactivateOvertimePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivateOvertimePolicy(user, id);
  }

  @Get('payroll/runs/:runId/time-inputs')
  @Permissions('payroll-time-inputs.read')
  listRunTimeInputs(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.preparationService.listRunInputs(user, runId);
  }

  @Post('payroll/runs/:runId/prepare-time-inputs')
  @Permissions('payroll-time-inputs.prepare')
  prepareRunTimeInputs(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.preparationService.prepareRun(user, runId);
  }
}
