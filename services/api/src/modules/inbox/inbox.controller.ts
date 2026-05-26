import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { NOTIFICATION_PERMISSION_KEYS } from '../notifications/notifications.constants';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  @Permissions(NOTIFICATION_PERMISSION_KEYS.INBOX_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.inboxService.list(user, query);
  }

  @Get(':id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.INBOX_READ)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inboxService.get(user, id);
  }

  @Post(':id/open')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.INBOX_READ)
  open(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inboxService.open(user, id);
  }

  @Patch(':id')
  @Permissions(NOTIFICATION_PERMISSION_KEYS.INBOX_MARK_READ)
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.inboxService.updateStatus(user, id, body.status);
  }
}
