import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { AppReleaseController } from './app-release.controller';
import { AppReleaseService } from './app-release.service';
import { ReleasePublishTokenGuard } from './release-publish-token.guard';
import { ReleasePublisherController } from './release-publisher.controller';
import { ReleasePublisherService } from './release-publisher.service';

/**
 * Apps & downloads.
 *
 * Deliberately its own module rather than part of attendance integrations: the
 * gateway installer lives here, but so do the desktop agent and support
 * utilities, and none of them are attendance concerns.
 *
 * Two controllers, one catalogue. AppReleaseController serves tenant users
 * (list, describe, download, and platform-admin publish). ReleasePublisherController
 * serves the build pipeline. They share `ApplicationRelease` deliberately —
 * a second release catalogue for automation is exactly the duplicate source of
 * truth this repository forbids.
 */
@Module({
  imports: [PrismaModule, StorageModule, AuditModule],
  // The publisher is registered FIRST so its literal `publisher/...` paths are
  // matched before AppReleaseController's `:id` parameter routes ever see them.
  controllers: [ReleasePublisherController, AppReleaseController],
  providers: [
    AppReleaseService,
    ReleasePublisherService,
    ReleasePublishTokenGuard,
  ],
  exports: [AppReleaseService, ReleasePublisherService],
})
export class AppReleasesModule {}
