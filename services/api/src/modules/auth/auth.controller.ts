import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { InvitationStatusQueryDto } from './dto/invitation-status-query.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthService } from './auth.service';
import { getAuthCookieNames } from '../../common/config/auth.config';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

@Controller('auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req);

    this.authService.setAuthCookies(res, result.tokens, dto.rememberMe);

    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(
      dto.refreshToken ||
        (req.cookies as Record<string, string> | undefined)?.[
          getAuthCookieNames(this.configService).refresh
        ],
    );

    this.authService.setAuthCookies(res, result.tokens);

    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
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

  @Public()
  @Get('me')
  me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.getProfileFromRequest(req, res);
  }

  @Post('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.recordActivity(user);
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req, res);
    return { ok: true };
  }
}
