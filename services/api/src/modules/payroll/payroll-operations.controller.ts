import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  PayrollBankExportFormat,
  PayrollPaymentLineStatus,
} from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  PayrollOperationsService,
  type PayrollPaymentResultFile,
  type PayrollPaymentResultRow,
} from './payroll-operations.service';

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

  @Get('reports')
  @Permissions('payroll-runs.read')
  reports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.operations.reports(user, query);
  }

  @Get('reports/export')
  @Permissions('payroll-runs.read')
  async reportExport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.reportExport(user, query);
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

  @Post('runs/:id/review')
  @Permissions('payroll-runs.finalize')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.markReviewed(user, id);
  }

  @Post('runs/:id/return-to-calculation')
  @Permissions('payroll-runs.calculate')
  returnToCalculation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.returnToCalculation(user, id);
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

  @Get('runs/:id/payment-batches')
  @Permissions('payroll-runs.read')
  paymentBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.listPaymentBatches(user, id);
  }

  @Post('runs/:id/payment-batches/:exportId/submit')
  @Permissions('payroll-runs.disburse')
  submitPaymentBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ) {
    return this.operations.markPaymentBatchSubmitted(user, id, exportId);
  }

  @Post('runs/:id/payment-batches/:exportId/cancel')
  @Permissions('payroll-runs.disburse')
  cancelPaymentBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ) {
    return this.operations.cancelPaymentBatch(user, id, exportId);
  }

  @Get('runs/:id/payment-batches/:exportId/result-template')
  @Permissions('payroll-runs.disburse')
  async paymentResultTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.paymentResultTemplate(
      user,
      id,
      exportId,
    );
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Post('runs/:id/payment-batches/:exportId/import-results')
  @Permissions('payroll-runs.disburse')
  @UseInterceptors(FileInterceptor('file'))
  importPaymentResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Body() body: { rows?: PayrollPaymentResultRow[] },
    @UploadedFile() file: PayrollPaymentResultFile | undefined,
  ) {
    return this.operations.importPaymentResults(user, id, exportId, body, file);
  }

  @Post('runs/:id/payment-batches/:exportId/import-results/preview')
  @Permissions('payroll-runs.disburse')
  @UseInterceptors(FileInterceptor('file'))
  previewPaymentResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Body() body: { rows?: PayrollPaymentResultRow[] },
    @UploadedFile() file: PayrollPaymentResultFile | undefined,
  ) {
    return this.operations.previewPaymentResults(
      user,
      id,
      exportId,
      body,
      file,
    );
  }

  @Post('runs/:id/payment-batches/:exportId/retry-failed')
  @Permissions('payroll-runs.disburse')
  async retryFailedPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Body()
    body: {
      paymentLineIds?: string[];
      reason?: string;
      format?: PayrollBankExportFormat;
    },
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.retryFailedPayments(
      user,
      id,
      exportId,
      body,
    );
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Post('runs/:id/payment-lines/:lineId/reconcile')
  @Permissions('payroll-runs.disburse')
  reconcilePaymentLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body()
    body: {
      status: PayrollPaymentLineStatus;
      transactionReference?: string;
      failureReason?: string;
    },
  ) {
    return this.operations.reconcilePaymentLine(user, id, lineId, body);
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
