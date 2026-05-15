import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin/auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto, req);

    this.authService.setAuthCookies(res, result.tokens, dto.rememberMe, 'admin');

    return {
      tenant: result.tenant,
      user: result.user,
      tokens: result.tokens,
    };
  }
}
