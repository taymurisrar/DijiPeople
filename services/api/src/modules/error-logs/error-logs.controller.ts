import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
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

  @Get(':traceId')
  async getLog(@Param('traceId') traceId: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertDownloadAllowed(user);
    const log = await this.errorLogsService.findForUser(traceId, user);
    if (!log) throw new NotFoundException({ code: 'DATABASE_RECORD_NOT_FOUND', message: 'Error log not found.' });
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
    this.assertDownloadAllowed(user);
    const text = await this.errorLogsService.formatDownload(traceId, user);
    if (!text) throw new NotFoundException({ code: 'DATABASE_RECORD_NOT_FOUND', message: 'Error log not found.' });

    response.setHeader('Content-Disposition', `attachment; filename="dijipeople-error-${sanitizeFilename(traceId)}.txt"`);
    response.send(text);
  }

  private assertDownloadAllowed(user: AuthenticatedUser) {
    if (!this.errorLogsService.userCanDownload(user)) {
      throw new ForbiddenException({
        code: 'RBAC_ROLE_MISSING',
        message: 'Only System Customizer can download error logs.',
      });
    }
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 160);
}
