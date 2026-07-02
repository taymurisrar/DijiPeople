import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { PayrollBankExportFormat } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PayrollOperationsService } from './payroll-operations.service';

@Controller('payroll/operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollOperationsController {
  constructor(private readonly operations: PayrollOperationsService) {}

  @Get('dashboard')
  @Permissions('payroll-operations.dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.operations.dashboard(user);
  }

  @Get('exceptions')
  @Permissions('payroll-exceptions.read')
  exceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.operations.exceptions(user, query);
  }

  @Get('exceptions/export')
  @Permissions('payroll-exceptions.export')
  async exportExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.exceptionExport(user, query);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Get('runs/:id/preview')
  @Permissions('payroll-runs.read')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.preview(user, id);
  }

  @Get('runs/:id/lifecycle')
  @Permissions('payroll-runs.read')
  lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.lifecycle(user, id);
  }

  @Post('runs/:id/finalize')
  @Permissions('payroll-runs.finalize')
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.finalize(user, id);
  }

  @Post('runs/:id/bank-export')
  @Permissions('payroll-bank-export.generate')
  async bankExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('format', new ParseEnumPipe(PayrollBankExportFormat))
    format: PayrollBankExportFormat,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.generateBankExport(user, id, format);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Post('runs/:id/disburse')
  @Permissions('payroll-runs.disburse')
  disburse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.markDisbursed(user, id);
  }
}
