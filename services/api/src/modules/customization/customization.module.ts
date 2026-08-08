import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CustomizationController } from './customization.controller';
import { CustomizationRuntimeController } from './customization-runtime.controller';
import { CustomizationAccessGuard } from './customization-access.guard';
import { CustomizationService } from './customization.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomizationController, CustomizationRuntimeController],
  providers: [CustomizationService, CustomizationAccessGuard],
  exports: [CustomizationService],
})
export class CustomizationModule {}
