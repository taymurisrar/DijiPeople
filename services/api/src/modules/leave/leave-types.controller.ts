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
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveService } from './leave.service';

@Controller('leave-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveTypesController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Permissions('leave-types.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLeaveConfigDto,
  ) {
    return this.leaveService.findLeaveTypes(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('leave-types.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.findLeaveTypeById(user.tenantId, id);
  }

  @Post()
  @Permissions('leave-types.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveService.createLeaveType(user, dto);
  }

  @Patch(':id')
  @Permissions('leave-types.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateLeaveType(user, id, dto);
  }
}
