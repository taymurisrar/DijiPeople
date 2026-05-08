import {
  Body,
  Controller,
  Delete,
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
import { CreateApprovalMatrixDto } from './dto/create-approval-matrix.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { UpdateApprovalMatrixDto } from './dto/update-approval-matrix.dto';
import { LeaveService } from './leave.service';

@Controller('approval-matrices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalMatricesController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Permissions('approval-matrices.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLeaveConfigDto,
  ) {
    return this.leaveService.findApprovalMatrices(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('approval-matrices.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.findApprovalMatrixById(user.tenantId, id);
  }

  @Post()
  @Permissions('approval-matrices.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalMatrixDto,
  ) {
    return this.leaveService.createApprovalMatrix(user, dto);
  }

  @Patch(':id')
  @Permissions('approval-matrices.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateApprovalMatrixDto,
  ) {
    return this.leaveService.updateApprovalMatrix(user, id, dto);
  }

  @Delete(':id')
  @Permissions('approval-matrices.delete')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.deleteApprovalMatrix(user, id);
  }
}
