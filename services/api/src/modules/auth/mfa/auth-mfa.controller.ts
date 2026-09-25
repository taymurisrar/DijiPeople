import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getAuthClientIdFromHeaders } from '../../../common/config/auth.config';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AuthService } from '../auth.service';
import {
  MfaChallengeSetupConfirmDto,
  MfaChallengeTokenDto,
  MfaChallengeVerifyDto,
  MfaCodeDto,
  MfaDisableDto,
} from './dto/mfa.dto';
import { MfaService, type MfaSubject } from './mfa.service';

/**
 * Tenant users' own MFA (ADR-0019), and the public second step of a tenant
 * sign-in.
 *
 * **Authentication only, by design.** The self-service routes carry no
 * permission decorators and sit behind `JwtAuthGuard` alone: they act on
 * `request.user` and nothing else — no route takes a user id — so the only
 * account any caller can reach is their own, and there is no permission whose
 * absence should stop a person securing their own sign-in. A tenant that turns
 * on `security.mfaRequired` needs every user, whatever their role, to be able
 * to reach these. That is why this is a controller of its own rather than
 * routes on `AuthController`, whose class-level `PermissionsGuard` makes the
 * dual-permission invariant (`wiring-invariants.spec.ts`) apply to every
 * handler; this controller is listed there as service-authorized instead.
 *
 * The public routes are authorised by a challenge token, which only a correct
 * password produces, and are rate limited per address; the real brute-force
 * control is that every wrong code counts toward the account lockout.
 */
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class AuthMfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.getStatus(tenantSubject(user));
  }

  @Post('setup')
  @HttpCode(200)
  startSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.startSetup(tenantSubject(user));
  }

  @Post('setup/confirm')
  @HttpCode(200)
  confirmSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ) {
    return this.mfaService.confirmSetup(tenantSubject(user), dto.code, {
      actorId: user.userId,
    });
  }

  @Post('recovery-codes')
  @HttpCode(200)
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ) {
    return this.mfaService.regenerateRecoveryCodes(
      tenantSubject(user),
      dto.code,
    );
  }

  @Post('disable')
  @HttpCode(200)
  disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaDisableDto) {
    return this.mfaService.disable(tenantSubject(user), dto);
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body() dto: MfaChallengeVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyTenantMfaChallenge(dto, req);
    this.authService.setAuthCookies(
      res,
      result.tokens,
      result.tokens.rememberMe,
      getAuthClientIdFromHeaders(req.headers),
    );
    return { tenant: result.tenant, user: result.user, tokens: result.tokens };
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('challenge/setup')
  @HttpCode(200)
  startChallengeSetup(@Body() dto: MfaChallengeTokenDto, @Req() req: Request) {
    return this.authService.startTenantChallengeSetup(dto, req);
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('challenge/setup/confirm')
  @HttpCode(200)
  async confirmChallengeSetup(
    @Body() dto: MfaChallengeSetupConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmTenantChallengeSetup(dto, req);
    this.authService.setAuthCookies(
      res,
      result.tokens,
      result.tokens.rememberMe,
      getAuthClientIdFromHeaders(req.headers),
    );
    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
      recoveryCodes: result.recoveryCodes,
    };
  }
}

/**
 * The signed-in tenant account. A platform operator's token reaches this
 * controller only through the admin client, and their MFA lives under
 * `/platform-users/me/mfa` — answering here would enrol a `User` row that does
 * not exist.
 */
function tenantSubject(user: AuthenticatedUser): MfaSubject {
  if (user.platform || !user.tenantId || user.tenantId === 'platform') {
    throw new ForbiddenException({
      code: 'ACCESS_DENIED',
      message:
        'Platform accounts manage two-factor authentication from the Security page.',
    });
  }
  return { kind: 'tenant', userId: user.userId, tenantId: user.tenantId };
}
