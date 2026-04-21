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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { OrganizationService } from './organization.service';

@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Permissions('departments.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMasterDataDto,
  ) {
    return this.organizationService.findDepartments(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('departments.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationService.findDepartmentById(user.tenantId, id);
  }

  @Post()
  @Permissions('departments.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.organizationService.createDepartment(user, dto);
  }

  @Patch(':id')
  @Permissions('departments.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.organizationService.updateDepartment(user, id, dto);
  }
}
