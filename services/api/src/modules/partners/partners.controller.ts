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
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreatePartnerCommissionDto,
  CreatePartnerDto,
  CreatePartnerReferralLinkDto,
  PartnerLifecycleActionDto,
  PartnerReferralLinkActionDto,
  PartnerQueryDto,
  UpdatePartnerCommissionDto,
  UpdatePartnerDto,
} from './dto/partner.dto';
import { PartnersService } from './partners.service';

@UseGuards(JwtAuthGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly service: PartnersService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PartnerQueryDto,
  ) {
    return this.service.listForUser(user, query);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartnerDto,
  ) {
    return this.service.createForUser(user, dto);
  }
  @Get(':partnerId') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getForUser(user, id);
  }
  @Patch(':partnerId') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.service.updateForUser(user, id, dto);
  }
  @Post(':partnerId/lifecycle')
  lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: PartnerLifecycleActionDto,
  ) {
    return this.service.lifecycleActionForUser(user, id, dto);
  }
  @Get(':partnerId/referral-links')
  async referralLinks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
  ) {
    return { items: (await this.service.getForUser(user, id)).referralLinks };
  }
  @Post(':partnerId/referral-links')
  referralLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePartnerReferralLinkDto,
  ) {
    return this.service.createReferralLinkForUser(user, id, dto);
  }
  @Post(':partnerId/referral-links/:linkId/action')
  referralLinkAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Param('linkId') linkId: string,
    @Body() dto: PartnerReferralLinkActionDto,
  ) {
    return this.service.referralLinkActionForUser(user, id, linkId, dto.action);
  }
  @Post(':partnerId/commissions') commission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePartnerCommissionDto,
  ) {
    return this.service.createCommissionForUser(user, id, dto);
  }
  @Patch(':partnerId/commissions/:commissionId') updateCommission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Param('commissionId', new ParseUUIDPipe()) commissionId: string,
    @Body() dto: UpdatePartnerCommissionDto,
  ) {
    return this.service.updateCommissionForUser(user, id, commissionId, dto);
  }
}
