import { Body, Controller, Post } from '@nestjs/common';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LeadsService } from './leads.service';

@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  submit(@Body() dto: SubmitLeadDto) {
    return this.leadsService.submitLead(dto);
  }
}
