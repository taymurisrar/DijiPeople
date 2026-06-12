import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
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
  availableTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getAvailableLeaveTypesForEmployee(user);
  }

  @Post()
  @Permissions('leave-requests.create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitLeaveRequestDto,
  ) {
    return this.leaveService.submitLeaveRequest(user, dto);
  }

  @Get('mine')
  @Permissions('leave-requests.read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.listMyLeaveRequests(user, query);
  }

  @Get('team')
  @Permissions('leave-requests.read')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.listTeamLeaveRequests(user, query);
  }

  @Get(':id')
  @Permissions('leave-requests.read')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.getLeaveRequest(user, id);
  }

  @Get(':id/timeline')
  @Permissions('leave-requests.read', 'timeline.read')
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

  @Post(':id/approve')
  @Permissions('leave-requests.read')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.leaveService.approveLeaveRequest(user, id, dto);
  }

  @Post(':id/reject')
  @Permissions('leave-requests.read')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.leaveService.rejectLeaveRequest(user, id, dto);
  }

  @Post(':id/cancel')
  @Permissions('leave-requests.cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.leaveService.cancelLeaveRequest(user, id, dto);
  }
}
