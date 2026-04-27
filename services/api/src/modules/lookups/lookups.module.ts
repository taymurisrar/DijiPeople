import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeographicLookupService } from './geographic-lookup.service';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [AuthModule],
  controllers: [LookupsController],
  providers: [LookupsService, GeographicLookupService],
  exports: [LookupsService],
})
export class LookupsModule {}
