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
import { CreatePolicyAssignmentDto } from './dto/create-policy-assignment.dto';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { ListPoliciesDto } from './dto/list-policies.dto';
import { UpdatePolicyAssignmentDto } from './dto/update-policy-assignment.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PoliciesService } from './policies.service';

@Controller('policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  @Permissions('policies.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPoliciesDto,
  ) {
    return this.policiesService.findAll(user.tenantId, query);
  }

  @Get('assignments')
  @Permissions('policies.read')
  findAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('policyId') policyId?: string,
  ) {
    return this.policiesService.findAssignments(user.tenantId, policyId);
  }

  @Get(':id')
  @Permissions('policies.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.policiesService.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('policies.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePolicyDto) {
    return this.policiesService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('policies.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policiesService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('policies.manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.policiesService.deactivate(user, id);
  }

  @Post('assignments')
  @Permissions('policies.manage')
  createAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePolicyAssignmentDto,
  ) {
    return this.policiesService.createAssignment(user, dto);
  }

  @Patch('assignments/:id')
  @Permissions('policies.manage')
  updateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePolicyAssignmentDto,
  ) {
    return this.policiesService.updateAssignment(user, id, dto);
  }

  @Delete('assignments/:id')
  @Permissions('policies.manage')
  deactivateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.policiesService.deactivateAssignment(user, id);
  }
}
