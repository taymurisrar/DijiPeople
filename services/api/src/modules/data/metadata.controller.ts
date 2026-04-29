import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { MetadataService } from './metadata.service';

@Controller('metadata/entities')
@UseGuards(JwtAuthGuard)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get()
  listEntities(@CurrentUser() user: AuthenticatedUser) {
    return this.metadataService.listEntities(user);
  }

  @Get(':entityLogicalName')
  getEntity(
    @Param('entityLogicalName') entityLogicalName: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getEntity(entityLogicalName, user);
  }
}
