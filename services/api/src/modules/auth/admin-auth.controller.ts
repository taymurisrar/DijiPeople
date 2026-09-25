import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { MfaChallengeVerifyDto } from './mfa/dto/mfa.dto';
import { isMfaChallengeResponse } from './mfa/mfa-challenge';

@Controller('admin/auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('login')
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto, req);

    // ADR-0019 — a challenge, not a session: no cookie until verification.
    if (isMfaChallengeResponse(result)) {
      return result;
    }

    this.authService.setAuthCookies(
      res,
      result.tokens,
      dto.rememberMe,
      'admin',
    );

    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
    };
  }

  /**
   * Second step of a platform sign-in (ADR-0019). Public because the caller
   * holds only a challenge token, which `JwtAuthGuard` would — correctly —
   * refuse as an access token. The per-IP rate limit is a backstop; the real
   * control is that every wrong code counts toward the account lockout.
   */
  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body() dto: MfaChallengeVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyPlatformMfaChallenge(dto, req);

    this.authService.setAuthCookies(
      res,
      result.tokens,
      result.tokens.rememberMe,
      'admin',
    );

    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
    };
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestAdminPasswordReset(dto);
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetAdminPassword(dto.token, dto.password);
  }
}
