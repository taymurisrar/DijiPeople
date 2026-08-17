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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmployeeCompensationDto } from './dto/create-employee-compensation.dto';
import {
  CreatePayrollCycleDto,
  GeneratePayrollPeriodsDto,
} from './dto/create-payroll-cycle.dto';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';
import { UpdateEmployeeCompensationDto } from './dto/update-employee-compensation.dto';
import { PayrollService } from './payroll.service';
import { PayrollDefaultsService } from './payroll-defaults.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly payrollDefaults: PayrollDefaultsService,
  ) {}

  @Get('configuration/health')
  @Permissions('payroll.settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'read' },
    { entityKey: ENTITY_KEYS.PAYROLL, action: 'read' },
  )
  configurationHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollDefaults.health(user.tenantId);
  }

  @Post('configuration/initialize-defaults')
  @Permissions('payroll.settings.update')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  initializeDefaults(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollDefaults.initialize(user);
  }

  @Get('cycles')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
  listCycles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCycleQueryDto,
  ) {
    return this.payrollService.listCycles(user.tenantId, query);
  }

  @Get('cycles/:cycleId')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
  getCycleById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.getCycleById(user.tenantId, cycleId);
  }

  @Post('cycles')
  @Permissions('payroll.write')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  createCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollCycleDto,
  ) {
    return this.payrollService.createCycle(user, dto);
  }

  @Patch('cycles/:cycleId')
  @Permissions('payroll.write')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  updateCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
    @Body() dto: CreatePayrollCycleDto,
  ) {
    return this.payrollService.updateCycle(user, cycleId, dto);
  }

  @Post('cycles/:cycleId/generate-periods')
  @Permissions('payroll-periods.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_PERIODS, 'manage')
  generatePeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
    @Body() dto: GeneratePayrollPeriodsDto,
  ) {
    return this.payrollService.generatePeriods(user, cycleId, dto);
  }

  @Post('cycles/:cycleId/generate-drafts')
  @Permissions('payroll.run')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'manage')
  generateDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.generateDraftRecords(user, cycleId);
  }

  @Get('cycles/:cycleId/preview')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
  previewGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.previewPayrollGeneration(user.tenantId, cycleId);
  }

  @Post('cycles/:cycleId/review')
  @Permissions('payroll.review')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'approve')
  reviewDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.reviewDraftRecords(user, cycleId);
  }

  @Post('cycles/:cycleId/finalize')
  @Permissions('payroll.finalize')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'manage')
  finalizeCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.finalizeCycle(user, cycleId);
  }

  @Get('cycles/:cycleId/export')
  @Permissions('payroll.export')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'export')
  async exportCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
    @Res() response: Response,
  ) {
    const exported = await this.payrollService.exportPayrollData(
      user.tenantId,
      cycleId,
    );
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.send(exported.content);
  }

  @Get('compensations')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
  listCompensations(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.listCompensations(user.tenantId);
  }

  @Get('compensations/:compensationId')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
  getCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compensationId', new ParseUUIDPipe()) compensationId: string,
  ) {
    return this.payrollService.getCompensation(user.tenantId, compensationId);
  }

  @Post('compensations')
  @Permissions('payroll.write')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  createCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeCompensationDto,
  ) {
    return this.payrollService.createCompensation(user, dto);
  }

  @Patch('compensations/:compensationId')
  @Permissions('payroll.write')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  updateCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compensationId', new ParseUUIDPipe()) compensationId: string,
    @Body() dto: UpdateEmployeeCompensationDto,
  ) {
    return this.payrollService.updateCompensation(user, compensationId, dto);
  }
}
