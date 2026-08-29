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
import { setCsvDownloadHeaders } from '../../common/utils/csv-response.util';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { SubmitLeaveRequestDto } from './dto/submit-leave-request.dto';
import { LeaveService } from './leave.service';
import { AuditService } from '../audit/audit.service';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveRequestsController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly auditService: AuditService,
  ) {}

  @Get('available-types')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  availableTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getAvailableLeaveTypesForEmployee(user);
  }

  @Post()
  @Permissions('leave-requests.create')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitLeaveRequestDto,
  ) {
    return this.leaveService.submitLeaveRequest(user, dto);
  }

  // Declared before ':id'-style routes so "export" is not captured as an id.
  @Get('export')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  async exportLeaveRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveRequestQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.leaveService.exportLeaveRequests(user, query);
    setCsvDownloadHeaders(response, file.filename);
    return new StreamableFile(file.buffer);
  }

  @Get('export-template')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  exportTemplate(@Res({ passthrough: true }) response: Response) {
    const file = this.leaveService.exportLeaveRequestTemplate();
    setCsvDownloadHeaders(response, file.filename);
    return new StreamableFile(file.buffer);
  }

  @Get('mine')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.listMyLeaveRequests(user, query);
  }

  @Get('team')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.listTeamLeaveRequests(user, query);
  }

  @Get(':id')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.getLeaveRequest(user, id);
  }

  @Get(':id/timeline')
  @Permissions('leave-requests.read', 'timeline.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  async getTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.leaveService.getLeaveRequest(user, id);
    return this.auditService.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: 'LeaveRequest',
      entityId: id,
      recordHref: `/leaves/${id}`,
    });
  }

  /*
   * BUG-2015 — approving was gated on **read**, in both permission systems.
   *
   * `leave-requests.approve` and `leave-requests.reject` already existed, were
   * already mapped in the RBAC matrix and were already granted to roles. They
   * were consulted only for deciding what the dashboard and inbox *display*.
   * Withholding approve from a role hid the button and did not stop the action:
   * anyone who could read a leave request could approve it, including by
   * calling the endpoint directly.
   *
   * `cancel`, three routes below, was always correct — which is what makes this
   * a slip rather than a design.
   */
  @Post(':id/approve')
  @Permissions('leave-requests.approve')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.leaveService.approveLeaveRequest(user, id, dto);
  }

  /* BUG-2015, the other half. See the note on `approve`. */
  @Post(':id/reject')
  @Permissions('leave-requests.reject')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.leaveService.rejectLeaveRequest(user, id, dto);
  }

  @Post(':id/cancel')
  @Permissions('leave-requests.cancel')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'delete')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.leaveService.cancelLeaveRequest(user, id, dto);
  }
}
