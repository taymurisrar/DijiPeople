import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PartnerDeletionService } from './partner-deletion.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
@Module({
  imports: [AuditModule],
  controllers: [PartnersController],
  providers: [PartnersService, PartnerDeletionService, JwtAuthGuard],
  exports: [PartnersService, PartnerDeletionService],
})
export class PartnersModule {}
