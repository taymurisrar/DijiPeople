import { Module } from '@nestjs/common';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { PlatformTeamsController } from './platform-teams.controller';
import { PlatformTeamsService } from './platform-teams.service';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';

@Module({
  controllers: [PlatformUsersController, PlatformTeamsController],
  providers: [
    PlatformUsersService,
    PlatformTeamsService,
    PlatformPermissionsGuard,
  ],
  // Exported so support-case assignment and assignment rules resolve teams
  // through one service instead of re-querying PlatformTeam.
  exports: [PlatformTeamsService],
})
export class PlatformUsersModule {}
