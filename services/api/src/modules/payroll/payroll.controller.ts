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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmployeeCompensationDto } from './dto/create-employee-compensation.dto';
import { CreatePayrollCycleDto } from './dto/create-payroll-cycle.dto';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';
import { UpdateEmployeeCompensationDto } from './dto/update-employee-compensation.dto';
import { PayrollService } from './payroll.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('cycles')
  @Permissions('payroll.read')
  listCycles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollCycleQueryDto,
  ) {
    return this.payrollService.listCycles(user.tenantId, query);
  }

  @Get('cycles/:cycleId')
  @Permissions('payroll.read')
  getCycleById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.getCycleById(user.tenantId, cycleId);
  }

  @Post('cycles')
  @Permissions('payroll.write')
  createCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollCycleDto,
  ) {
    return this.payrollService.createCycle(user, dto);
  }

  @Post('cycles/:cycleId/generate-drafts')
  @Permissions('payroll.run')
  generateDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.generateDraftRecords(user, cycleId);
  }

  @Get('cycles/:cycleId/preview')
  @Permissions('payroll.read')
  previewGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.previewPayrollGeneration(user.tenantId, cycleId);
  }

  @Post('cycles/:cycleId/review')
  @Permissions('payroll.review')
  reviewDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.reviewDraftRecords(user, cycleId);
  }

  @Post('cycles/:cycleId/finalize')
  @Permissions('payroll.finalize')
  finalizeCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cycleId', new ParseUUIDPipe()) cycleId: string,
  ) {
    return this.payrollService.finalizeCycle(user, cycleId);
  }

  @Get('cycles/:cycleId/export')
  @Permissions('payroll.export')
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
  listCompensations(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.listCompensations(user.tenantId);
  }

  @Post('compensations')
  @Permissions('payroll.write')
  createCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeCompensationDto,
  ) {
    return this.payrollService.createCompensation(user, dto);
  }

  @Patch('compensations/:compensationId')
  @Permissions('payroll.write')
  updateCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compensationId', new ParseUUIDPipe()) compensationId: string,
    @Body() dto: UpdateEmployeeCompensationDto,
  ) {
    return this.payrollService.updateCompensation(user, compensationId, dto);
  }
}
