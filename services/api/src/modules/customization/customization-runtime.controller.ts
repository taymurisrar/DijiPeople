import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticationOnly } from '../../common/decorators/authentication-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomizationService } from './customization.service';

@Controller('runtime-metadata')
@UseGuards(JwtAuthGuard)
export class CustomizationRuntimeController {
  constructor(private readonly customizationService: CustomizationService) {}

  /*
   * ADR-0018 self-scoped: the tenant's own published module definitions, which every
   * signed-in user needs to render the app shell. It takes no id; per-field read
   * permissions are applied to what the metadata describes, not by this route.
   */
  @Get('published')
  @AuthenticationOnly()
  getPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublished(user);
  }
}
