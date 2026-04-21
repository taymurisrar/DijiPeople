import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { LeaveService } from './leave.service';

@Controller('leave-policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeavePoliciesController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Permissions('leave-policies.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLeaveConfigDto,
  ) {
    return this.leaveService.findLeavePolicies(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('leave-policies.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.findLeavePolicyById(user.tenantId, id);
  }

  @Post()
  @Permissions('leave-policies.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeavePolicyDto,
  ) {
    return this.leaveService.createLeavePolicy(user, dto);
  }

  @Patch(':id')
  @Permissions('leave-policies.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.leaveService.updateLeavePolicy(user, id, dto);
  }
}
