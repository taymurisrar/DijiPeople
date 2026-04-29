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
import { CreateEmployeeLevelDto } from './dto/create-employee-level.dto';
import { ListEmployeeLevelsDto } from './dto/list-employee-levels.dto';
import { UpdateEmployeeLevelDto } from './dto/update-employee-level.dto';
import { EmployeeLevelsService } from './employee-levels.service';

@Controller('employee-levels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeLevelsController {
  constructor(private readonly employeeLevelsService: EmployeeLevelsService) {}

  @Get()
  @Permissions('employee-levels.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEmployeeLevelsDto,
  ) {
    return this.employeeLevelsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('employee-levels.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employeeLevelsService.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('employee-levels.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeLevelDto,
  ) {
    return this.employeeLevelsService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('employee-levels.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeLevelDto,
  ) {
    return this.employeeLevelsService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('employee-levels.manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employeeLevelsService.deactivate(user, id);
  }
}
