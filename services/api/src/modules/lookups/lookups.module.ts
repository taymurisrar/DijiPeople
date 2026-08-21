import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeographicLookupService } from './geographic-lookup.service';
import { ConfigurationController } from './configuration.controller';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';
import { PublicGeographyController } from './public-geography.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    LookupsController,
    ConfigurationController,
    PublicGeographyController,
  ],
  providers: [LookupsService, GeographicLookupService],
  exports: [LookupsService],
})
export class LookupsModule {}
