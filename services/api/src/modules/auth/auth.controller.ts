import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { InvitationStatusQueryDto } from './dto/invitation-status-query.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.authService.setAuthCookies(res, result.tokens);

    return {
      tenant: result.tenant,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(dto.refreshToken);
    this.authService.setAuthCookies(res, result.tokens);

    return {
      tenant: result.tenant,
      user: result.user,
    };
  }

  @Public()
  @Get('invitation-status')
  invitationStatus(@Query() query: InvitationStatusQueryDto) {
    return this.authService.getInvitationStatus(query.token);
  }

  @Public()
  @Post('activate-account')
  activateAccount(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto.token, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user);
  }
}
