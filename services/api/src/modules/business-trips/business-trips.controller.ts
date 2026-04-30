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
import { BusinessTripsService } from './business-trips.service';
import {
  BusinessTripActionDto,
  BusinessTripQueryDto,
  CreateBusinessTripDto,
  RejectBusinessTripDto,
  UpdateBusinessTripDto,
} from './dto/business-trip.dto';
import {
  CreateTravelAllowancePolicyDto,
  CreateTravelAllowanceRuleDto,
  UpdateTravelAllowancePolicyDto,
  UpdateTravelAllowanceRuleDto,
} from './dto/travel-allowance-policy.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BusinessTripsController {
  constructor(private readonly service: BusinessTripsService) {}

  @Post('business-trips')
  @Permissions('business-trips.create')
  createTrip(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBusinessTripDto) {
    return this.service.createTrip(user, dto);
  }

  @Get('business-trips')
  @Permissions('business-trips.read-all')
  listTrips(@CurrentUser() user: AuthenticatedUser, @Query() query: BusinessTripQueryDto) {
    return this.service.listTrips(user, query);
  }

  @Get('business-trips/:id')
  @Permissions('business-trips.read-all')
  getTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getTrip(user, id);
  }

  @Patch('business-trips/:id')
  @Permissions('business-trips.update')
  updateTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBusinessTripDto,
  ) {
    return this.service.updateTrip(user, id, dto);
  }

  @Post('business-trips/:id/submit')
  @Permissions('business-trips.update')
  submitTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.submitTrip(user, id);
  }

  @Post('business-trips/:id/approve')
  @Permissions('business-trips.approve')
  approveTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BusinessTripActionDto,
  ) {
    return this.service.approveTrip(user, id, dto);
  }

  @Post('business-trips/:id/reject')
  @Permissions('business-trips.reject')
  rejectTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectBusinessTripDto,
  ) {
    return this.service.rejectTrip(user, id, dto);
  }

  @Post('business-trips/:id/cancel')
  @Permissions('business-trips.cancel')
  cancelTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.cancelTrip(user, id);
  }

  @Post('business-trips/:id/calculate-allowance')
  @Permissions('business-trips.update')
  calculateAllowance(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.calculateTripAllowance(user, id);
  }

  @Get('me/business-trips')
  @Permissions('business-trips.read-own')
  listMyTrips(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMyTrips(user);
  }

  @Post('me/business-trips')
  @Permissions('business-trips.create')
  createMyTrip(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBusinessTripDto) {
    return this.service.createTrip(user, dto, true);
  }

  @Get('me/business-trips/:id')
  @Permissions('business-trips.read-own')
  getMyTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getTrip(user, id, true);
  }

  @Patch('me/business-trips/:id')
  @Permissions('business-trips.create')
  updateMyTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBusinessTripDto,
  ) {
    return this.service.updateTrip(user, id, dto, true);
  }

  @Post('me/business-trips/:id/submit')
  @Permissions('business-trips.create')
  submitMyTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.submitTrip(user, id, true);
  }

  @Post('me/business-trips/:id/cancel')
  @Permissions('business-trips.cancel')
  cancelMyTrip(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.cancelTrip(user, id, true);
  }

  @Post('travel-allowance-policies')
  @Permissions('tada-policies.manage')
  createPolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTravelAllowancePolicyDto) {
    return this.service.createPolicy(user, dto);
  }

  @Get('travel-allowance-policies')
  @Permissions('tada-policies.read')
  listPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPolicies(user);
  }

  @Get('travel-allowance-policies/:id')
  @Permissions('tada-policies.read')
  getPolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getPolicy(user, id);
  }

  @Patch('travel-allowance-policies/:id')
  @Permissions('tada-policies.manage')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTravelAllowancePolicyDto,
  ) {
    return this.service.updatePolicy(user, id, dto);
  }

  @Delete('travel-allowance-policies/:id')
  @Permissions('tada-policies.manage')
  deactivatePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivatePolicy(user, id);
  }

  @Post('travel-allowance-policies/:id/rules')
  @Permissions('tada-policies.manage')
  createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateTravelAllowanceRuleDto,
  ) {
    return this.service.createRule(user, id, dto);
  }

  @Patch('travel-allowance-policies/:id/rules/:ruleId')
  @Permissions('tada-policies.manage')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Body() dto: UpdateTravelAllowanceRuleDto,
  ) {
    return this.service.updateRule(user, id, ruleId, dto);
  }

  @Delete('travel-allowance-policies/:id/rules/:ruleId')
  @Permissions('tada-policies.manage')
  deactivateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
  ) {
    return this.service.deactivateRule(user, id, ruleId);
  }
}
