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
  @Permissions('payroll.create')
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

  @Get('compensations')
  @Permissions('payroll.read')
  listCompensations(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.listCompensations(user.tenantId);
  }

  @Post('compensations')
  @Permissions('payroll.update')
  createCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeCompensationDto,
  ) {
    return this.payrollService.createCompensation(user, dto);
  }

  @Patch('compensations/:compensationId')
  @Permissions('payroll.update')
  updateCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compensationId', new ParseUUIDPipe()) compensationId: string,
    @Body() dto: UpdateEmployeeCompensationDto,
  ) {
    return this.payrollService.updateCompensation(user, compensationId, dto);
  }
}

