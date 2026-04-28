import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CustomizationController } from './customization.controller';
import { CustomizationService } from './customization.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomizationController],
  providers: [CustomizationService],
})
export class CustomizationModule {}
