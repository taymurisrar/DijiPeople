import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PartnerInquiryStatus } from '@prisma/client';
import type { Request } from 'express';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  ActivatePartnerUserDto,
  CreatePartnerInquiryDto,
  CreatePartnerPortalReferralLinkDto,
  PartnerLeadDto,
  PartnerLoginDto,
  PartnerRefreshDto,
  ReviewPartnerInquiryDto,
  ReviewPartnerLeadDto,
  ReviewPartnerOnboardingDto,
  SubmitPartnerOnboardingDto,
} from './dto/partner-experience.dto';
import { PartnerAuthGuard, type PartnerRequest } from './partner-auth.guard';
import { PartnerExperienceService } from './partner-experience.service';

@Controller('public/partners')
@UseGuards(PublicRateLimitGuard)
export class PublicPartnersController {
  constructor(private readonly service: PartnerExperienceService) {}
  @Post('inquiries')
  inquiry(
    @Body() dto: CreatePartnerInquiryDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.submitInquiry(dto, request.requestId);
  }
  @Get('onboarding/:token')
  onboarding(@Param('token') token: string) {
    return this.service.getOnboarding(token);
  }
  @Post('onboarding/:token')
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitPartnerOnboardingDto,
    @Req() request: Request,
  ) {
    return this.service.submitOnboarding(token, dto, request.ip);
  }
  @Post('activate')
  activate(@Body() dto: ActivatePartnerUserDto) {
    return this.service.activatePortalUser(dto.token, dto.password);
  }
}

@Controller('partner-auth')
@UseGuards(PublicRateLimitGuard)
export class PartnerAuthController {
  constructor(private readonly service: PartnerExperienceService) {}
  @Post('login') login(@Body() dto: PartnerLoginDto) {
    return this.service.login(dto);
  }
  @Post('refresh') refresh(@Body() dto: PartnerRefreshDto) {
    return this.service.refresh(dto);
  }
}

@Controller('partner-portal')
@UseGuards(PartnerAuthGuard)
export class PartnerPortalController {
  constructor(private readonly service: PartnerExperienceService) {}
  @Get('me') me(@Req() request: PartnerRequest) {
    return this.service.me(request.partnerActor!);
  }
  @Get('leads') leads(@Req() request: PartnerRequest) {
    return this.service.listPartnerLeads(request.partnerActor!);
  }
  @Get('referral-links') referralLinks(@Req() request: PartnerRequest) {
    return this.service.listPartnerReferralLinks(request.partnerActor!);
  }
  @Post('referral-links') createReferralLink(
    @Req() request: PartnerRequest,
    @Body() dto: CreatePartnerPortalReferralLinkDto,
  ) {
    return this.service.createPartnerReferralLink(request.partnerActor!, dto);
  }
  @Get('contracts') contracts(@Req() request: PartnerRequest) {
    return this.service.listPartnerContracts(request.partnerActor!);
  }
  @Get('contracts/:contractId') contract(
    @Req() request: PartnerRequest,
    @Param('contractId') contractId: string,
  ) {
    return this.service.getPartnerContract(request.partnerActor!, contractId);
  }
  @Post('leads') createLead(
    @Req() request: PartnerRequest,
    @Body() dto: PartnerLeadDto,
  ) {
    return this.service.createPartnerLead(request.partnerActor!, dto);
  }
  @Patch('leads/:reviewId') updateLead(
    @Req() request: PartnerRequest,
    @Param('reviewId') reviewId: string,
    @Body() dto: PartnerLeadDto,
  ) {
    return this.service.updatePartnerLead(request.partnerActor!, reviewId, dto);
  }
  @Post('leads/:reviewId/submit') submitLead(
    @Req() request: PartnerRequest,
    @Param('reviewId') reviewId: string,
  ) {
    return this.service.submitPartnerLead(request.partnerActor!, reviewId);
  }
}

@Controller('partner-experience')
@UseGuards(JwtAuthGuard)
export class PartnerExperienceAdminController {
  constructor(private readonly service: PartnerExperienceService) {}
  @Get('inquiries') inquiries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: PartnerInquiryStatus,
  ) {
    return this.service.listInquiries(user, status);
  }
  @Post('inquiries/:id/qualify') qualify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewPartnerInquiryDto,
  ) {
    return this.service.qualifyInquiry(user, id, dto);
  }
  @Post('inquiries/:id/reject') reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewPartnerInquiryDto,
  ) {
    return this.service.rejectInquiry(user, id, dto);
  }
  @Get('onboarding') onboarding(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listOnboarding(user);
  }
  @Post('onboarding/:id/:decision') review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('decision') decision: string,
    @Body() dto: ReviewPartnerOnboardingDto,
  ) {
    if (!['approve', 'changes', 'reject'].includes(decision))
      throw new Error('Unsupported onboarding decision.');
    return this.service.reviewOnboarding(
      user,
      id,
      decision as 'approve' | 'changes' | 'reject',
      dto,
    );
  }
  @Post('partners/:id/activate') activatePartner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.activatePartner(user, id);
  }
  @Post('lead-reviews/:id/:decision') reviewLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('decision') decision: string,
    @Body() dto: ReviewPartnerLeadDto,
  ) {
    if (!['approve', 'changes', 'reject'].includes(decision))
      throw new Error('Unsupported lead review decision.');
    return this.service.reviewPartnerLead(
      user,
      id,
      decision as 'approve' | 'changes' | 'reject',
      dto,
    );
  }
}
