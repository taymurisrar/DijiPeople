import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto';
import { PlatformUsersService } from './platform-users.service';

@UseGuards(JwtAuthGuard)
@Controller('platform-users')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.list(user);
  }

  @Get('owner-candidates')
  listOwnerCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.listOwnerCandidates(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlatformUserDto,
  ) {
    return this.platformUsersService.create(user, dto);
  }

  @Patch(':userId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.platformUsersService.update(user, userId, dto);
  }

  @Delete(':userId')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.platformUsersService.disable(user, userId);
  }
}
