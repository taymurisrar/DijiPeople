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
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { CreateLeavePolicyRuleDto } from './dto/create-leave-policy-rule.dto';
import { CreateLeavePolicyAssignmentDto } from './dto/create-leave-policy-assignment.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { UpdateLeavePolicyRuleDto } from './dto/update-leave-policy-rule.dto';
import { UpdateLeavePolicyAssignmentDto } from './dto/update-leave-policy-assignment.dto';
import { LeaveService } from './leave.service';

@Controller('leave-policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeavePoliciesController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Permissions('leave-policies.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLeaveConfigDto,
  ) {
    return this.leaveService.findLeavePolicies(user.tenantId, query);
  }

  @Get('assignments')
  @Permissions('leave-policy-assignments.read')
  listAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.listLeavePolicyAssignments(user);
  }

  @Post('assignments')
  @Permissions('leave-policy-assignments.create')
  createAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeavePolicyAssignmentDto,
  ) {
    return this.leaveService.createLeavePolicyAssignment(user, dto);
  }

  @Patch('assignments/:assignmentId')
  @Permissions('leave-policy-assignments.update')
  updateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Body() dto: UpdateLeavePolicyAssignmentDto,
  ) {
    return this.leaveService.updateLeavePolicyAssignment(
      user,
      assignmentId,
      dto,
    );
  }

  @Delete('assignments/:assignmentId')
  @Permissions('leave-policy-assignments.delete')
  deleteAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.leaveService.deleteLeavePolicyAssignment(user, assignmentId);
  }

  @Get(':id')
  @Permissions('leave-policies.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leaveService.findLeavePolicyById(user.tenantId, id);
  }

  @Post()
  @Permissions('leave-policies.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeavePolicyDto,
  ) {
    return this.leaveService.createLeavePolicy(user, dto);
  }

  @Patch(':id')
  @Permissions('leave-policies.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.leaveService.updateLeavePolicy(user, id, dto);
  }

  @Get(':policyId/rules')
  @Permissions('leave-policies.read')
  listPolicyRules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
  ) {
    return this.leaveService.listLeavePolicyRules(user, policyId);
  }

  @Post(':policyId/rules')
  @Permissions('leave-policies.update')
  createPolicyRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
    @Body() dto: CreateLeavePolicyRuleDto,
  ) {
    return this.leaveService.createLeavePolicyRule(user, policyId, dto);
  }

  @Patch(':policyId/rules/:ruleId')
  @Permissions('leave-policies.update')
  updatePolicyRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateLeavePolicyRuleDto,
  ) {
    return this.leaveService.updateLeavePolicyRule(user, policyId, ruleId, dto);
  }

  @Delete(':policyId/rules/:ruleId')
  @Permissions('leave-policies.update')
  deletePolicyRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.leaveService.deleteLeavePolicyRule(user, policyId, ruleId);
  }
}
