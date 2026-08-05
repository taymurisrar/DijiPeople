import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ErrorLogsService } from './error-logs.service';

@Controller('error-logs')
@UseGuards(JwtAuthGuard)
export class ErrorLogsController {
  constructor(private readonly errorLogsService: ErrorLogsService) {}

  @Post('client')
  async persistClientLog(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const traceId = readString(body.traceId);
    if (!traceId || !/^(client|admin)_/.test(traceId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A valid client error reference is required.',
      });
    }

    await this.errorLogsService.persist({
      traceId,
      errorCode: readString(body.errorCode) ?? 'SYSTEM_UNEXPECTED_ERROR',
      statusCode: readNumber(body.statusCode) ?? 500,
      severity: readString(body.severity) ?? 'ERROR',
      message: readString(body.message) ?? 'Client error',
      description:
        readString(body.description) ?? 'A client-side error occurred.',
      stack: readString(body.stack) ?? undefined,
      details: {
        details: body.details,
        componentStack: readString(body.componentStack),
        browserInfo: readString(body.browserInfo),
        reportedAt: readString(body.timestamp),
      },
      method: readString(body.method) ?? 'CLIENT',
      path: readString(body.path) ?? undefined,
      userAgent: readString(body.browserInfo) ?? undefined,
      userId: user.userId,
      tenantId: user.tenantId,
      organizationId: user.accessContext?.organizationId,
      businessUnitId: user.accessContext?.businessUnitId,
      clientReported: true,
    });

    return { traceId, persisted: true };
  }

  @Get(':traceId')
  async getLog(
    @Param('traceId') traceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const log = await this.errorLogsService.findForUser(traceId, user);
    if (!log)
      throw new NotFoundException({
        code: 'DATABASE_RECORD_NOT_FOUND',
        message: 'Error log not found.',
      });
    return {
      traceId: log.traceId,
      timestamp: log.createdAt,
      errorCode: log.errorCode,
      statusCode: log.statusCode,
      severity: log.severity,
      message: log.message,
      description: log.description,
      method: log.method,
      path: log.path,
      details: log.details,
    };
  }

  @Get(':traceId/download')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async downloadLog(
    @Param('traceId') traceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const text = await this.errorLogsService.formatDownload(traceId, user);
    if (!text)
      throw new NotFoundException({
        code: 'DATABASE_RECORD_NOT_FOUND',
        message: 'Error log not found.',
      });

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="dijipeople-error-${sanitizeFilename(traceId)}.txt"`,
    );
    response.send(text);
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 160);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
