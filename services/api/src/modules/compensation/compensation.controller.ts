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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CompensationService } from './compensation.service';
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
  listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.compensationService.listHistory(user, employeeId);
  }

  @Post('compensation-history')
  @Permissions('compensation.manage')
  createHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateCompensationHistoryDto,
  ) {
    return this.compensationService.createHistory(user, employeeId, dto);
  }

  @Get('compensation-history/:id')
  @Permissions('compensation.read')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.compensationService.getHistory(user, employeeId, id);
  }

  @Patch('compensation-history/:id')
  @Permissions('compensation.manage')
  updateHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompensationHistoryDto,
  ) {
    return this.compensationService.updateHistory(user, employeeId, id, dto);
  }

  @Get('active-compensation')
  @Permissions('compensation.read')
  getActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.compensationService.getActive(user, employeeId);
  }

  @Post('compensation-history/:id/components')
  @Permissions('compensation.manage')
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
