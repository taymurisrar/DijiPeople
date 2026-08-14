import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { AppReleaseController } from './app-release.controller';
import { AppReleaseService } from './app-release.service';

/**
 * Apps & downloads.
 *
 * Deliberately its own module rather than part of attendance integrations: the
 * gateway installer lives here, but so do the desktop agent and support
 * utilities, and none of them are attendance concerns.
 */
@Module({
  imports: [PrismaModule, StorageModule, AuditModule],
  controllers: [AppReleaseController],
  providers: [AppReleaseService],
  exports: [AppReleaseService],
})
export class AppReleasesModule {}
