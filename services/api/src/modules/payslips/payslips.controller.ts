import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
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
import { PayslipQueryDto } from './dto/payslip-query.dto';
import { VoidPayslipDto } from './dto/void-payslip.dto';
import { PayslipsService } from './payslips.service';
import type { Response } from 'express';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Post('payslips/generate/run/:payrollRunId')
  @Permissions('payslips.manage')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'create')
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
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'create')
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
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
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
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
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
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'approve')
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
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'delete')
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

  @Post('payslips/:id/regenerate')
  @Permissions('payslips.manage')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'create')
  regeneratePayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payslipsService.regeneratePayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
    });
  }

  @Post('payslips/:id/deliver')
  @Permissions('payslips.deliver')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'manage')
  deliverPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payslipsService.deliverPayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
    });
  }

  @Get('payslips/:id/download')
  @Permissions('payslips.read-all', 'payslips.download')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
  async downloadPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.payslipsService.downloadPayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
    });
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.stream);
  }

  @Get('me/payslips')
  @Permissions('payslips.read-own')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
  getMyPayslips(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: { year?: string; month?: string },
  ) {
    return this.payslipsService.getMyPayslips({
      tenantId: user.tenantId,
      userId: user.userId,
      year: query.year,
      month: query.month,
    });
  }

  @Get('me/payslips/:id')
  @Permissions('payslips.read-own')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
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

  @Get('me/payslips/:id/download')
  @Permissions('payslips.read-own', 'payslips.download')
  @RequirePermission(ENTITY_KEYS.PAYSLIPS, 'read')
  async downloadMyPayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.payslipsService.downloadPayslip({
      tenantId: user.tenantId,
      payslipId: id,
      actorUserId: user.userId,
      own: true,
    });
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.stream);
  }
}
