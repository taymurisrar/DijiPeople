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
import { ExportTimesheetTemplateDto } from './dto/export-timesheet-template.dto';
import { TimesheetExportFormatDto } from './dto/timesheet-export.dto';
import { GetMONTHLYTimesheetDto } from './dto/get-monthly-timesheet.dto';
import {
  CommitTimesheetImportDto,
  ImportTimesheetTemplateDto,
} from './dto/import-timesheet-template.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { SubmitTimesheetDto } from './dto/submit-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { UpsertTimesheetEntriesDto } from './dto/upsert-timesheet-entries.dto';
import {
  CopyPreviousTimesheetWeekDto,
  RequestTimesheetCorrectionDto,
  SubmitTimesheetWeekDto,
  TimesheetLateSubmissionOverrideDto,
  TimesheetReopeningDecisionDto,
  TimesheetReopeningRequestDto,
  TimesheetWeekDecisionDto,
  TimesheetWeekRejectionDto,
  UpdateTimesheetWeekEntriesDto,
} from './dto/timesheet-week.dto';
import { TimesheetsService } from './timesheets.service';
import { AuditService } from '../audit/audit.service';
import { TimesheetWorkflowService } from './timesheet-workflow.service';
import { TimesheetExportService } from './timesheet-export.service';

type UploadedFileShape = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('timesheets')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.TIMESHEETS)
export class TimesheetsController {
  constructor(
    private readonly timesheetsService: TimesheetsService,
    private readonly auditService: AuditService,
    private readonly workflowService: TimesheetWorkflowService,
    private readonly exportService: TimesheetExportService,
  ) {}

  @Get('access-restriction')
  @Permissions('timesheets.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  getAccessRestriction(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowService.getAccessRestriction(user);
  }

  @Get('mine/monthly')
  @Permissions('timesheets.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  getMineMONTHLY(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetMONTHLYTimesheetDto,
  ) {
    return this.timesheetsService.getMyMONTHLYTimesheet(user, query);
  }

  @Get('mine')
  @Permissions('timesheets.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listMine(user, query);
  }

  @Get('team')
  @Permissions('timesheets.read.team')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.listTeam(user, query);
  }

  @Get('team/:timesheetId')
  @Permissions('timesheets.read.team')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  getTeamTimesheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.getTeamTimesheetById(user, timesheetId);
  }

  @Get(':timesheetId/timeline')
  @Permissions('timesheets.read', 'timeline.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  async getTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    await this.timesheetsService.getTimesheetById(user, timesheetId);
    return this.auditService.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: 'Timesheet',
      entityId: timesheetId,
      recordHref: `/timesheets/${timesheetId}`,
    });
  }

  @Get(':timesheetId')
  @Permissions('timesheets.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  getTimesheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Patch(':timesheetId/entries')
  @Permissions('timesheets.write')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  updateEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: UpsertTimesheetEntriesDto,
  ) {
    return this.timesheetsService.updateEntries(user, timesheetId, dto);
  }

  @Patch(':timesheetId/weeks/:weekId/entries')
  @Permissions('timesheets.write')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  async updateWeekEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: UpdateTimesheetWeekEntriesDto,
  ) {
    await this.workflowService.updateWeekEntries(
      user,
      timesheetId,
      weekId,
      dto,
    );
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/submit')
  @Permissions('timesheets.submit')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  async submitWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: SubmitTimesheetWeekDto,
  ) {
    await this.workflowService.submitWeek(user, timesheetId, weekId, dto);
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/late-submission-override')
  @Permissions('timesheets.override')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'manage')
  async grantLateSubmissionOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: TimesheetLateSubmissionOverrideDto,
  ) {
    await this.workflowService.grantLateSubmissionOverride(
      user,
      timesheetId,
      weekId,
      dto,
    );
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/copy-previous')
  @Permissions('timesheets.write')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  async copyPreviousWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: CopyPreviousTimesheetWeekDto,
  ) {
    const result = await this.workflowService.copyPreviousWeek(
      user,
      timesheetId,
      weekId,
      dto,
    );
    return {
      ...(await this.timesheetsService.getTimesheetById(user, timesheetId)),
      warnings: result.warnings,
    };
  }

  @Post(':timesheetId/correction')
  @Permissions('timesheets.reject')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'reject')
  async requestCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: RequestTimesheetCorrectionDto,
  ) {
    await this.workflowService.requestCorrection(user, timesheetId, dto);
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/withdraw')
  @Permissions('timesheets.withdraw')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  async withdrawWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: TimesheetWeekDecisionDto,
  ) {
    await this.workflowService.withdrawWeek(user, timesheetId, weekId, dto);
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/approve')
  @Permissions('timesheets.approve')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'approve')
  async approveWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: TimesheetWeekDecisionDto,
  ) {
    await this.workflowService.decideWeek(
      user,
      timesheetId,
      weekId,
      'APPROVED',
      dto,
    );
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Post(':timesheetId/weeks/:weekId/reject')
  @Permissions('timesheets.reject')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'reject')
  async rejectWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: TimesheetWeekRejectionDto,
  ) {
    await this.workflowService.decideWeek(
      user,
      timesheetId,
      weekId,
      'REJECTED',
      dto,
    );
    return this.timesheetsService.getTimesheetById(user, timesheetId);
  }

  @Get(':timesheetId/weeks/:weekId/approval')
  @Permissions('timesheets.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  getWeekApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
  ) {
    return this.workflowService.getApprovalTracker(user, timesheetId, weekId);
  }

  @Post(':timesheetId/weeks/:weekId/reopening-requests')
  @Permissions('timesheets.reopen')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  requestReopening(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Body() dto: TimesheetReopeningRequestDto,
  ) {
    return this.workflowService.requestReopening(
      user,
      timesheetId,
      weekId,
      dto,
    );
  }

  @Patch(':timesheetId/weeks/:weekId/reopening-requests/:requestId')
  @Permissions('timesheets.approve')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'approve')
  decideReopening(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Param('weekId', new ParseUUIDPipe()) weekId: string,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: TimesheetReopeningDecisionDto,
  ) {
    return this.workflowService.decideReopening(
      user,
      timesheetId,
      weekId,
      requestId,
      dto,
    );
  }

  @Post(':timesheetId/payroll-handoff')
  @Permissions('timesheets.payroll.handoff')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'manage')
  handoffToPayroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
  ) {
    return this.workflowService.handoffToPayroll(user, timesheetId);
  }

  @Post(':timesheetId/submit')
  @Permissions('timesheets.submit')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'write')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: SubmitTimesheetDto,
  ) {
    return this.timesheetsService.submitTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/approve')
  @Permissions('timesheets.approve')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.approveTimesheet(user, timesheetId, dto);
  }

  @Post(':timesheetId/reject')
  @Permissions('timesheets.reject')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Body() dto: ReviewTimesheetDto,
  ) {
    return this.timesheetsService.rejectTimesheet(user, timesheetId, dto);
  }

  @Get('template/export')
  @Permissions('timesheets.template.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
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
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'import')
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
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'import')
  commitImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommitTimesheetImportDto,
  ) {
    return this.timesheetsService.commitTimesheetImport(user, dto);
  }

  @Get(':timesheetId/export')
  @Permissions('timesheets.export')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'export')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('timesheetId', new ParseUUIDPipe()) timesheetId: string,
    @Query() query: TimesheetExportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.exportService.exportCurrent(
      user,
      timesheetId,
      query.format,
    );
    response.setHeader('Content-Type', artifact.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${artifact.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(artifact.buffer);
  }
}
