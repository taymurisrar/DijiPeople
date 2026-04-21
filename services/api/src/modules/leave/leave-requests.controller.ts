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

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveRequestsController {
  constructor(private readonly leaveService: LeaveService) {}

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

  @Post(':id/approve')
  @Permissions('leave-requests.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.leaveService.approveLeaveRequest(user, id, dto);
  }

  @Post(':id/reject')
  @Permissions('leave-requests.reject')
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
