import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ModuleViewsController } from './module-views.controller';
import { ModuleViewsService } from './module-views.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ModuleViewsController],
  providers: [ModuleViewsService],
})
export class ModuleViewsModule {}
