import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CompensationService } from './compensation.service';
import {
  AssignSalaryPackageDto,
  CreateCompensationRevisionDto,
} from './dto/assign-salary-package.dto';
import { CreateCompensationComponentDto } from './dto/create-compensation-component.dto';
import { CreateCompensationHistoryDto } from './dto/create-compensation-history.dto';
import { UpdateCompensationComponentDto } from './dto/update-compensation-component.dto';
import { UpdateCompensationHistoryDto } from './dto/update-compensation-history.dto';

@Controller('employees/:employeeId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompensationController {
  constructor(private readonly compensationService: CompensationService) {}

  @Get('compensation-history')
  @Permissions('compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.compensationService.listHistory(user, employeeId);
  }

  @Post('compensation-history')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  createHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateCompensationHistoryDto,
  ) {
    return this.compensationService.createHistory(user, employeeId, dto);
  }

  @Post('compensation-history/assign-package')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  assignSalaryPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: AssignSalaryPackageDto,
  ) {
    return this.compensationService.assignSalaryPackage(user, employeeId, dto);
  }

  @Get('compensation-history/:id')
  @Permissions('compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.compensationService.getHistory(user, employeeId, id);
  }

  @Patch('compensation-history/:id')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  updateHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompensationHistoryDto,
  ) {
    return this.compensationService.updateHistory(user, employeeId, id, dto);
  }

  @Post('compensation-history/:id/revisions')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  createRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCompensationRevisionDto,
  ) {
    return this.compensationService.createRevision(user, employeeId, id, dto);
  }

  @Get('active-compensation')
  @Permissions('compensation.read')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'read')
  getActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.compensationService.getActive(user, employeeId);
  }

  @Post('compensation-history/:id/components')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  createComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCompensationComponentDto,
  ) {
    return this.compensationService.createComponent(user, employeeId, id, dto);
  }

  @Patch('compensation-history/:id/components/:componentId')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  updateComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('componentId', new ParseUUIDPipe()) componentId: string,
    @Body() dto: UpdateCompensationComponentDto,
  ) {
    return this.compensationService.updateComponent(
      user,
      employeeId,
      id,
      componentId,
      dto,
    );
  }

  @Delete('compensation-history/:id/components/:componentId')
  @Permissions('compensation.manage')
  @RequirePermission(ENTITY_KEYS.COMPENSATION, 'manage')
  deleteComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('componentId', new ParseUUIDPipe()) componentId: string,
  ) {
    return this.compensationService.deleteComponent(
      user,
      employeeId,
      id,
      componentId,
    );
  }
}
