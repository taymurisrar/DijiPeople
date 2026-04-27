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
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMasterDataDto,
  ) {
    return this.organizationService.findDesignations(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('designations.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findDesignationById(user.tenantId, id);
  }

  @Post()
  @Permissions('designations.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDesignationDto,
  ) {
    return this.organizationService.createDesignation(user, dto);
  }

  @Patch(':id')
  @Permissions('designations.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return this.organizationService.updateDesignation(user, id, dto);
  }
}
