import { Body, Controller, Post, Req } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LeadsService } from './leads.service';

@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post()
  submit(@Body() dto: SubmitLeadDto, @Req() request: RequestWithId) {
    return this.leadsService.submitLead(dto, request.requestId);
  }
}
