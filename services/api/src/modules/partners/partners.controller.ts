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
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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

@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)
@Controller('partners')
export class PartnersController {
  constructor(private readonly service: PartnersService) {}
  @Get() list(@Query() query: PartnerQueryDto) {
    return this.service.list(query);
  }
  @Post() create(@Body() dto: CreatePartnerDto) {
    return this.service.create(dto);
  }
  @Get(':partnerId') get(@Param('partnerId', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Patch(':partnerId') update(
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.service.update(id, dto);
  }
  @Post(':partnerId/lifecycle')
  lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: PartnerLifecycleActionDto,
  ) {
    return this.service.lifecycleAction(id, user.userId, dto);
  }
  @Get(':partnerId/referral-links')
  async referralLinks(@Param('partnerId', new ParseUUIDPipe()) id: string) {
    return { items: (await this.service.get(id)).referralLinks };
  }
  @Post(':partnerId/referral-links')
  referralLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePartnerReferralLinkDto,
  ) {
    return this.service.createReferralLink(id, dto, user.userId);
  }
  @Post(':partnerId/referral-links/:linkId/action')
  referralLinkAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Param('linkId') linkId: string,
    @Body() dto: PartnerReferralLinkActionDto,
  ) {
    return this.service.referralLinkAction(id, linkId, dto.action, user.userId);
  }
  @Post(':partnerId/commissions') commission(
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePartnerCommissionDto,
  ) {
    return this.service.createCommission(id, dto);
  }
  @Patch(':partnerId/commissions/:commissionId') updateCommission(
    @Param('partnerId', new ParseUUIDPipe()) id: string,
    @Param('commissionId', new ParseUUIDPipe()) commissionId: string,
    @Body() dto: UpdatePartnerCommissionDto,
  ) {
    return this.service.updateCommission(id, commissionId, dto);
  }
}
