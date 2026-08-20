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
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateTimesheetExportDto } from './dto/timesheet-export.dto';
import { TimesheetExportService } from './timesheet-export.service';

@Controller('timesheet-exports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetExportsController {
  constructor(private readonly service: TimesheetExportService) {}

  @Get()
  @Permissions('timesheets.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRequests(user);
  }

  @Post()
  @Permissions('timesheets.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTimesheetExportDto,
  ) {
    return this.service.requestExport(user, dto);
  }

  @Get(':requestId')
  @Permissions('timesheets.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.service.getRequest(user, requestId);
  }

  @Get(':requestId/download')
  @Permissions('timesheets.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.service.download(user, requestId);
    response.setHeader('Content-Type', artifact.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${artifact.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(artifact.buffer);
  }
}
