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
  CreateEmployeeTaxProfileDto,
  EmployeeTaxProfileQueryDto,
  UpdateEmployeeTaxProfileDto,
} from './dto/employee-tax-profile.dto';
import {
  AddTaxRulePayComponentDto,
  CreateTaxRuleBracketDto,
  CreateTaxRuleDto,
  PreviewTaxRuleDto,
  ReorderTaxRuleBracketsDto,
  UpdateTaxRuleBracketDto,
  UpdateTaxRuleDto,
} from './dto/tax-rule.dto';
import { TaxRulesService } from './tax-rules.service';
import { EmployeeTaxProfilesService } from './employee-tax-profiles.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxRulesController {
  constructor(
    private readonly service: TaxRulesService,
    private readonly profiles: EmployeeTaxProfilesService,
  ) {}

  @Get('employee-tax-profiles')
  @Permissions('employee-tax-profiles.read')
  listProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeTaxProfileQueryDto,
  ) {
    return this.profiles.list(user, query);
  }

  @Post('employee-tax-profiles')
  @Permissions('employee-tax-profiles.manage')
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeTaxProfileDto,
  ) {
    return this.profiles.create(user, dto);
  }

  @Get('employee-tax-profiles/:id')
  @Permissions('employee-tax-profiles.read')
  getProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profiles.get(user, id);
  }

  @Patch('employee-tax-profiles/:id')
  @Permissions('employee-tax-profiles.manage')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeTaxProfileDto,
  ) {
    return this.profiles.update(user, id, dto);
  }

  @Delete('employee-tax-profiles/:id')
  @Permissions('employee-tax-profiles.manage')
  deactivateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profiles.deactivate(user, id);
  }

  @Post('tax-rules')
  @Permissions('tax-rules.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get('tax-rules')
  @Permissions('tax-rules.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Get('tax-rules/:id')
  @Permissions('tax-rules.read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get(user, id);
  }

  @Patch('tax-rules/:id')
  @Permissions('tax-rules.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete('tax-rules/:id')
  @Permissions('tax-rules.manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deactivate(user, id);
  }

  @Post('tax-rules/:id/brackets')
  @Permissions('tax-rules.manage')
  addBracket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateTaxRuleBracketDto,
  ) {
    return this.service.addBracket(user, id, dto);
  }

  @Get('tax-rules/:id/brackets')
  @Permissions('tax-rules.read')
  listBrackets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.listBrackets(user, id);
  }

  @Patch('tax-rules/:id/brackets/reorder')
  @Permissions('tax-rules.manage')
  reorderBrackets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderTaxRuleBracketsDto,
  ) {
    return this.service.reorderBrackets(user, id, dto);
  }

  @Post('tax-rules/:id/preview')
  @Permissions('tax-rules.read')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PreviewTaxRuleDto,
  ) {
    return this.service.preview(user, id, dto);
  }

  @Patch('tax-rules/:id/brackets/:bracketId')
  @Permissions('tax-rules.manage')
  updateBracket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('bracketId', new ParseUUIDPipe()) bracketId: string,
    @Body() dto: UpdateTaxRuleBracketDto,
  ) {
    return this.service.updateBracket(user, id, bracketId, dto);
  }

  @Delete('tax-rules/:id/brackets/:bracketId')
  @Permissions('tax-rules.manage')
  deleteBracket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('bracketId', new ParseUUIDPipe()) bracketId: string,
  ) {
    return this.service.deleteBracket(user, id, bracketId);
  }

  @Post('tax-rules/:id/pay-components')
  @Permissions('tax-rules.manage')
  addPayComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddTaxRulePayComponentDto,
  ) {
    return this.service.addPayComponent(user, id, dto);
  }

  @Delete('tax-rules/:id/pay-components/:payComponentId')
  @Permissions('tax-rules.manage')
  removePayComponent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('payComponentId', new ParseUUIDPipe()) payComponentId: string,
  ) {
    return this.service.removePayComponent(user, id, payComponentId);
  }
}
