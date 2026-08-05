import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformMonitoringService } from './platform-monitoring.service';

@Controller('platform/logs')
@UseGuards(JwtAuthGuard)
export class PlatformMonitoringController {
  constructor(
    private readonly platformMonitoringService: PlatformMonitoringService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.platformMonitoringService.listLogs(user);
  }

  @Get('events')
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.platformMonitoringService.listEvents(user, query);
  }

  @Get('events/:traceId')
  getEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('traceId') traceId: string,
  ) {
    return this.platformMonitoringService.getEvent(user, traceId);
  }

  @Patch('events/:traceId')
  updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('traceId') traceId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.platformMonitoringService.updateEvent(user, traceId, body);
  }

  @Get('latest-error/download')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async downloadLatestError(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download =
      await this.platformMonitoringService.getLatestErrorDownload(user);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.fileName.replaceAll('"', '')}"`,
    );
    response.setHeader('Content-Length', String(download.size));
    return new StreamableFile(download.stream);
  }

  @Get(':fileName/download')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.platformMonitoringService.getDownload(
      user,
      fileName,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.fileName.replaceAll('"', '')}"`,
    );
    response.setHeader('Content-Length', String(download.size));
    return new StreamableFile(download.stream);
  }
}
