import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PayslipQueryDto } from './dto/payslip-query.dto';
import { VoidPayslipDto } from './dto/void-payslip.dto';
import { PayslipsService } from './payslips.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Post('payslips/generate/run/:payrollRunId')
  @Permissions('payslips.manage')
  generateForRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('payrollRunId', new ParseUUIDPipe()) payrollRunId: string,
  ) {
    return this.payslipsService.generatePayslipsForRun({
      tenantId: user.tenantId,
      payrollRunId,
      actorUserId: user.userId,
    });
  }

  @Post('payslips/generate/run-employee/:payrollRunEmployeeId')
  @Permissions('payslips.manage')
  generateForRunEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('payrollRunEmployeeId', new ParseUUIDPipe())
    payrollRunEmployeeId: string,
  ) {
    return this.payslipsService.generatePayslipForRunEmployee({
      tenantId: user.tenantId,
      payrollRunEmployeeId,
      actorUserId: user.userId,
    });
  }

  @Get('payslips')
  @Permissions('payslips.read-all')
  listPayslips(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayslipQueryDto,
  ) {
    return this.payslipsService.listPayslips({
      tenantId: user.tenantId,
      ...query,
    });
  }

  @Get('payslips/:id')
  @Permissions('payslips.read-all')
  getPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payslipsService.getPayslip({
      tenantId: user.tenantId,
      payslipId: id,
    });
  }

  @Post('payslips/:id/publish')
  @Permissions('payslips.publish')
  publishPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payslipsService.publishPayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
    });
  }

  @Post('payslips/:id/void')
  @Permissions('payslips.void')
  voidPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VoidPayslipDto,
  ) {
    return this.payslipsService.voidPayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
      reason: dto.reason,
    });
  }

  @Get('me/payslips')
  @Permissions('payslips.read-own')
  getMyPayslips(@CurrentUser() user: AuthenticatedUser) {
    return this.payslipsService.getMyPayslips({
      tenantId: user.tenantId,
      userId: user.userId,
    });
  }

  @Get('me/payslips/:id')
  @Permissions('payslips.read-own')
  getMyPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payslipsService.getMyPayslip({
      tenantId: user.tenantId,
      userId: user.userId,
      payslipId: id,
    });
  }
}
