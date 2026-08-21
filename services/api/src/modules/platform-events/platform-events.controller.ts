import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

  /**
   * The operator's notification feed: the subset of platform events that need
   * attention, with an unread count derived from when they last opened it.
   */
  @Get('notifications')
  notifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.events.notifications(user, {
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  @Post('notifications/read')
  markNotificationsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.events.markNotificationsRead(user);
  }
}
