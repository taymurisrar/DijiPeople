import {
  Controller,
  Get,
  Header,
  Param,
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
