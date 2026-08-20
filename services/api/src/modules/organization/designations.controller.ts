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
import { constrainReferenceListQuery } from '../../common/security/reference-data-access';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { OrganizationService } from './organization.service';

@Controller('designations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DesignationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Permissions('designations.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMasterDataDto,
  ) {
    return this.organizationService.findDesignations(
      user.tenantId,
      constrainReferenceListQuery(user, query, 'designations.read'),
    );
  }

  @Get(':id')
  @Permissions('designations.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findDesignationById(user.tenantId, id);
  }

  @Post()
  @Permissions('designations.create')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDesignationDto,
  ) {
    return this.organizationService.createDesignation(user, dto);
  }

  @Patch(':id')
  @Permissions('designations.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return this.organizationService.updateDesignation(user, id, dto);
  }

  @Delete(':id')
  @Permissions('designations.update')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'manage')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.deleteDesignation(user, id);
  }
}
