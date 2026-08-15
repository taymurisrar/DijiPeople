import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LeadsService } from './leads.service';

/*
 * Rate limited like every other public surface. This endpoint is unauthenticated
 * and each accepted submission fans out an email to every active platform user
 * in the sales/admin roles, so an unthrottled caller turns one HTTP loop into
 * both unbounded Lead growth and an outbound email amplifier.
 */
@UseGuards(PublicRateLimitGuard)
@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post()
  submit(@Body() dto: SubmitLeadDto, @Req() request: RequestWithId) {
    return this.leadsService.submitLead(dto, request.requestId);
  }
}
