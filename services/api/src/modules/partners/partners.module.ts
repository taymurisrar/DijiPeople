import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
@Module({
  controllers: [PartnersController],
  providers: [PartnersService, JwtAuthGuard, RolesGuard],
  exports: [PartnersService],
})
export class PartnersModule {}
