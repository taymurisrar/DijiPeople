import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomizationService } from './customization.service';

@Controller('runtime-metadata')
@UseGuards(JwtAuthGuard)
export class CustomizationRuntimeController {
  constructor(private readonly customizationService: CustomizationService) {}

  @Get('published')
  getPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublished(user);
  }
}
