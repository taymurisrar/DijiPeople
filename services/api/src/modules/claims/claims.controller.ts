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
import {
  CreateClaimSubTypeDto,
  CreateClaimTypeDto,
  UpdateClaimSubTypeDto,
  UpdateClaimTypeDto,
} from './dto/claim-catalog.dto';
import {
  ClaimActionDto,
  ClaimQueryDto,
  CreateClaimLineItemDto,
  CreateClaimRequestDto,
  RejectClaimDto,
  UpdateClaimLineItemDto,
  UpdateClaimRequestDto,
} from './dto/claim-request.dto';
import { ClaimsService } from './claims.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post('claims/types')
  @Permissions('claim-types.manage')
  createType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateClaimTypeDto,
  ) {
    return this.claimsService.createType(user, dto);
  }

  @Get('claims/types')
  @Permissions('claim-types.read')
  listTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.listTypes(user.tenantId);
  }

  @Get('claims/types/:id')
  @Permissions('claim-types.read')
  getType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.getType(user.tenantId, id);
  }

  @Patch('claims/types/:id')
  @Permissions('claim-types.manage')
  updateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClaimTypeDto,
  ) {
    return this.claimsService.updateType(user, id, dto);
  }

  @Delete('claims/types/:id')
  @Permissions('claim-types.manage')
  deactivateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.deactivateType(user, id);
  }

  @Post('claims/types/:claimTypeId/subtypes')
  @Permissions('claim-types.manage')
  createSubType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimTypeId', new ParseUUIDPipe()) claimTypeId: string,
    @Body() dto: CreateClaimSubTypeDto,
  ) {
    return this.claimsService.createSubType(user, claimTypeId, dto);
  }

  @Get('claims/types/:claimTypeId/subtypes')
  @Permissions('claim-types.read')
  listSubTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimTypeId', new ParseUUIDPipe()) claimTypeId: string,
  ) {
    return this.claimsService.listSubTypes(user.tenantId, claimTypeId);
  }

  @Patch('claims/subtypes/:id')
  @Permissions('claim-types.manage')
  updateSubType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClaimSubTypeDto,
  ) {
    return this.claimsService.updateSubType(user, id, dto);
  }

  @Delete('claims/subtypes/:id')
  @Permissions('claim-types.manage')
  deactivateSubType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.deactivateSubType(user, id);
  }

  @Post('claims')
  @Permissions('claims.create')
  createClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateClaimRequestDto,
  ) {
    return this.claimsService.createClaim(user, dto);
  }

  @Get('claims')
  @Permissions('claims.read-all')
  listClaims(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ClaimQueryDto,
  ) {
    return this.claimsService.listClaims(user, query);
  }

  @Get('claims/:id')
  @Permissions('claims.read-all')
  getClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.getClaim(user, id);
  }

  @Patch('claims/:id')
  @Permissions('claims.update')
  updateClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClaimRequestDto,
  ) {
    return this.claimsService.updateClaim(user, id, dto);
  }

  @Post('claims/:id/submit')
  @Permissions('claims.update')
  submitClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.submitClaim(user, id);
  }

  @Post('claims/:id/line-items')
  @Permissions('claims.update')
  addLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateClaimLineItemDto,
  ) {
    return this.claimsService.addLineItem(user, id, dto);
  }

  @Patch('claims/:id/line-items/:lineItemId')
  @Permissions('claims.update')
  updateLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineItemId', new ParseUUIDPipe()) lineItemId: string,
    @Body() dto: UpdateClaimLineItemDto,
  ) {
    return this.claimsService.updateLineItem(user, id, lineItemId, dto);
  }

  @Delete('claims/:id/line-items/:lineItemId')
  @Permissions('claims.update')
  deleteLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineItemId', new ParseUUIDPipe()) lineItemId: string,
  ) {
    return this.claimsService.deleteLineItem(user, id, lineItemId);
  }

  @Post('claims/:id/manager-approve')
  @Permissions('claims.manager-approve')
  managerApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ClaimActionDto,
  ) {
    return this.claimsService.approveManager(user, id, dto);
  }

  @Post('claims/:id/payroll-approve')
  @Permissions('claims.payroll-approve')
  payrollApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ClaimActionDto,
  ) {
    return this.claimsService.approvePayroll(user, id, dto);
  }

  @Post('claims/:id/reject')
  @Permissions('claims.reject')
  rejectClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectClaimDto,
  ) {
    return this.claimsService.rejectClaim(user, id, dto);
  }

  @Post('claims/:id/cancel')
  @Permissions('claims.cancel')
  cancelClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.cancelClaim(user, id);
  }

  @Get('me/claims')
  @Permissions('claims.read-own')
  listMyClaims(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.listMyClaims(user);
  }

  @Post('me/claims')
  @Permissions('claims.create')
  createMyClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateClaimRequestDto,
  ) {
    return this.claimsService.createClaim(user, dto, true);
  }

  @Get('me/claims/:id')
  @Permissions('claims.read-own')
  getMyClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.getClaim(user, id, true);
  }

  @Patch('me/claims/:id')
  @Permissions('claims.create')
  updateMyClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClaimRequestDto,
  ) {
    return this.claimsService.updateClaim(user, id, dto, true);
  }

  @Post('me/claims/:id/submit')
  @Permissions('claims.create')
  submitMyClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.claimsService.submitClaim(user, id, true);
  }

  @Post('me/claims/:id/line-items')
  @Permissions('claims.create')
  addMyLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateClaimLineItemDto,
  ) {
    return this.claimsService.addLineItem(user, id, dto, true);
  }

  @Patch('me/claims/:id/line-items/:lineItemId')
  @Permissions('claims.create')
  updateMyLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineItemId', new ParseUUIDPipe()) lineItemId: string,
    @Body() dto: UpdateClaimLineItemDto,
  ) {
    return this.claimsService.updateLineItem(user, id, lineItemId, dto, true);
  }

  @Delete('me/claims/:id/line-items/:lineItemId')
  @Permissions('claims.create')
  deleteMyLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineItemId', new ParseUUIDPipe()) lineItemId: string,
  ) {
    return this.claimsService.deleteLineItem(user, id, lineItemId, true);
  }
}
