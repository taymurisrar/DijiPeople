import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformEventsService } from './platform-events.service';

@Controller('platform/events')
@UseGuards(JwtAuthGuard)
export class PlatformEventsController {
  constructor(private readonly events: PlatformEventsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.events.list(user, query);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.events.overview(user);
  }
}
