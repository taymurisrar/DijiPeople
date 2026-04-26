import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ExportTimesheetTemplateDto } from './dto/export-timesheet-template.dto';
import { GetMONTHLYTimesheetDto } from './dto/get-monthly-timesheet.dto';
import {
  CommitTimesheetImportDto,
  ImportTimesheetTemplateDto,
} from './dto/import-timesheet-template.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { SubmitTimesheetDto } from './dto/submit-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { UpsertTimesheetEntriesDto } from './dto/upsert-timesheet-entries.dto';
import { TimesheetsService } from './timesheets.service';

type UploadedFileShape = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('timesheets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get('mine/monthly')
  @Permissions('timesheets.read')
  getMineMONTHLY(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetMONTHLYTimesheetDto,
  ) {
    return this.timesheetsService.getMyMONTHLYTimesheet(user, query);
  }

  @Get('mine')
  @Permissions('timesheets.read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listMine(user, query);
  }

  @Get('team')
  @Permissions('timesheets.read.team')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listTeam(user, query);
  }

  @Get('team/:timesheetId')
  @Permissions('timesheets.read.team')
  getTeamTimesheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.getTeamTimesheetById(user, timesheetId);
  }

  @Patch(':timesheetId/entries')
  @Permissions('timesheets.write')
  updateEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: UpsertTimesheetEntriesDto,
  ) {
    return this.timesheetsService.updateEntries(user, timesheetId, dto);
  }

  @Post(':timesheetId/submit')
  @Permissions('timesheets.submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: SubmitTimesheetDto,
  ) {
    return this.timesheetsService.submitTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/approve')
  @Permissions('timesheets.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.approveTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/reject')
  @Permissions('timesheets.reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.rejectTimesheet(user, timesheetId, dto);
  }

  @Get('template/export')
  @Permissions('timesheets.template.export')
  async exportTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportTimesheetTemplateDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.timesheetsService.exportTimesheetTemplate(
      user,
      query,
    );
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');

    return new StreamableFile(exported.buffer);
  }

  @Post('template/import/preview')
  @Permissions('timesheets.import')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportTimesheetTemplateDto,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    return this.timesheetsService.previewTimesheetImport(user, dto, file);
  }

  @Post('template/import/commit')
  @Permissions('timesheets.import')
  commitImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommitTimesheetImportDto,
  ) {
    return this.timesheetsService.commitTimesheetImport(user, dto);
  }

  @Get(':timesheetId/export')
  @Permissions('timesheets.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.exportTimesheet(user, timesheetId);
  }
}
