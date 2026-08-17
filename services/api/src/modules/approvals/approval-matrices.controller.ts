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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApprovalMatricesService } from './approval-matrices.service';
import {
  CreateApprovalMatrixDto,
  ListApprovalMatricesDto,
  UpdateApprovalMatrixDto,
} from './dto/approval-matrix.dto';

@Controller('approval-matrices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalMatricesController {
  constructor(private readonly matrices: ApprovalMatricesService) {}

  @Get()
  @Permissions('approval-matrices.read')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListApprovalMatricesDto,
  ) {
    return this.matrices.list(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('approval-matrices.read')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.matrices.detail(user.tenantId, id);
  }

  @Post()
  @Permissions('approval-matrices.create')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalMatrixDto,
  ) {
    return this.matrices.create(user, dto);
  }

  @Patch(':id')
  @Permissions('approval-matrices.update')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateApprovalMatrixDto,
  ) {
    return this.matrices.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('approval-matrices.delete')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'delete')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.matrices.deactivate(user, id);
  }
}
